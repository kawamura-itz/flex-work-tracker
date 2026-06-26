import { format } from 'date-fns';
import { useState } from 'react';
import { MeterGauge } from '../components/MeterGauge';
import { MonthCalendar } from '../components/MonthCalendar';
import { DayEditor } from '../components/DayEditor';
import { Modal } from '../components/Modal';
import { useApp } from '../state/AppContext';
import { useStatus } from '../hooks/useStatus';
import { fmtHM, parseDay } from '../domain/time';

export function MainPage() {
  const { period, today, updateSettings } = useApp();
  const { status } = useStatus();
  const [editDate, setEditDate] = useState<string | null>(null);

  const periodLabel = `${format(parseDay(period.startDate), 'M/d')} 〜 ${format(parseDay(period.endDate), 'M/d')}`;
  const canReduce = status.bufferMinutes > 0;

  return (
    <>
      <div className="period-label">清算期間 {periodLabel}</div>

      {status.unconfirmedDays > 0 && (
        <div className="notice">
          <span>
            未確定の平日が <b>{status.unconfirmedDays}日</b> あります（実績に未算入）。
          </span>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => void updateSettings({ confirmedThrough: today })}
          >
            今日まで所定で確定
          </button>
        </div>
      )}

      <div className="home-grid">
        <aside className="home-side">
          <MeterGauge bufferMinutes={status.bufferMinutes} />

          <div className="meter__details">
            <div>
              実績
              <b>{fmtHM(status.actualMinutes)}</b>
            </div>
            <div>
              着地見込み
              <b>{fmtHM(status.forecastMinutes)}</b>
            </div>
            <div>
              残り稼働
              <b>{status.remainingWorkingDays}日</b>
            </div>
          </div>

          <div className="row" style={{ marginTop: 14 }}>
            <div className="card card--sub">
              <div className="card__label">毎日に割り振る</div>
              {status.reduciblePerDayMinutes !== null && status.remainingWorkingDays > 0 ? (
                <>
                  <div className="card__value">
                    {canReduce ? fmtHM(status.reduciblePerDayMinutes) : '—'}
                  </div>
                  <div className="card__note">
                    {canReduce
                      ? `残り${status.remainingWorkingDays}日、1日あたり`
                      : status.additionalPerDayMinutes !== null
                        ? `不足: 1日 +${fmtHM(status.additionalPerDayMinutes)}`
                        : '余力なし'}
                  </div>
                </>
              ) : (
                <div className="card__note">残り稼働日なし</div>
              )}
            </div>

            <div className="card card--sub">
              <div className="card__label">今日まとめて</div>
              {canReduce ? (
                <>
                  <div className="card__value">{fmtHM(status.reducibleTodayMinutes)}</div>
                  <div className="card__note">今日だけで短縮できる最大</div>
                </>
              ) : (
                <>
                  <div className="card__value muted">短縮不可</div>
                  <div className="card__note">余力がありません</div>
                </>
              )}
            </div>
          </div>
        </aside>

        <main className="home-main">
          <div className="section-head" style={{ marginTop: 0 }}>
            カレンダー（日付をタップで ± 入力 / 今日はタイマー）
          </div>
          <MonthCalendar onSelect={setEditDate} />
        </main>
      </div>

      {editDate && (
        <Modal onClose={() => setEditDate(null)}>
          <DayEditor date={editDate} onClose={() => setEditDate(null)} />
        </Modal>
      )}
    </>
  );
}
