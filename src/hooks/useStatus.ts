// Reactive status for the current period (recomputes when days/settings change).
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { useApp } from '../state/AppContext';
import { getDaysInRange } from '../db';
import { computeStatus, type Status } from '../domain/calc';
import type { DayRecord } from '../types';

export function usePeriodDays(): DayRecord[] {
  const { period } = useApp();
  return (
    useLiveQuery(
      () => getDaysInRange(period.startDate, period.endDate),
      [period.startDate, period.endDate],
    ) ?? []
  );
}

export function useStatus(): { status: Status; days: DayRecord[] } {
  const { settings, holidayCtx, today, period } = useApp();
  const days = usePeriodDays();
  const status = useMemo(
    () => computeStatus({ settings, range: period, days, ctx: holidayCtx, today }),
    [settings, period, days, holidayCtx, today],
  );
  return { status, days };
}
