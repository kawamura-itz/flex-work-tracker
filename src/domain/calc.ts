// Core calculation engine. See requirements §4. All values in minutes.
import type { BreakHandling, DayRecord, Segment, Settings } from '../types';
import { isHoliday, type HolidayContext } from './holidays';
import { eachDayStr, type PeriodRange } from './period';
import { addDaysStr, hoursToMinutes, segmentMinutes, statutoryBreakMinutes } from './time';

/**
 * Up to which date empty past weekdays are assumed standard (みなし).
 * - assumption off -> null (empty past days count as 0; log everything)
 * - assumption on  -> yesterday (today & future are 見込み, not みなし)
 * No tentative/confirmed split: records are editable at any time.
 */
export function effectiveConfirmEnd(settings: Settings, today: string): string | null {
  if (!settings.assumeStandardForElapsed) return null;
  return addDaysStr(today, -1);
}

/** Classification of a single day for display (history tagging). */
export type DayKind = 'record' | 'assumed' | 'unconfirmed' | 'forecast' | 'holiday';

/** Classify a date given records, holiday calendar, and the confirm cursor. */
export function classifyDay(
  date: string,
  hasRecord: boolean,
  holiday: boolean,
  today: string,
  confEnd: string | null,
): DayKind {
  if (hasRecord) return 'record';
  if (holiday) return 'holiday';
  if (date >= today) return 'forecast';
  // past, empty, working day:
  if (confEnd && date <= confEnd) return 'assumed';
  return 'unconfirmed';
}

/**
 * Net worked minutes derived from segments, honouring break handling.
 * Use for 'timer' and 'time' input methods. ('total' stores its value directly.)
 */
export function deriveTotalMinutes(segments: Segment[], breakHandling: BreakHandling): number {
  const gross = segments.reduce((sum, s) => sum + segmentMinutes(s.start, s.end), 0);
  if (breakHandling === 'auto-deduct') {
    return Math.max(0, gross - statutoryBreakMinutes(gross));
  }
  return gross;
}

/** Minutes a single day's record contributes toward the required total (§4.2). */
export function dayContributionMinutes(day: DayRecord, settings: Settings): number {
  switch (day.type) {
    case 'work':
      return day.totalMinutes;
    case 'paidLeave':
      return hoursToMinutes(settings.paidLeaveHours);
    case 'halfLeave':
      // みなし半日 ＋ その日の実働セグメント合計
      return Math.round(hoursToMinutes(settings.paidLeaveHours) / 2) + day.totalMinutes;
    case 'holiday':
    case 'adjustOff':
    case 'absence':
      return 0;
  }
}

export interface StatusInput {
  settings: Settings;
  range: PeriodRange;
  days: DayRecord[];
  ctx: HolidayContext;
  today: string; // 'YYYY-MM-DD'
  /**
   * Confirm cursor for the standard-hours assumption (see effectiveConfirmEnd).
   * Omit / null to disable the assumption (empty past days count as 0).
   */
  confEnd?: string | null;
}

export interface Status {
  requiredMinutes: number;
  workingDays: number; // total scheduled working days in the period
  actualMinutes: number; // record contributions (<= today) + assumed standard days
  plannedMinutes: number; // contributions of future records (date > today)
  remainingWorkingDays: number; // future non-holiday days without a record
  elapsedWorkingDays: number; // scheduled working days from start..today
  assumedDays: number; // empty past working days counted as standard (みなし)
  assumedMinutes: number; // minutes contributed by assumed days
  unconfirmedDays: number; // empty past working days beyond the confirm line (0 扱い)
  forecastMinutes: number;
  bufferMinutes: number; // >0 surplus (青) / <0 shortfall (赤)
  reduciblePerDayMinutes: number | null; // null when no remaining working days
  reducibleTodayMinutes: number; // min(buffer, dailyStd); <=0 => not reducible
  additionalPerDayMinutes: number | null; // when buffer<0: extra needed per remaining day
}

/**
 * Compute the full status snapshot for a period.
 * forecast generalises §4.4 to also include the contribution of any future
 * records already entered (planned leave / shortened days), so logging a future
 * paid-leave day doesn't silently drop it from the forecast.
 */
