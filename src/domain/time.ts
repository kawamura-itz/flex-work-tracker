// Time helpers. Business logic works in minutes; these convert and format.
import { differenceInMinutes, format, parseISO } from 'date-fns';

/** Parse a 'YYYY-MM-DD' string as a local-midnight Date. */
export function parseDay(day: string): Date {
  return parseISO(day + 'T00:00:00');
}

/** Format a Date as a local 'YYYY-MM-DD' string. */
export function formatDay(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** Today's local date as 'YYYY-MM-DD'. */
export function todayStr(now: Date = new Date()): string {
  return format(now, 'yyyy-MM-dd');
}

export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

export function minutesToHours(minutes: number): number {
  return minutes / 60;
}

/** Duration of a single segment in minutes. Running segments (end null) are 0. */
export function segmentMinutes(start: string, end: string | null): number {
  if (!end) return 0;
  return Math.max(0, differenceInMinutes(parseISO(end), parseISO(start)));
}

/** Statutory break deducted from gross worked minutes (auto-deduct mode). */
export function statutoryBreakMinutes(grossMinutes: number): number {
  if (grossMinutes > 8 * 60) return 60;
  if (grossMinutes > 6 * 60) return 45;
  return 0;
}

/**
 * Format minutes as a compact "8h30m" / "8h" / "30m" string.
 * Negative values keep the sign.
 */
export function fmtHM(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h${m}m`;
}

/** Format minutes as signed "+8h30m" / "-1h" for buffer display. */
export function fmtSignedHM(minutes: number): string {
  const r = Math.round(minutes);
  if (r === 0) return '±0';
  return (r > 0 ? '+' : '') + fmtHM(r);
}

/** Format minutes as decimal hours, e.g. 90 -> "1.5h". */
export function fmtDecimalHours(minutes: number): string {
  const h = minutes / 60;
  const rounded = Math.round(h * 10) / 10;
  return `${rounded}h`;
}
