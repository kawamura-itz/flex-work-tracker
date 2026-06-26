// Settlement-period boundaries and working-day counting. See §8.
import { addMonths, eachDayOfInterval, getDate, setDate, subDays } from 'date-fns';
import type { Settings } from '../types';
import { isHoliday, type HolidayContext } from './holidays';
import { formatDay, parseDay } from './time';

export interface PeriodRange {
  id: string; // === startDate
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD' (inclusive)
}

/**
 * The settlement period containing `referenceDay`, given the cut-off start day.
 * periodStartDay=1 -> whole calendar month. periodStartDay=16 -> 16th to 15th.
 * End is always the day before the next period's start (handles 28-31 day months).
 */
export function computePeriod(referenceDay: string, periodStartDay: number): PeriodRange {
  const ref = parseDay(referenceDay);
  let start = setDate(ref, periodStartDay); // periodStartDay <= 28, no overflow
  if (getDate(ref) < periodStartDay) {
    start = addMonths(start, -1);
  }
  const nextStart = addMonths(start, 1);
  const end = subDays(nextStart, 1);
  const startDate = formatDay(start);
  return { id: startDate, startDate, endDate: formatDay(end) };
}

/** All 'YYYY-MM-DD' dates within an inclusive range. */
export function eachDayStr(startDate: string, endDate: string): string[] {
  return eachDayOfInterval({ start: parseDay(startDate), end: parseDay(endDate) }).map(formatDay);
}

/** Count of non-holiday (scheduled working) days in the period (§4.1). */
export function countWorkingDays(
  range: PeriodRange,
  settings: Settings,
  ctx: HolidayContext,
): number {
  return eachDayStr(range.startDate, range.endDate).filter((d) => !isHoliday(d, settings, ctx))
    .length;
}
