// Holiday determination: weekly rule + national holidays + user overrides.
import { getDay } from 'date-fns';
import type { HolidayMaster, HolidayOverride, Settings } from '../types';
import { parseDay } from './time';

/** Indexes the holiday master + overrides for fast lookup. */
export interface HolidayContext {
  nationalByDate: Map<string, HolidayMaster>;
  overrideByDate: Map<string, HolidayOverride>;
}

export function buildHolidayContext(
  master: HolidayMaster[],
  overrides: HolidayOverride[],
): HolidayContext {
  return {
    nationalByDate: new Map(master.map((h) => [h.date, h])),
    overrideByDate: new Map(overrides.map((o) => [o.date, o])),
  };
}

/**
 * Whether a given 'YYYY-MM-DD' is a non-working (holiday) day.
 * Override always wins (add -> holiday, remove -> working).
 * Otherwise: weekend rule + national-holiday rule from settings.
 */
export function isHoliday(
  day: string,
  settings: Settings,
  ctx: HolidayContext,
): boolean {
  const override = ctx.overrideByDate.get(day);
  if (override) return override.type === 'add';

  const dow = getDay(parseDay(day)); // 0 = Sunday ... 6 = Saturday
  if (dow === 0 && settings.holidayRule.sunday) return true;
  if (dow === 6 && settings.holidayRule.saturday) return true;
  if (settings.holidayRule.nationalHoliday && ctx.nationalByDate.has(day)) {
    return true;
  }
  return false;
}

/** Reason a day is a holiday, for tagging records (§9). null if working. */
export function holidayReason(
  day: string,
  settings: Settings,
  ctx: HolidayContext,
): 'weekend' | 'national' | 'company' | null {
  const override = ctx.overrideByDate.get(day);
  if (override) return override.type === 'add' ? 'company' : null;
  const dow = getDay(parseDay(day));
  if ((dow === 0 && settings.holidayRule.sunday) || (dow === 6 && settings.holidayRule.saturday)) {
    return 'weekend';
  }
  if (settings.holidayRule.nationalHoliday && ctx.nationalByDate.has(day)) {
    return 'national';
  }
  return null;
}
