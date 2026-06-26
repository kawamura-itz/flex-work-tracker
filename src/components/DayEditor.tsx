import { format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { deleteDay, getDay, putDay } from '../db';
import { deriveTotalMinutes } from '../domain/calc';
import { isHoliday } from '../domain/holidays';
import { fmtHM, fmtSignedHM, hoursToMinutes, parseDay } from '../domain/time';
import type { DayRecord, DayType, InputMethod, Segment, Settings } from '../types';

const TYPE_LABELS: Record<DayType, string> = {
  work: '勤務',
  paidLeave: '有給',
  halfLeave: '半休',
  holiday: '休日',
  adjustOff: '調整休み',
  absence: '欠勤',
};

const HAS_SEGMENTS: DayType[] = ['work', 'halfLeave'];

interface TimePair {
  start: string; // 'HH:mm'
  end: string; // 'HH:mm'
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Add minutes to an 'HH:mm' string, clamped to within the day. */
function addToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + minutes));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** A standard-day pair derived from the configured start time and hours. */
function standardPair(settings: Settings): TimePair {
  const stdMin = hoursToMinutes(settings.dailyStandardHours);
  const span = stdMin + (settings.breakHandling === 'auto-deduct' ? 60 : 0);
  return { start: settings.workStartTime, end: addToTime(settings.workStartTime, span) };
}

function segmentsToPairs(segments: Segment[], fallbackStart: string): TimePair[] {
  return segments
    .filter((s) => s.end)
    .map((s) => ({
      start: s.start.slice(11, 16) || fallbackStart,
      end: (s.end ?? '').slice(11, 16) || addToTime(fallbackStart, 480),
    }));
}

function pairsToSegments(date: string, pairs: TimePair[]): Segment[] {
  return pairs.map((p) => {
    const start = `${date}T${p.start}:00`;
    // Overnight: if end <= start, roll the end to the next day.
    let endDate = date;
    if (p.end <= p.start) {
      const next = new Date(parseDay(date));
      next.setDate(next.getDate() + 1);
      endDate = format(next, 'yyyy-MM-dd');
    }
    return { start, end: `${endDate}T${p.end}:00` };
  });
}

/**
 * Editor for a single day. Reused both in the calendar modal (with onClose)
 * and as a full page (without).
 */
