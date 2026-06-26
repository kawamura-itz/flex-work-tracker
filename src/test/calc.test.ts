import { describe, expect, it } from 'vitest';
import type { DayRecord, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { buildHolidayContext } from '../domain/holidays';
import {
  applySimulation,
  classifyDay,
  computeStatus,
  dayContributionMinutes,
  deriveTotalMinutes,
  effectiveConfirmEnd,
} from '../domain/calc';

const noHolidays: Settings = {
  ...DEFAULT_SETTINGS,
  holidayRule: { saturday: false, sunday: false, nationalHoliday: false },
};

const ctx = buildHolidayContext([], []);

function work(date: string, minutes: number): DayRecord {
  return { date, type: 'work', segments: [], totalMinutes: minutes, inputMethod: 'total' };
}

describe('deriveTotalMinutes', () => {
  const seg = (start: string, end: string) => ({ start, end });

  it('a single span subtracts the lunch break (in-to-out includes lunch)', () => {
    const segs = [seg('2026-06-01T09:00', '2026-06-01T18:00')]; // 9h gross
    expect(deriveTotalMinutes(segs, 60)).toBe(8 * 60);
  });

  it('lunch is still deducted with multiple segments; the gap (中抜け) is excluded', () => {
    // 5h + 3h = 8h in-office; gap 14:00-15:00 is 中抜け (excluded); lunch still −60
    const segs = [seg('2026-06-01T09:00', '2026-06-01T14:00'), seg('2026-06-01T15:00', '2026-06-01T18:00')];
    expect(deriveTotalMinutes(segs, 60)).toBe(7 * 60);
  });

  it('break of 0 means no deduction', () => {
    const segs = [seg('2026-06-01T09:00', '2026-06-01T16:30')]; // 7.5h
    expect(deriveTotalMinutes(segs, 0)).toBe(7 * 60 + 30);
  });

  it('handles overnight segments via date-bearing datetimes', () => {
    const segs = [seg('2026-06-01T22:00', '2026-06-02T02:30')]; // 4.5h across midnight
    expect(deriveTotalMinutes(segs, 30)).toBe(4 * 60); // 4.5h - 30m
  });

  it('never goes negative and ignores a running (open) segment', () => {
    expect(deriveTotalMinutes([{ start: '2026-06-01T09:00', end: null }], 60)).toBe(0);
  });
});

describe('dayContributionMinutes', () => {
  const s = { ...DEFAULT_SETTINGS, paidLeaveHours: 8 };
  it('work contributes its total', () => {
    expect(dayContributionMinutes(work('2026-06-01', 400), s)).toBe(400);
  });
  it('paidLeave contributes the deemed hours', () => {
    const d: DayRecord = { ...work('2026-06-01', 0), type: 'paidLeave' };
    expect(dayContributionMinutes(d, s)).toBe(480);
  });
  it('halfLeave contributes half deemed + actual segments', () => {
    const d: DayRecord = { ...work('2026-06-01', 200), type: 'halfLeave' };
    expect(dayContributionMinutes(d, s)).toBe(240 + 200);
  });
  it('holiday / adjustOff / absence contribute 0', () => {
    for (const type of ['holiday', 'adjustOff', 'absence'] as const) {
      const d: DayRecord = { ...work('2026-06-01', 999), type };
      expect(dayContributionMinutes(d, s)).toBe(0);
    }
  });
});

describe('computeStatus — §4.7 verification example', () => {
  // required 160h, dailyStd 8h, actual 95h, remaining 10 working days.
  // Manual required + all-days-working calendar reproduces the example exactly.
  const settings: Settings = {
    ...noHolidays,
    dailyStandardHours: 8,
    requiredHoursMode: 'manual',
    manualRequiredHours: 160,
  };
  const range = { id: '2026-06-01', startDate: '2026-06-01', endDate: '2026-06-30' };
  // One record on "today" holding 95h, so 06-21..06-30 = 10 remaining working days.
  const days = [work('2026-06-20', 95 * 60)];
  const status = computeStatus({ settings, range, days, ctx, today: '2026-06-20' });

  it('required = 160h', () => expect(status.requiredMinutes).toBe(160 * 60));
  it('actual = 95h', () => expect(status.actualMinutes).toBe(95 * 60));
  it('remaining working days = 10', () => expect(status.remainingWorkingDays).toBe(10));
  it('forecast = 175h', () => expect(status.forecastMinutes).toBe(175 * 60));
  it('buffer = +15h', () => expect(status.bufferMinutes).toBe(15 * 60));
  it('reducible per day = 1.5h', () => expect(status.reduciblePerDayMinutes).toBe(90));
  it('reducible today = 8h (capped)', () => expect(status.reducibleTodayMinutes).toBe(8 * 60));
});

describe('computeStatus — auto required from working days', () => {
  // 5-day period, all working, 8h/day -> required 40h.
  const settings: Settings = { ...noHolidays, dailyStandardHours: 8, requiredHoursMode: 'auto' };
  const range = { id: '2026-06-01', startDate: '2026-06-01', endDate: '2026-06-05' };
  it('required = days * 8h', () => {
    const status = computeStatus({ settings, range, days: [], ctx, today: '2026-06-01' });
    expect(status.workingDays).toBe(5);
    expect(status.requiredMinutes).toBe(40 * 60);
  });
  it('future planned record counts toward forecast, not actual', () => {
    const days = [work('2026-06-04', 600)]; // future relative to today 06-01
    const status = computeStatus({ settings, range, days, ctx, today: '2026-06-01' });
    expect(status.actualMinutes).toBe(0);
    expect(status.plannedMinutes).toBe(600);
    // remaining = 06-01,02,03,05 = 4 days (06-04 has a record)
    expect(status.remainingWorkingDays).toBe(4);
    expect(status.forecastMinutes).toBe(600 + 4 * 480);
  });
});

describe('computeStatus — shortfall framing', () => {
  const settings: Settings = {
    ...noHolidays,
    dailyStandardHours: 8,
    requiredHoursMode: 'manual',
    manualRequiredHours: 100,
  };
  const range = { id: '2026-06-01', startDate: '2026-06-01', endDate: '2026-06-10' };
  it('reports additional minutes per remaining day when short', () => {
    // today 06-10 with a tiny record -> remaining 0 except none. Use today 06-06.
    const days = [work('2026-06-01', 60)];
    const status = computeStatus({ settings, range, days, ctx, today: '2026-06-02' });
    expect(status.bufferMinutes).toBeLessThan(0);
    expect(status.additionalPerDayMinutes).not.toBeNull();
    expect(status.reducibleTodayMinutes).toBeLessThanOrEqual(0);
  });
});

describe('effectiveConfirmEnd', () => {
  it('returns null when the assumption is off', () => {
    const s = { ...noHolidays, assumeStandardForElapsed: false };
    expect(effectiveConfirmEnd(s, '2026-06-10')).toBeNull();
  });
  it('returns yesterday when the assumption is on', () => {
    const s = { ...noHolidays, assumeStandardForElapsed: true };
    expect(effectiveConfirmEnd(s, '2026-06-10')).toBe('2026-06-09');
  });
});

describe('classifyDay', () => {
  const today = '2026-06-04';
  const confEnd = '2026-06-02';
  it('records and holidays are tagged first', () => {
    expect(classifyDay('2026-06-01', true, false, today, confEnd)).toBe('record');
    expect(classifyDay('2026-06-01', false, true, today, confEnd)).toBe('holiday');
  });
  it('today and future are forecast', () => {
    expect(classifyDay('2026-06-04', false, false, today, confEnd)).toBe('forecast');
    expect(classifyDay('2026-06-09', false, false, today, confEnd)).toBe('forecast');
  });
  it('past empty days split on the confirm line', () => {
    expect(classifyDay('2026-06-02', false, false, today, confEnd)).toBe('assumed');
    expect(classifyDay('2026-06-03', false, false, today, confEnd)).toBe('unconfirmed');
  });
  it('with no confirm line, past empty days are unconfirmed', () => {
    expect(classifyDay('2026-06-01', false, false, today, null)).toBe('unconfirmed');
  });
});

describe('computeStatus — standard-hours assumption (みなし)', () => {
  const settings: Settings = { ...noHolidays, dailyStandardHours: 8, requiredHoursMode: 'auto' };
  const range = { id: '2026-06-01', startDate: '2026-06-01', endDate: '2026-06-05' };

  it('confirmed past empty days are counted as standard; on-pace with nothing logged', () => {
    // today 06-04, confirm through 06-03 -> 06-01..03 みなし, 06-04/05 remaining.
    const status = computeStatus({
      settings, range, days: [], ctx, today: '2026-06-04', confEnd: '2026-06-03',
    });
    expect(status.assumedDays).toBe(3);
    expect(status.assumedMinutes).toBe(3 * 8 * 60);
    expect(status.unconfirmedDays).toBe(0);
    expect(status.actualMinutes).toBe(3 * 8 * 60);
    expect(status.remainingWorkingDays).toBe(2);
    expect(status.forecastMinutes).toBe(40 * 60);
    expect(status.bufferMinutes).toBe(0);
  });

  it('days beyond the confirm line are unconfirmed (0) and drag the buffer down', () => {
    const status = computeStatus({
      settings, range, days: [], ctx, today: '2026-06-04', confEnd: '2026-06-01',
    });
    expect(status.assumedDays).toBe(1);
    expect(status.unconfirmedDays).toBe(2);
    expect(status.actualMinutes).toBe(8 * 60);
    expect(status.forecastMinutes).toBe((8 + 2 * 8) * 60);
    expect(status.bufferMinutes).toBe(-16 * 60);
  });

  it('a record overrides the みなし for that day', () => {
    const days: DayRecord[] = [{ ...work('2026-06-02', 0), type: 'absence' }];
    const status = computeStatus({
      settings, range, days, ctx, today: '2026-06-04', confEnd: '2026-06-03',
    });
    // 06-02 is now an explicit absence (0), so only 06-01 & 06-03 are みなし.
    expect(status.assumedDays).toBe(2);
    expect(status.actualMinutes).toBe(2 * 8 * 60);
  });

  it('logging a normal full day equals leaving it empty (buffer unchanged)', () => {
    const empty = computeStatus({
      settings, range, days: [], ctx, today: '2026-06-04', confEnd: '2026-06-03',
    });
    const logged = computeStatus({
      settings, range, days: [work('2026-06-02', 8 * 60)], ctx, today: '2026-06-04', confEnd: '2026-06-03',
    });
    expect(logged.bufferMinutes).toBe(empty.bufferMinutes);
  });
});

describe('computeStatus — working on a holiday (weekend)', () => {
  // Weekends are holidays; a work record on a Saturday should still count.
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    dailyStandardHours: 8,
    requiredHoursMode: 'auto',
    assumeStandardForElapsed: false,
    holidayRule: { saturday: true, sunday: true, nationalHoliday: false },
  };
  const range = { id: '2026-06-01', startDate: '2026-06-01', endDate: '2026-06-07' };
  it('counts the holiday work in actuals; required excludes the weekend', () => {
    const days = [work('2026-06-06', 240)]; // Saturday, 4h
    const status = computeStatus({ settings, range, days, ctx, today: '2026-06-07' });
    expect(status.workingDays).toBe(5); // Mon–Fri only
    expect(status.actualMinutes).toBe(240); // Saturday work still counted
  });
});

