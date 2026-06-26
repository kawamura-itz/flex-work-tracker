import { format } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { fmtHM, fmtSignedHM, parseDay } from '../domain/time';

export function HistoryPage() {
  const closed = useLiveQuery(
    () => db.periods.where('status').equals('closed').reverse().sortBy('startDate'),
    [],
    [],
  );

  return (
    <>
      <div className="page-title">履歴</div>
      <p className="hint">今期の日別はホームのカレンダーで確認・編集できます。ここでは確定した過去の清算期間を表示します。</p>

      <div className="section-head">確定済みの清算期間</div>
      {(closed ?? []).length === 0 ? (
        <p className="muted">まだ確定した期間はありません（設定画面で確定できます）。</p>
      ) : (
        <div className="card">
          {(closed ?? []).map((p) => {
            const s = p.snapshot;
            const buffer = s ? s.actualMinutes - s.requiredMinutes : 0;
            const tone = buffer >= 0 ? 'surplus' : 'shortfall';
            return (
              <div className="list-item" key={p.id}>
                <span>
                  {format(parseDay(p.startDate), 'yyyy/M/d')} 〜 {format(parseDay(p.endDate), 'M/d')}
                  {s && (
                    <div className="muted" style={{ fontSize: '0.74rem' }}>
                      必要 {fmtHM(s.requiredMinutes)} / 実績 {fmtHM(s.actualMinutes)} · 所定{s.workingDays}日
                    </div>
                  )}
                </span>
                {s && <span className={`badge ${tone}`}>{fmtSignedHM(buffer)}</span>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