export function DayEditor({ date, onClose }: { date: string; onClose?: () => void }) {
  const { settings, holidayCtx } = useApp();
  const holiday = isHoliday(date, settings, holidayCtx);
  const stdMin = hoursToMinutes(settings.dailyStandardHours);
  const baseStd = holiday ? 0 : stdMin; // standard contribution expected for this day

  const [type, setType] = useState<DayType>(holiday ? 'holiday' : 'work');
  const [method, setMethod] = useState<InputMethod>(
    settings.defaultInputMethod === 'timer' ? 'time' : settings.defaultInputMethod,
  );
  const [pairs, setPairs] = useState<TimePair[]>(() => [standardPair(settings)]);
  const [totalHours, setTotalHours] = useState<string>(String(settings.dailyStandardHours));
  const [note, setNote] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    void getDay(date).then((rec) => {
      if (!active) return;
      if (rec) {
        setType(rec.type);
        setMethod(rec.inputMethod === 'timer' ? 'time' : rec.inputMethod);
        const p = segmentsToPairs(rec.segments, settings.workStartTime);
        if (p.length > 0) setPairs(p);
        setTotalHours((rec.totalMinutes / 60).toString());
        setNote(rec.note ?? '');
      } else {
        setType(holiday ? 'holiday' : 'work');
        setNote('');
      }
      setLoaded(true);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const previewMinutes = useMemo(() => {
    if (!HAS_SEGMENTS.includes(type)) return 0;
    if (method === 'total') return Math.round(parseFloat(totalHours || '0') * 60);
    return deriveTotalMinutes(pairsToSegments(date, pairs), settings.breakHandling);
  }, [type, method, totalHours, pairs, date, settings.breakHandling]);

  // Contribution this record would make, and its ± impact vs the standard day.
  const contribution = useMemo(() => {
    switch (type) {
      case 'work':
        return previewMinutes;
      case 'paidLeave':
        return hoursToMinutes(settings.paidLeaveHours);
      case 'halfLeave':
        return Math.round(hoursToMinutes(settings.paidLeaveHours) / 2) + previewMinutes;
      default:
        return 0;
    }
  }, [type, previewMinutes, settings.paidLeaveHours]);
  const impact = contribution - baseStd;

  function done() {
    if (onClose) onClose();
  }

  async function save() {
    let segments: Segment[] = [];
    let totalMinutes = 0;
    if (HAS_SEGMENTS.includes(type)) {
      if (method === 'total') {
        totalMinutes = Math.round(parseFloat(totalHours || '0') * 60);
        segments = [{ start: `${date}T00:00:00`, end: `${date}T00:00:00` }];
      } else {
        segments = pairsToSegments(date, pairs);
        totalMinutes = deriveTotalMinutes(segments, settings.breakHandling);
      }
    }
    const record: DayRecord = {
      date,
      type,
      segments,
      totalMinutes,
      inputMethod: HAS_SEGMENTS.includes(type) ? method : 'total',
      note: note || undefined,
    };
    await putDay(record);
    done();
  }

  async function reset() {
    await deleteDay(date);
    done();
  }

  if (!loaded) return <div className="muted">読み込み中…</div>;

  const showSegments = HAS_SEGMENTS.includes(type);
  const impactTone = impact > 0 ? 'surplus' : impact < 0 ? 'shortfall' : 'neutral';

  return (
    <div className="day-editor">
      <div className="day-editor__head">
        <div className="page-title" style={{ margin: 0 }}>
          {format(parseDay(date), 'yyyy/M/d (E)')}
        </div>
        {onClose && (
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        )}
      </div>

      <div className="impact-readout">
        <span>この日の過不足への影響</span>
        <b className={impactTone === 'surplus' ? 'surplus' : impactTone === 'shortfall' ? 'shortfall' : ''}>
          {impact === 0 ? '±0（所定どおり）' : fmtSignedHM(impact)}
        </b>
      </div>

      <div className="card__label" style={{ marginLeft: 2 }}>区分</div>
      <div className="type-grid">
        {(Object.keys(TYPE_LABELS) as DayType[]).map((t) => (
          <button key={t} className={type === t ? 'active' : ''} onClick={() => setType(t)}>
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {type === 'paidLeave' && (
        <p className="hint">有給1日として {fmtHM(settings.paidLeaveHours * 60)} をみなし計上します。</p>
      )}
      {type === 'halfLeave' && (
        <p className="hint">
          半休 {fmtHM(Math.round((settings.paidLeaveHours * 60) / 2))} のみなし ＋ 下記の実働を計上します。
        </p>
      )}
      {(type === 'adjustOff' || type === 'absence' || type === 'holiday') && (
        <p className="hint">この日は 0時間 として計上します。</p>
      )}

      {showSegments && (
        <>
          <div className="seg-toggle">
            <button className={method === 'time' ? 'active' : ''} onClick={() => setMethod('time')}>
              時刻入力
            </button>
            <button className={method === 'total' ? 'active' : ''} onClick={() => setMethod('total')}>
              合計入力
            </button>
          </div>

          {method === 'time' ? (
            <div className="card">
              {pairs.map((p, i) => (
                <div className="inline-fields" key={i} style={{ marginBottom: 10 }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>開始</label>
                    <input
                      type="time"
                      value={p.start}
                      onChange={(e) =>
                        setPairs((ps) => ps.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))
                      }
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>終了</label>
                    <input
                      type="time"
                      value={p.end}
                      onChange={(e) =>
                        setPairs((ps) => ps.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))
                      }
                    />
                  </div>
                  {pairs.length > 1 && (
                    <button
                      className="icon-btn"
                      onClick={() => setPairs((ps) => ps.filter((_, j) => j !== i))}
                      aria-label="この時間帯を削除"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                className="btn btn--ghost btn--sm"
                onClick={() =>
                  setPairs((ps) => {
                    const last = ps[ps.length - 1];
                    const start = addToTime(last.end, 60);
                    return [...ps, { start, end: addToTime(start, 60) }];
                  })
                }
              >
                ＋ 時間帯を追加
              </button>
              <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
                昼休みや中抜けで勤務が分かれるときに追加します。
              </p>
            </div>
          ) : (
            <div className="field">
              <label>合計時間（時間・小数可）</label>
              <input
                type="number"
                step="0.25"
                min="0"
                value={totalHours}
                onChange={(e) => setTotalHours(e.target.value)}
              />
            </div>
          )}

          <p className="hint">
            この日の実働: <b>{fmtHM(previewMinutes)}</b>
            {method === 'time' && settings.breakHandling === 'auto-deduct' && '（法定休憩を自動控除）'}
          </p>
        </>
      )}

      <div className="field">
        <label>メモ</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="任意" />
      </div>

      <button className="btn" onClick={() => void save()}>
        保存
      </button>
      <button className="btn btn--ghost" onClick={() => void reset()} style={{ marginTop: 10 }}>
        所定どおりに戻す（記録を削除）
      </button>
    </div>
  );
}