describe('applySimulation', () => {
  const settings: Settings = { ...noHolidays, dailyStandardHours: 8, requiredHoursMode: 'auto' };
  const range = { id: '2026-06-01', startDate: '2026-06-01', endDate: '2026-06-05' };
  it('a simulated day off drops forecast and removes a remaining day', () => {
    const base = computeStatus({ settings, range, days: [], ctx, today: '2026-06-01' });
    const simDays = applySimulation([], [{ date: '2026-06-05', kind: 'off' }]);
    const sim = computeStatus({ settings, range, days: simDays, ctx, today: '2026-06-01' });
    expect(sim.remainingWorkingDays).toBe(base.remainingWorkingDays - 1);
    expect(sim.forecastMinutes).toBe(base.forecastMinutes - 8 * 60);
    expect(sim.bufferMinutes).toBeLessThan(base.bufferMinutes);
  });
  it('a shortened day reduces forecast by the shortfall vs standard', () => {
    const simDays = applySimulation([], [{ date: '2026-06-05', kind: 'shorten', minutes: 240 }]);
    const sim = computeStatus({ settings, range, days: simDays, ctx, today: '2026-06-01' });
    // 4h instead of 8h on one day -> forecast 4*8h + 4h = 36h
    expect(sim.forecastMinutes).toBe(4 * 480 + 240);
  });
});
