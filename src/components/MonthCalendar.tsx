import { format, getDay } from 'date-fns';
import { useMemo } from 'react';
import { useApp } from '../state/AppContext';
import { usePeriodDays } from '../hooks/useStatus';
import { classifyDay, dayContributionMinutes, effectiveConfirmEnd } from '../domain/calc';
import { isHoliday } from '../domain/holidays';
import { eachDayStr } from '../domain/period';
import { addDaysStr, fmtSignedHM, hoursToMinutes, parseDay } from '../domain/time';
import type { DayType } from '../types';

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const TYPE_SHORT: Record<DayType, string> = {
  work: '勤務',
  paidLeave: '有給',
  halfLeave: '半休',
  holiday: '休',
  adjustOff: '調整',
  absence: '欠勤',
};

/** Full-period calendar grid. Tapping a day calls onSelect(date). */
export function MonthCalendar({ onSelect }: { onSelect: (date: string) => void }) {
  const { settings, holidayCtx, today, period } = useApp();
  const days = usePeriodDays();

  const { cells, byDate, confEnd, stdMin } = useMemo(() => {
    const byDate = new Map(days.map((d) => [d.date, d]));
    const confEnd = effectiveConfirmEnd(settings, today);
    const stdMin = hoursToMinutes(settings.dailyStandardHours);
    // Pad to whole weeks (Sun..Sat) covering the period.
    const gridStart = addDaysStr(period.startDate, -getDay(parseDay(period.startDate)));
    const gridEnd = addDaysStr(period.endDate, 6 - getDay(parseDay(period.endDate)));
    return { cells: eachDayStr(gridStart, gridEnd), byDate, confEnd, stdMin };
  }, [days, settings, today, period]);

  return (
    <div className="card cal-card">
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
            : kind === 'assumed'
              ? stdMin
              : 0;
          const delta = contribution - (holiday ? 0 : stdMin);
          const dnum = format(parseDay(date), 'd');

          let label = '';
          let labelTone = '';
          if (kind === 'record') {
            if (rec!.type === 'work') {
              label = delta === 0 ? '±0' : fmtSignedHM(delta);
              labelTone = delta > 0 ? 'pos' : delta < 0 ? 'neg' : '';
            } else {
              label = TYPE_SHORT[rec!.type];
              labelTone = delta < 0 ? 'neg' : '';
            }
          } else if (kind === 'unconfirmed') {
            label = '未確定';
            labelTone = 'warn';
          }

          return (
            <button
              key={date}
              className={`cal-cell k-${kind} ${date === today ? 'is-today' : ''} ${holiday ? 'is-holiday' : ''}`}
              onClick={() => onSelect(date)}
            >
              <span className="cal-d">{dnum}</span>
              {label && <span className={`cal-v ${labelTone}`}>{label}</span>}
            </button>
          );
        })}
      </div>

      <div className="cal-legend">
        <span><i className="dot k-assumed" />みなし</span>
        <span><i className="dot k-record" />記録</span>
        <span><i className="dot k-unconfirmed" />未確定</span>
        <span><i className="dot k-forecast" />見込み</span>
      </div>
    </div>
  );
}
