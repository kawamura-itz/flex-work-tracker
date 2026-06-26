// The over/under meter — the app's centrepiece (§6).
// Bidirectional: centre = on-pace, right = surplus (青), left = shortfall (赤).
// Color-blind safe: also uses +/− signs and 余力／要追加 text labels.
import { fmtSignedHM } from '../domain/time';

interface Props {
  bufferMinutes: number;
  /** Half-range of the gauge in minutes (default ±20h). */
  scaleMinutes?: number;
}

export function MeterGauge({ bufferMinutes, scaleMinutes = 20 * 60 }: Props) {
  const surplus = bufferMinutes > 0;
  const shortfall = bufferMinutes < 0;
  const tone = surplus ? 'surplus' : shortfall ? 'shortfall' : 'neutral';

  const ratio = Math.min(1, Math.abs(bufferMinutes) / scaleMinutes);
  const fillPct = ratio * 50; // half-width is 50%

  const scaleLabel = `${Math.round(scaleMinutes / 60)}h`;

  return (
    <div className="meter">
      <div className="card__label">過不足（着地見込み − 必要時間）</div>
      <div className={`meter__big ${tone}`}>{fmtSignedHM(bufferMinutes)}</div>
      <div className={`meter__tag ${tone}`}>
        {surplus && <>＋ 余力（あと休める）</>}
        {shortfall && <>− 要追加（あと働く）</>}
        {!surplus && !shortfall && <>± 達成ペース</>}
      </div>

      <div className="gauge" role="img" aria-label={`過不足 ${fmtSignedHM(bufferMinutes)}`}>
        <div
          className={`gauge__fill ${tone}`}
          style={{ width: `${fillPct}%` }}
        />
        <div className="gauge__center" />
      </div>
      <div className="gauge__scale">
        <span>− {scaleLabel}</span>
        <span>0</span>
        <span>＋ {scaleLabel}</span>
      </div>
    </div>
  );
}
