// Data model for the flex-time work tracker. See requirements §9.
// All durations used in business logic are computed in MINUTES internally;
// hours appear only in settings (user-facing) and at display time.

/** How the monthly required hours are determined. */
export type RequiredHoursMode = 'auto' | 'manual';

/** Input method for a day's record. */
export type InputMethod = 'timer' | 'time' | 'total';

/** Day classification. */
export type DayType =
  | 'work' // 通常勤務
  | 'holiday' // 休日（勤務なし）
  | 'paidLeave' // 全日有給
  | 'halfLeave' // 半休（みなし半日 ＋ 実働）
  | 'adjustOff' // 調整休み（0時間・所定の中で休む）
  | 'absence'; // 欠勤（0計上）

/** Why a day counts as a holiday (理由タグ). */
export type HolidayReason = 'weekend' | 'national' | 'company';

/** Global settings, currently applied. See §7. */
export interface Settings {
  /** 1日の所定労働時間（時間） */
  dailyStandardHours: number;
  requiredHoursMode: RequiredHoursMode;
  /** manual時のみ使用（時間）。autoのときは null。 */
  manualRequiredHours: number | null;
  /** 清算期間の起算日（締め日）。1〜28推奨。 */
  periodStartDay: number;
  holidayRule: {
    saturday: boolean;
    sunday: boolean;
    nationalHoliday: boolean;
  };
  /** 有給1日のみなし時間（時間）。通常は dailyStandardHours と同じ。 */
  paidLeaveHours: number;
  /**
   * 昼休みなどの休憩（分）。在社時間（開始〜終了の1本）からこの分を差し引いて
   * 実働を出す。時間帯を複数に分けて入力した場合は、間が休憩とみなされるので
   * この控除は行わない。0 なら控除なし。
   */
  breakMinutes: number;
  defaultInputMethod: InputMethod;
  /** 既定の勤務開始時刻（'HH:mm'）。入力時の初期値に使う。 */
  workStartTime: string;
  /**
   * 未記録の過去平日を所定時間（みなし）として実績に算入するか。
   * ON のとき、昨日までの未記録平日は自動でみなし。今日・未来は見込み。
   * 仮/確定の区別は設けず、記録はいつでも編集できる。
   */
  assumeStandardForElapsed: boolean;
}

/** A national holiday from the bundled Cabinet Office dataset. */
export interface HolidayMaster {
  date: string; // 'YYYY-MM-DD'
  name: string;
}

/** A user override of the holiday calendar. */
export interface HolidayOverride {
  date: string; // 'YYYY-MM-DD'
  type: 'add' | 'remove'; // 休日にする / 休日から外す
  label?: string;
}

/** A single work interval within a day. */
export interface Segment {
  start: string; // ISO datetime (date-bearing, for overnight work)
  end: string | null; // null while a timer is running
}

/** A single day's record. Keyed by date. */
export interface DayRecord {
  date: string; // 'YYYY-MM-DD' (primary key)
  type: DayType;
  holidayReason?: HolidayReason; // when type === 'holiday'
  segments: Segment[]; // actual work; a 'total' input becomes one segment
  totalMinutes: number; // derived: sum after break handling
  inputMethod: InputMethod;
  note?: string;
}

/** A settlement period (清算期間). See §8. */
export interface Period {
  id: string; // start date in ISO, e.g. '2026-06-01'
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD' (inclusive)
  status: 'active' | 'closed';
  /** Frozen on close so later settings changes don't retro-edit history. */
  snapshot?: {
    requiredMinutes: number;
    workingDays: number;
    dailyStandardHours: number;
    actualMinutes: number; // 確定時の累計実績
  };
}

/** Default settings used on first run. */
export const DEFAULT_SETTINGS: Settings = {
  dailyStandardHours: 8,
  requiredHoursMode: 'auto',
  manualRequiredHours: null,
  periodStartDay: 1,
  holidayRule: { saturday: true, sunday: true, nationalHoliday: true },
  paidLeaveHours: 8,
  breakMinutes: 60,
  defaultInputMethod: 'time',
  workStartTime: '09:00',
  assumeStandardForElapsed: true,
};

/** Shape of the full JSON export/import payload (§10). */
export interface BackupPayload {
  schemaVersion: 1;
  exportedAt: string; // ISO datetime
  settings: Settings;
  periods: Period[];
  days: DayRecord[];
  holidayOverrides: HolidayOverride[];
}
