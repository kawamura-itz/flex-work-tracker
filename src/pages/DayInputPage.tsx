import { format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { deleteDay, getDay, putDay } from '../db';
import { deriveTotalMinutes } from '../domain/calc';
import { fmtHM, parseDay } from '../domain/time';
import type { DayRecord, DayType, InputMethod, Segment } from '../types';

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

function segmentsToPairs(segments: Segment[]): TimePair[] {
  return segments
    .filter((s) => s.end)
    .map((s) => ({
      start: s.start.slice(11, 16) || '09:00',
      end: (s.end ?? '').slice(11, 16) || '18:00',
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

export function DayInputPage() {
  const { settings, today } = useApp();
  const navigate = useNavigate();
  const params = useParams();
  const date = params.date ?? today;

  const [type, setType] = useState<DayType>('work');
  const [method, setMethod] = useState<InputMethod>(settings.defaultInputMethod);
  const [pairs, setPairs] = useState<TimePair[]>([{ start: '09:00', end: '18:00' }]);
  const [totalHours, setTotalHours] = useState<string>('8');
  const [note, setNote] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void getDay(date).then((rec) => {
      if (!active) return;
      if (rec) {
        setType(rec.type);
        setMethod(rec.inputMethod === 'timer' ? 'time' : rec.inputMethod);
        const pairs = segmentsToPairs(rec.segments);
        if (pairs.length > 0) setPairs(pairs);
        setTotalHours((rec.totalMinutes / 60).toString());
        setNote(rec.note ?? '');
      }
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [date]);

  const previewMinutes = useMemo(() => {
    if (!HAS_SEGMENTS.includes(type)) return 0;
    if (method === 'total') return Math.round(parseFloat(totalHours || '0') * 60);
    return deriveTotalMinutes(pairsToSegments(date, pairs), settings.breakHandling);
  }, [type, method, totalHours, pairs, date, settings.breakHandling]);

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
    navigate('/');
  }

  async function remove() {
    await deleteDay(date);
    navigate('/');
  }

  if (!loaded) return <div className="muted">読み込み中…</div>;

  const showSegments = HAS_SEGMENTS.includes(type);

  return (
    <>
      <div className="page-title">{format(parseDay(date), 'yyyy/M/d (E)')} の記録</div>

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
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => setPairs((ps) => ps.filter((_, j) => j !== i))}
                    disabled={pairs.length === 1}
                  >
                    削除
                  </button>
                </div>
              ))}
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setPairs((ps) => [...ps, { start: '13:00', end: '18:00' }])}
              >
                ＋ セグメント追加（中休み）
              </button>
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
      <button className="btn btn--ghost" onClick={() => void remove()} style={{ marginTop: 10 }}>
        この日の記録を削除
      </button>
    </>
  );
}
