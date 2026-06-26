// IndexedDB persistence via Dexie. Store names are app-specific to avoid
// collisions with other apps under the same github.io origin (§11).
import Dexie, { type Table } from 'dexie';
import {
  DEFAULT_SETTINGS,
  type BackupPayload,
  type DayRecord,
  type HolidayOverride,
  type Period,
  type Settings,
} from './types';

const SETTINGS_KEY = 'singleton';

interface SettingsRow extends Settings {
  id: string; // always SETTINGS_KEY
}

class FlexDB extends Dexie {
  settings!: Table<SettingsRow, string>;
  days!: Table<DayRecord, string>;
  periods!: Table<Period, string>;
  holidayOverrides!: Table<HolidayOverride, string>;

  constructor() {
    super('flex-work-tracker-db');
    this.version(1).stores({
      settings: 'id',
      days: 'date, type',
      periods: 'id, status',
      holidayOverrides: 'date',
    });
  }
}

export const db = new FlexDB();

// --- Settings ------------------------------------------------------------

export async function loadSettings(): Promise<Settings> {
  const row = await db.settings.get(SETTINGS_KEY);
  if (!row) return DEFAULT_SETTINGS;
  const { id: _id, ...rest } = row;
  // Merge with defaults so settings saved before a field existed still load.
  return { ...DEFAULT_SETTINGS, ...rest };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await db.settings.put({ id: SETTINGS_KEY, ...settings });
}

// --- Day records ---------------------------------------------------------

export async function putDay(day: DayRecord): Promise<void> {
  await db.days.put(day);
}

export async function deleteDay(date: string): Promise<void> {
  await db.days.delete(date);
}

export async function getDay(date: string): Promise<DayRecord | undefined> {
  return db.days.get(date);
}

export async function getDaysInRange(start: string, end: string): Promise<DayRecord[]> {
  return db.days.where('date').between(start, end, true, true).toArray();
}

// --- Holiday overrides ---------------------------------------------------

export async function putOverride(o: HolidayOverride): Promise<void> {
  await db.holidayOverrides.put(o);
}

export async function deleteOverride(date: string): Promise<void> {
  await db.holidayOverrides.delete(date);
}

// --- Periods -------------------------------------------------------------

export async function putPeriod(p: Period): Promise<void> {
  await db.periods.put(p);
}

// --- Backup (§10) --------------------------------------------------------

export async function exportAll(exportedAt: string): Promise<BackupPayload> {
  const [settings, periods, days, holidayOverrides] = await Promise.all([
    loadSettings(),
    db.periods.toArray(),
    db.days.toArray(),
    db.holidayOverrides.toArray(),
  ]);
  return { schemaVersion: 1, exportedAt, settings, periods, days, holidayOverrides };
}

export async function importAll(payload: BackupPayload): Promise<void> {
  if (payload.schemaVersion !== 1) {
    throw new Error(`未対応のスキーマバージョン: ${payload.schemaVersion}`);
  }
  await db.transaction('rw', db.settings, db.periods, db.days, db.holidayOverrides, async () => {
    await Promise.all([
      db.settings.clear(),
      db.periods.clear(),
      db.days.clear(),
      db.holidayOverrides.clear(),
    ]);
    await saveSettings(payload.settings);
    await db.periods.bulkPut(payload.periods);
    await db.days.bulkPut(payload.days);
    await db.holidayOverrides.bulkPut(payload.holidayOverrides);
  });
}

/** Ask the browser to keep our data (best-effort; §10). */
export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage?.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}
