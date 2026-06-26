// Work timer. The running state lives in today's DayRecord as an open segment
// (end === null), so closing/reopening the page restores it automatically (§5, §9).
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../state/AppContext';
import { getDay, putDay } from '../db';
import { deriveTotalMinutes } from '../domain/calc';
import { segmentMinutes } from '../domain/time';
import type { DayRecord, Segment } from '../types';

function nowLocalISO(): string {
  return format(new Date(), "yyyy-MM-dd'T'HH:mm:ss");
}

function recompute(record: DayRecord, settings: { breakHandling: 'auto-deduct' | 'gap' }): DayRecord {
  return { ...record, totalMinutes: deriveTotalMinutes(record.segments, settings.breakHandling) };
}

export function useTimer() {
  const { today, settings } = useApp();
  const record = useLiveQuery(() => getDay(today), [today]);
  const [tick, setTick] = useState(0);

  const openSegment = record?.segments.find((s) => s.end === null) ?? null;
  const running = openSegment !== null;

  // Re-render every second while running so the live elapsed updates.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  void tick;

  const finalizedMinutes = record?.totalMinutes ?? 0;
  const liveOpenMinutes = openSegment
    ? segmentMinutes(openSegment.start, nowLocalISO())
    : 0;
  const liveTotalMinutes = finalizedMinutes + liveOpenMinutes;

  async function start() {
    const base: DayRecord = record ?? {
      date: today,
      type: 'work',
      segments: [],
      totalMinutes: 0,
      inputMethod: 'timer',
    };
    if (base.segments.some((s) => s.end === null)) return; // already running
    const seg: Segment = { start: nowLocalISO(), end: null };
    const next: DayRecord = {
      ...base,
      type: base.type === 'work' || base.type === 'halfLeave' ? base.type : 'work',
      inputMethod: 'timer',
      segments: [...base.segments, seg],
    };
    await putDay(next);
  }

  async function stop() {
    if (!record) return;
    const end = nowLocalISO();
    const segments = record.segments.map((s) => (s.end === null ? { ...s, end } : s));
    await putDay(recompute({ ...record, segments }, settings));
  }

  return { record, running, liveTotalMinutes, liveOpenMinutes, start, stop };
}
