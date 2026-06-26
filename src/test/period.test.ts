import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../types';
import { buildHolidayContext, isHoliday } from '../domain/holidays';
import { computePeriod, countWorkingDays, eachDayStr } from '../domain/period';

describe('computePeriod', () => {
  it('startDay=1 yields the whole calendar month', () => {
    const p = computePeriod('2026-06-26', 1);
    expect(p).toEqual({ id: '2026-06-01', startDate: '2026-06-01', endDate: '2026-06-30' });
  });

  it('startDay=1 handles February length', () => {
    const p = computePeriod('2026-02-15', 1);
    expect(p.endDate).toBe('2026-02-28');
  });

  it('startDay=16, reference in the second half stays in current month', () => {
    const p = computePeriod('2026-06-26', 16);
    expect(p).toEqual({ id: '2026-06-16', startDate: '2026-06-16', endDate: '2026-07-15' });
  });

  it('startDay=16, reference before cut-off rolls back a month', () => {
    const p = computePeriod('2026-06-10', 16);
    expect(p).toEqual({ id: '2026-05-16', startDate: '2026-05-16', endDate: '2026-06-15' });
  });

  it('reference exactly on the cut-off day starts a new period', () => {
    const p = computePeriod('2026-06-16', 16);
    expect(p.startDate).toBe('2026-06-16');
  });
});

describe('isHoliday', () => {
  const settings = DEFAULT_SETTINGS; // sat/sun/national all on
  const master = [{ date: '2026-05-05', name: 'こどもの日' }];

  it('treats weekends as holidays per rule', () => {
    const ctx = buildHolidayContext(master, []);
    expect(isHoliday('2026-06-27', settings, ctx)).toBe(true); // Saturday
    expect(isHoliday('2026-06-26', settings, ctx)).toBe(false); // Friday
  });

  it('treats national holidays as holidays', () => {
    const ctx = buildHolidayContext(master, []);
    expect(isHoliday('2026-05-05', settings, ctx)).toBe(true);
  });

  it('override add makes a working day a holiday', () => {
    const ctx = buildHolidayContext(master, [{ date: '2026-06-26', type: 'add' }]);
    expect(isHoliday('2026-06-26', settings, ctx)).toBe(true);
  });

  it('override remove makes a weekend a working day', () => {
    const ctx = buildHolidayContext(master, [{ date: '2026-06-27', type: 'remove' }]);
    expect(isHoliday('2026-06-27', settings, ctx)).toBe(false);
  });
});

describe('countWorkingDays', () => {
  it('counts non-holiday days across a custom period', () => {
    const settings: Settings = DEFAULT_SETTINGS;
    const ctx = buildHolidayContext([], []);
    const range = computePeriod('2026-06-10', 1); // June 2026
    const days = eachDayStr(range.startDate, range.endDate);
    const expected = days.filter((d) => !isHoliday(d, settings, ctx)).length;
    expect(countWorkingDays(range, settings, ctx)).toBe(expected);
    expect(countWorkingDays(range, settings, ctx)).toBeGreaterThan(0);
  });
});
