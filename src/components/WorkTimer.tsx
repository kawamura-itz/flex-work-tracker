// Timer card: one button + today's segments (§6).
import { format, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';
import { useTimer } from '../hooks/useTimer';
import { fmtHM } from '../domain/time';

export function WorkTimer() {
  const { record, running, liveTotalMinutes, start, stop } = useTimer();
  const segments = record?.segments ?? [];

  return (
    <div className="card timer">
      <div className="card__label">今日の勤務タイマー</div>
      <div className={`timer__elapsed ${running ? 'running' : ''}`}>{fmtHM(liveTotalMinutes)}</div>
      {running ? (
        <button className="btn btn--stop" onClick={() => void stop()}>
          ■ 停止
        </button>
      ) : (
        <button className="btn" onClick={() => void start()}>
          ▶ {segments.length > 0 ? '再開' : '開始'}
        </button>
      )}

      {segments.length > 0 && (
        <ul className="seg-list">
          {segments.map((s, i) => (
            <li key={i}>
              <span>
                {format(parseISO(s.start), 'HH:mm')} 〜 {s.end ? format(parseISO(s.end), 'HH:mm') : '進行中'}
              </span>
              <span>{s.end ? fmtHM(Math.max(0, (parseISO(s.end).getTime() - parseISO(s.start).getTime()) / 60000)) : '—'}</span>
            </li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: 12 }}>
        <Link className="btn btn--ghost btn--sm" to="/input">
          時刻・合計で入力 / 修正
        </Link>
      </div>
    </div>
  );
}
