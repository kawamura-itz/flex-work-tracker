import { useEffect, useRef, useState } from 'react';

// Outlook-style time bar. Drag to select work time; tap a filled slot to punch
// out a 中抜け (a gap). Works on the same TimePair[] model as manual input.
// Window is 6:00–24:00 in 30-minute slots. (Use manual input for earlier hours
// or overnight work.)
const WIN_START = 6 * 60; // 06:00
const SLOT = 15; // 15-minute slots
const N = (24 * 60 - WIN_START) / SLOT; // 72 slots
const PER_HOUR = 60 / SLOT; // 4 slots per hour
const HOURS = (24 * 60 - WIN_START) / 60; // 18 hour columns (6:00–24:00)

interface TimePair {
  start: string;
  end: string;
}

function mm(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function tt(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function pairsToSlots(value: TimePair[]): boolean[] {
  const slots = Array<boolean>(N).fill(false);
  for (const p of value) {
    const a = Math.max(0, Math.min(N, Math.round((mm(p.start) - WIN_START) / SLOT)));
    const b = Math.max(0, Math.min(N, Math.round((mm(p.end) - WIN_START) / SLOT)));
    for (let i = a; i < b; i++) slots[i] = true;
  }
  return slots;
}

function slotsToPairs(slots: boolean[]): TimePair[] {
  const out: TimePair[] = [];
  let i = 0;
  while (i < N) {
    if (slots[i]) {
      let j = i;
      while (j < N && slots[j]) j++;
      out.push({ start: tt(WIN_START + i * SLOT), end: tt(WIN_START + j * SLOT) });
      i = j;
    } else {
      i++;
    }
  }
  return out;
}

export function TimelineSelector({
  value,
  onChange,
}: {
  value: TimePair[];
  onChange: (pairs: TimePair[]) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState<boolean[]>(() => pairsToSlots(value));
  // Source of truth updated synchronously so a tap's pointerup sees fresh data.
  const slotsRef = useRef(slots);
  const drag = useRef<{ mode: boolean } | null>(null);

  function commit(next: boolean[]) {
    slotsRef.current = next;
    setSlots(next);
  }

  // Resync from the parent when its value changes (e.g. switching input tabs).
  const valueKey = value.map((p) => `${p.start}-${p.end}`).join(',');
  useEffect(() => {
    commit(pairsToSlots(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueKey]);

  function idxFrom(clientX: number): number {
    const r = barRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(N - 1, Math.floor(((clientX - r.left) / r.width) * N)));
  }
  function paint(i: number, mode: boolean) {
    if (slotsRef.current[i] === mode) return;
    const n = [...slotsRef.current];
    n[i] = mode;
    commit(n);
  }
  function onDown(e: React.PointerEvent) {
    try {
      barRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* no active pointer (e.g. synthetic event) */
    }
    const i = idxFrom(e.clientX);
    const mode = !slotsRef.current[i];
    drag.current = { mode };
    paint(i, mode);
  }
  function onMove(e: React.PointerEvent) {
    if (!drag.current) return;
    paint(idxFrom(e.clientX), drag.current.mode);
  }
  function endDrag() {
    if (!drag.current) return;
    drag.current = null;
    onChange(slotsToPairs(slotsRef.current));
  }

  const pairs = slotsToPairs(slots);

  return (
    <div className="tl">
      <div
        className="tl-bar"
        ref={barRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {slots.map((on, i) => {
          const grid = i % PER_HOUR === 0 ? ' hour' : i % (PER_HOUR / 2) === 0 ? ' half' : '';
          return <div key={i} className={`tl-slot${on ? ' on' : ''}${grid}`} />;
        })}
      </div>
      <div className="tl-ticks">
        {Array.from({ length: HOURS }, (_, k) => (
          <span key={k} className="tl-tick">
            {6 + k}
          </span>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 6, marginBottom: 0 }}>
        {pairs.length ? pairs.map((p) => `${p.start}–${p.end}`).join(' / ') : '未選択'}
        　・　ドラッグで勤務、マスをタップで中抜け
      </p>
    </div>
  );
}