export function computeStatus(input: StatusInput): Status {
  const { settings, range, days, ctx, today } = input;
  const confEnd = input.confEnd ?? null;
  const dailyStdMin = hoursToMinutes(settings.dailyStandardHours);

  // Scheduled working days in the whole period.
  const allDays = eachDayStr(range.startDate, range.endDate);
  const workingDays = allDays.filter((d) => !isHoliday(d, settings, ctx)).length;

  const requiredMinutes =
    settings.requiredHoursMode === 'manual'
      ? hoursToMinutes(settings.manualRequiredHours ?? 0)
      : dailyStdMin * workingDays;

  // Records that fall within this period, indexed by date.
  const inRange = days.filter((d) => d.date >= range.startDate && d.date <= range.endDate);
  const recordByDate = new Map(inRange.map((d) => [d.date, d]));

  let actualMinutes = 0;
  let plannedMinutes = 0;
  for (const d of inRange) {
    const c = dayContributionMinutes(d, settings);
    if (d.date <= today) actualMinutes += c;
    else plannedMinutes += c;
  }

  // Remaining working days: [today, end] ∩ non-holiday ∩ no record.
  let remainingWorkingDays = 0;
  const iterStart = today < range.startDate ? range.startDate : today;
  if (today <= range.endDate) {
    for (const d of eachDayStr(iterStart, range.endDate)) {
      if (!isHoliday(d, settings, ctx) && !recordByDate.has(d)) remainingWorkingDays += 1;
    }
  }

  // Past empty working days: either みなし (assumed standard) up to the confirm
  // line, or unconfirmed (counted as 0) beyond it.
  let assumedDays = 0;
  let unconfirmedDays = 0;
  for (const d of allDays) {
    if (d >= today) continue;
    if (isHoliday(d, settings, ctx) || recordByDate.has(d)) continue;
    if (confEnd && d <= confEnd) assumedDays += 1;
    else unconfirmedDays += 1;
  }
  const assumedMinutes = assumedDays * dailyStdMin;
  actualMinutes += assumedMinutes;

  // Context: scheduled working days already elapsed (start..today).
  let elapsedWorkingDays = 0;
  if (today >= range.startDate) {
    const upto = today > range.endDate ? range.endDate : today;
    elapsedWorkingDays = eachDayStr(range.startDate, upto).filter(
      (d) => !isHoliday(d, settings, ctx),
    ).length;
  }

  const forecastMinutes = actualMinutes + plannedMinutes + remainingWorkingDays * dailyStdMin;
  const bufferMinutes = forecastMinutes - requiredMinutes;

  const reduciblePerDayMinutes =
    remainingWorkingDays > 0 ? bufferMinutes / remainingWorkingDays : null;
  const reducibleTodayMinutes = Math.min(bufferMinutes, dailyStdMin);
  const additionalPerDayMinutes =
    bufferMinutes < 0 && remainingWorkingDays > 0 ? -bufferMinutes / remainingWorkingDays : null;

  return {
    requiredMinutes,
    workingDays,
    actualMinutes,
    plannedMinutes,
    remainingWorkingDays,
    elapsedWorkingDays,
    assumedDays,
    assumedMinutes,
    unconfirmedDays,
    forecastMinutes,
    bufferMinutes,
    reduciblePerDayMinutes,
    reducibleTodayMinutes,
    additionalPerDayMinutes,
  };
}

// --- Simulation overlay (§4.6) -------------------------------------------

export type SimPlan =
  | { date: string; kind: 'off' } // 調整休み（0時間）
  | { date: string; kind: 'shorten'; minutes: number }; // 短縮（実働minutes）

/**
 * Overlay tentative future plans onto the real records, returning a merged list
 * suitable for computeStatus. A plan replaces any existing record on that date.
 */
export function applySimulation(days: DayRecord[], plans: SimPlan[]): DayRecord[] {
  const planMap = new Map(plans.map((p) => [p.date, p]));
  const merged: DayRecord[] = days.filter((d) => !planMap.has(d.date));
  for (const p of plans) {
    if (p.kind === 'off') {
      merged.push({
        date: p.date,
        type: 'adjustOff',
        segments: [],
        totalMinutes: 0,
        inputMethod: 'total',
      });
    } else {
      merged.push({
        date: p.date,
        type: 'work',
        segments: [{ start: p.date + 'T00:00:00', end: p.date + 'T00:00:00' }],
        totalMinutes: p.minutes,
        inputMethod: 'total',
      });
    }
  }
  return merged;
}
