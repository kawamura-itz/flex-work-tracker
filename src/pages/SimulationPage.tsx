import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { usePeriodDays } from '../hooks/useStatus';
import { applySimulation, computeStatus, type SimPlan } from '../domain/calc';
import { isHoliday } from '../domain/holidays';
import { eachDayStr } from '../domain/period';
import { fmtHM, fmtSignedHM, parseDay } from '../domain/time';

type PlanKind = 'normal' | 'off' | 'shorten';
interface PlanState {
  kind: PlanKind;
  hours: string; // for shorten
}

export function SimulationPage() {
  const { settings, holidayCtx, today, period } = useApp();
  const days = usePeriodDays();
  const recordDates = useMemo(() => new Set(days.map((d) => d.date)), [days]);

  // Future working days with no record — the days you can still plan around.
  const futureDays = useMemo(() => {
    const start = today < period.startDate ? period.startDate : today;
    if (today > period.endDate) return [];
    return eachDayStr(start, period.endDate).filter(
      (d) => !isHoliday(d, settings, holidayCtx) && !recordDates.has(d),
    );
  }, [today, period, settings, holidayCtx, recordDates]);

  const [plans, setPlans] = useState<Record<string, PlanState>>({});

  const simPlans: SimPlan[] = useMemo(() => {
    const out: SimPlan[] = [];
    for (const [date, p] of Object.entries(plans)) {
      if (p.kind === 'off') out.push({ date, kind: 'off' });
      else if (p.kind === 'shorten')
        out.push({ date, kind: 'shorten', minutes: Math.round(parseFloat(p.hours || '0') * 60) });
    }
    return out;
  }, [plans]);

  const base = useMemo(
    () => computeStatus({ settings, range: period, days, ctx: holidayCtx, today }),
    [settings, period, days, holidayCtx, today],
  );
  const sim = useMemo(
    () =>
      computeStatus({
        settings,
        range: period,
        days: applySimulation(days, simPlans),
        ctx: holidayCtx,
        today,
      }),
    [settings, period, days, simPlans, holidayCtx, today],
  );

  function setPlan(date: string, patch: Partial<PlanState>) {
    setPlans((prev) => {
      const base: PlanState = prev[date] ?? { kind: 'normal', hours: '4' };
      return { ...prev, [date]: { ...base, ...patch } };
    });
  }

  const tone = sim.bufferMinutes > 0 ? 'surplus' : sim.bufferMinutes < 0 ? 'shortfall' : 'neutral';

  return (
    <>
      <div className="page-title">シミュレーション</div>
      <p className="hint">未来の稼働日を「調整休み」や「短縮」に仮置きして再計算します。確定実績には影響しません。</p>

      <div className="row">
        <div className="card card--sub">
          <div className="card__label">現状の過不足</div>
          <div className="card__value">{fmtSignedHM(base.bufferMinutes)}</div>
        </div>
        <div className="card card--sub">
          <div className="card__label">仮置き後</div>
          <div className={`card__value ${tone}`} style={{ color: tone === 'surplus' ? 'var(--surplus)' : tone === 'shortfall' ? 'var(--shortfall)' : undefined }}>
            {fmtSignedHM(sim.bufferMinutes)}
          </div>
          <div className="card__note">残り稼働 {sim.remainingWorkingDays}日</div>
        </div>
      </div>

      {sim.bufferMinutes < 0 && sim.additionalPerDayMinutes !== null && (
        <div className="card">
          <div className="card__label danger-text">不足を埋めるには</div>
          <div className="card__value danger-text">1日 +{fmtHM(sim.additionalPerDayMinutes)}</div>
          <div className="card__note">残り{sim.remainingWorkingDays}日に均等配分した場合</div>
        </div>
      )}
      {sim.bufferMinutes >= 0 && simPlans.length > 0 && (
        <div className="card">
          <div className="card__label">仮置き後も達成見込み</div>
          <div className="card__value surplus" style={{ color: 'var(--surplus)' }}>余力 {fmtHM(sim.bufferMinutes)}</div>
        </div>
      )}

      <div className="section-head">未来の稼働予定日（{futureDays.length}日）</div>
      {futureDays.length === 0 && <p className="muted">仮置きできる未来の稼働日がありません。</p>}
      <div className="card">
        {futureDays.map((d) => {
          const p = plans[d] ?? { kind: 'normal', hours: '4' };
          return (
            <div className="inline-fields" key={d} style={{ marginBottom: 10 }}>
              <div style={{ width: 84, fontVariantNumeric: 'tabular-nums', fontSize: '0.85rem' }}>
                {format(parseDay(d), 'M/d (E)')}
              </div>
              <select
                value={p.kind}
                onChange={(e) => setPlan(d, { kind: e.target.value as PlanKind })}
                style={{ flex: 1 }}
              >
                <option value="normal">通常({settings.dailyStandardHours}h)</option>
                <option value="off">調整休み(0h)</option>
                <option value="shorten">短縮</option>
              </select>
              {p.kind === 'shorten' && (
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={p.hours}
                  onChange={(e) => setPlan(d, { hours: e.target.value })}
                  style={{ width: 72 }}
                />
              )}
            </div>
          );
        })}
      </div>

      {simPlans.length > 0 && (
        <button className="btn btn--ghost" onClick={() => setPlans({})}>
          仮置きをすべて破棄
        </button>
      )}
    </>
  );
}
