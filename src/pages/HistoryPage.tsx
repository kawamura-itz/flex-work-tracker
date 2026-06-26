import { format } from 'date-fns';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../state/AppContext';
import { db } from '../db';
import { usePeriodDays } from '../hooks/useStatus';
import { dayContributionMinutes } from '../domain/calc';
import { isHoliday } from '../domain/holidays';
import { eachDayStr } from '../domain/period';
import { fmtHM, fmtSignedHM, parseDay } from '../domain/time';
import type { DayRecord, DayType } from '../types';

const TYPE_SHORT: Record<DayType, string> = {
  work: '勤務',
  paidLeave: '有給',
  halfLeave: '半休',
  holiday: '休日',
  adjustOff: '調整',
  absence: '欠勤',
};

export function HistoryPage() {
  const { settings, holidayCtx, today, period } = useApp();
  const days = usePeriodDays();
  const closed = useLiveQuery(
    () => db.periods.where('status').equals('closed').reverse().sortBy('startDate'),
    [],
    [],
  );

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const allDates = useMemo(() => eachDayStr(period.startDate, period.endDate), [period]);

  function renderDay(date: string) {
    const rec: DayRecord | undefined = byDate.get(date);
    const holiday = isHoliday(date, settings, holidayCtx);
    const isToday = date === today;
    const contribution = rec ? dayContributionMinutes(rec, settings) : 0;
    return (
      <Link
        to={`/input/${date}`}
        key={date}
        className={`day-cell ${holiday ? 'holiday' : ''} ${isToday ? 'today' : ''}`}
        style={{ textDecoration: 'none', color: 'inherit' }}
      >
        <span className="d">{format(parseDay(date), 'M/d (E)')}</span>
        <span>
          {rec ? (
            <>
              <span className="badge" style={{ marginRight: 8 }}>{TYPE_SHORT[rec.type]}</span>
              {contribution > 0 ? fmtHM(contribution) : ''}
            </>
          ) : holiday ? (
            <span className="muted">休</span>
          ) : (
            <span className="muted">未入力</span>
          )}
        </span>
      </Link>
    );
  }

  return (
    <>
      <div className="page-title">履歴</div>

      <div className="section-head">今期の日別記録</div>
      <div className="card history-days">{allDates.map(renderDay)}</div>

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
