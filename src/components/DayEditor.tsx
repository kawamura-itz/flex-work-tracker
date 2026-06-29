import { format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { deleteDay, getDay, putDay } from '../db';
import { deriveTotalMinutes, workedBreakdown } from '../domain/calc';
import { isHoliday } from '../domain/holidays';
import { fmtHM, fmtSignedHM, hoursToMinutes, parseDay } from '../domain/time';
import { TimelineSelector } from './TimelineSelector';
import type { DayRecord, DayType, InputMethod, Segment, Settings } from '../types';

/** Which sub-editor is shown for a work/half day. */
type EditMode = 'bar' | 'time' | 'total';
function toMode(m: InputMethod): EditMode {
  return m === 'total' ? 'total' : m === 'time' ? 'time' : 'bar';
}

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

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Add minutes to an 'HH:mm' string, clamped to within the day. */
function addToTime(time: string, minutes: number): string {
  const total = Math.min(23 * 60 + 59, Math.max(0, timeToMin(time) + minutes));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/**
 * Default work day: the configured hours with the lunch carved out at the
 * configured window (e.g. 09:00–12:00 / 13:00–18:00). Worked time = standard.
 */
function standardPairs(settings: Settings): TimePair[] {
  const stdMin = hoursToMinutes(settings.dailyStandardHours);
  const ws = settings.workStartTime;
  const lunch = settings.breakMinutes;
  const morning = timeToMin(settings.lunchStart) - timeToMin(ws);
  if (lunch <= 0 || morning <= 0 || morning >= stdMin) {
    // No lunch window in range → single span that includes the break.
    return [{ start: ws, end: addToTime(ws, stdMin + Math.max(0, lunch)) }];
  }
  const lunchEnd = addToTime(settings.lunchStart, lunch);
  return [
    { start: ws, end: settings.lunchStart },
    { start: lunchEnd, end: addToTime(lunchEnd, stdMin - morning) },
  ];
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
  // New days always open in the bar; existing records open in how they were entered.
  const [mode, setMode] = useState<EditMode>('bar');
  const [pairs, setPairs] = useState<TimePair[]>(() => standardPairs(settings));
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
        setMode(toMode(rec.inputMethod));
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

  // Half-day work has no lunch break; full work days use the lunch requirement.
  const effectiveBreak = type === 'halfLeave' ? 0 : settings.breakMinutes;

  const breakdown = useMemo(() => {
    if (!HAS_SEGMENTS.includes(type) || mode === 'total') return null;
    return workedBreakdown(pairsToSegments(date, pairs), effectiveBreak);
  }, [type, mode, pairs, date, effectiveBreak]);

  const previewMinutes = useMemo(() => {
    if (!HAS_SEGMENTS.includes(type)) return 0;
    if (mode === 'total') return Math.round(parseFloat(totalHours || '0') * 60);
    return breakdown ? breakdown.worked : 0;
  }, [type, mode, totalHours, breakdown]);

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
      if (mode === 'total') {
        totalMinutes = Math.round(parseFloat(totalHours || '0') * 60);
        segments = [{ start: `${date}T00:00:00`, end: `${date}T00:00:00` }];
      } else {
        segments = pairsToSegments(date, pairs);
        totalMinutes = deriveTotalMinutes(segments, effectiveBreak);
      }
    }
    const record: DayRecord = {
      date,
      type,
      segments,
      totalMinutes,
      inputMethod: HAS_SEGMENTS.includes(type) ? (mode === 'total' ? 'total' : mode === 'bar' ? 'bar' : 'time') : 'total',
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

      <div className="type-row">
        <button
          className={`type-main ${type === 'work' ? 'active' : ''}`}
          onClick={() => setType('work')}
        >
          勤務
        </button>
        <select
          className="type-select"
          value={type === 'work' ? '' : type}
          onChange={(e) => setType((e.target.value || 'work') as DayType)}
        >
          <option value="">有給・休みなど…</option>
          {(['paidLeave', 'halfLeave', 'holiday', 'adjustOff', 'absence'] as DayType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
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
            <button className={mode === 'bar' ? 'active' : ''} onClick={() => setMode('bar')}>
              バー選択
            </button>
            <button className={mode === 'time' ? 'active' : ''} onClick={() => setMode('time')}>
              時刻入力
            </button>
            <button className={mode === 'total' ? 'active' : ''} onClick={() => setMode('total')}>
              合計入力
            </button>
          </div>

          {mode === 'bar' && (
            <div className="card">
              <TimelineSelector value={pairs} onChange={setPairs} />
            </div>
          )}

          {mode === 'time' && (
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
                中抜け（外出・離席）があるときに時間帯を分けます。昼休みは自動で差し引かれるので分ける必要はありません。
              </p>
            </div>
          )}

          {mode === 'total' && (
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
            {breakdown && effectiveBreak > 0 && breakdown.autoDeduct === effectiveBreak &&
              `（昼休み${effectiveBreak}分を控除）`}
            {breakdown && effectiveBreak > 0 && breakdown.autoDeduct === 0 &&
              `（昼休み${effectiveBreak}分は時間帯の間で取得済み）`}
            {breakdown && effectiveBreak > 0 && breakdown.autoDeduct > 0 && breakdown.autoDeduct < effectiveBreak &&
              `（昼休み${effectiveBreak}分のうち${breakdown.autoDeduct}分を控除）`}
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
