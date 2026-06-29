import { format, getDay } from 'date-fns';
import { useMemo } from 'react';
import { useApp } from '../state/AppContext';
import { usePeriodDays } from '../hooks/useStatus';
import { classifyDay, dayContributionMinutes, effectiveConfirmEnd } from '../domain/calc';
import { isHoliday } from '../domain/holidays';
import { eachDayStr } from '../domain/period';
import { addDaysStr, fmtSignedHM, hoursToMinutes, parseDay } from '../domain/time';

const WD = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * Full-period calendar grid. Every working day shows its ± vs the standard day
 * (±0 when on track), coloured only when it deviates. Holidays are blank.
 * Tapping a day calls onSelect(date).
 */
export function MonthCalendar({ onSelect }: { onSelect: (date: string) => void }) {
  const { settings, holidayCtx, today, period } = useApp();
  const days = usePeriodDays();

  const { cells, byDate, confEnd, stdMin } = useMemo(() => {
    const byDate = new Map(days.map((d) => [d.date, d]));
    const confEnd = effectiveConfirmEnd(settings, today);
    const stdMin = hoursToMinutes(settings.dailyStandardHours);
    const gridStart = addDaysStr(period.startDate, -getDay(parseDay(period.startDate)));
    const gridEnd = addDaysStr(period.endDate, 6 - getDay(parseDay(period.endDate)));
    return { cells: eachDayStr(gridStart, gridEnd), byDate, confEnd, stdMin };
  }, [days, settings, today, period]);

  return (
    <div className="card cal-card">
      <div className="cal-cap">日付をタップで入力・修正</div>
      <div className="cal-head">
        {WD.map((w, i) => (
          <div key={w} className={`cal-wd ${i === 0 ? 'sun' : ''} ${i === 6 ? 'sat' : ''}`}>
            {w}
          </div>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((date) => {
          const inPeriod = date >= period.startDate && date <= period.endDate;
          if (!inPeriod) return <div key={date} className="cal-cell out" />;

          const rec = byDate.get(date);
          const holiday = isHoliday(date, settings, holidayCtx);
          const kind = classifyDay(date, !!rec, holiday, today, confEnd);
          const contribution = rec
            ? dayContributionMinutes(rec, settings)
            : kind === 'assumed' || kind === 'forecast'
              ? stdMin
              : 0; // unconfirmed (assumption off)

          // Show a value for any working day, and for any day with a record
          // (incl. working on a holiday). Baseline is 0 on holidays, so holiday
          // work reads as a surplus (+).
          let label = '';
          let tone = 'zero';
          if (rec || !holiday) {
            const baseStd = holiday ? 0 : stdMin;
            const delta = contribution - baseStd;
            label = fmtSignedHM(delta);
            tone = delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'zero';
          }

          return (
            <button
              key={date}
              className={`cal-cell ${date === today ? 'is-today' : ''} ${holiday && !rec ? 'is-holiday' : ''}`}
              onClick={() => onSelect(date)}
            >
              <span className="cal-d">{format(parseDay(date), 'd')}</span>
              {label && <span className={`cal-v ${tone}`}>{label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
