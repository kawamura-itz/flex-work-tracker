import { format } from 'date-fns';
import { MeterGauge } from '../components/MeterGauge';
import { WorkTimer } from '../components/WorkTimer';
import { useApp } from '../state/AppContext';
import { useStatus } from '../hooks/useStatus';
import { fmtHM } from '../domain/time';
import { parseDay } from '../domain/time';

export function MainPage() {
  const { period } = useApp();
  const { status } = useStatus();

  const periodLabel = `${format(parseDay(period.startDate), 'M/d')} 〜 ${format(parseDay(period.endDate), 'M/d')}`;

  const canReduce = status.bufferMinutes > 0;

  return (
    <>
      <div className="period-label">清算期間 {periodLabel}</div>

      <div className="main-grid">
        <section className="main-grid__primary">
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
        </section>

        <section className="main-grid__secondary">
          <div className="section-head">減らせる時間</div>
          <div className="row">
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
                        ? `不足: 1日 +${fmtHM(status.additionalPerDayMinutes)} 必要`
                        : '短縮できる余力なし'}
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

          <WorkTimer />
        </section>
      </div>
    </>
  );
}
