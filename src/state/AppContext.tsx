// App-wide state: settings, holiday calendar, current period, and "today".
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { HolidayMaster, Settings } from '../types';
import { db, loadSettings, requestPersistentStorage, saveSettings } from '../db';
import { buildHolidayContext, type HolidayContext } from '../domain/holidays';
import { computePeriod, type PeriodRange } from '../domain/period';
import { todayStr } from '../domain/time';

interface AppState {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  holidayCtx: HolidayContext;
  holidayMaster: HolidayMaster[];
  today: string;
  period: PeriodRange;
  ready: boolean;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [holidayMaster, setHolidayMaster] = useState<HolidayMaster[]>([]);
  const [today, setToday] = useState<string>(() => todayStr());

  const overrides = useLiveQuery(() => db.holidayOverrides.toArray(), [], []);

  // Initial load: settings, holiday master, persistent-storage request.
  useEffect(() => {
    void loadSettings().then(setSettings);
    void requestPersistentStorage();
    fetch(`${import.meta.env.BASE_URL}holidays.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: HolidayMaster[]) => setHolidayMaster(data))
      .catch(() => setHolidayMaster([]));
  }, []);

  // Keep "today" fresh if the app is left open across midnight.
  useEffect(() => {
    const id = setInterval(() => setToday(todayStr()), 60_000);
    return () => clearInterval(id);
  }, []);

  const holidayCtx = useMemo(
    () => buildHolidayContext(holidayMaster, overrides ?? []),
    [holidayMaster, overrides],
  );

  const period = useMemo(
    () => (settings ? computePeriod(today, settings.periodStartDay) : computePeriod(today, 1)),
    [settings, today],
  );

  const updateSettings = async (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...(prev as Settings), ...patch };
      void saveSettings(next);
      return next;
    });
  };

  const value: AppState | null = settings
    ? { settings, updateSettings, holidayCtx, holidayMaster, today, period, ready: true }
    : null;

  if (!value) {
    return <div className="loading">読み込み中…</div>;
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used within AppProvider');
  return v;
}
