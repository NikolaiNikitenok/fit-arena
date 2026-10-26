// Занавес из облаков между деревнями: облака съезжаются с краёв, пока ищется соперник
// или грузится бой, потом расходятся — как переход между базами в больших стратегиях.
import './curtain.css';

export type CurtainPhase = 'off' | 'in' | 'shut' | 'out';

// Клубы по внутреннему краю половинки: [сверху %, размер vmax, выступ vmax]. Разные выступы —
// край неровный, как у настоящего облака.
const PUFFS: [number, number, number][] = [
  [-6, 30, 2], [6, 20, 9], [16, 26, -2], [27, 18, 8], [36, 28, 3], [47, 20, 10], [56, 26, -1], [66, 18, 7], [75, 28, 2], [86, 20, 9], [96, 30, 0],
];
// Клубы внутри: облако объёмное, а не ровная заливка.
const INNER: [number, number, number][] = [
  [8, 22, 30], [30, 26, 55], [52, 20, 25], [70, 24, 60], [90, 22, 35],
];

function Side({ side }: { side: 'left' | 'right' }) {
  return (
    <div className={`vil-cloud-side ${side}`}>
      {INNER.map(([top, size, from], k) => (
        <span key={`i${k}`} className="vil-puff inner" style={{ top: `${top}%`, width: `${size}vmax`, height: `${size}vmax`, [side === 'left' ? 'right' : 'left']: `${from}%` }} />
      ))}
      {PUFFS.map(([top, size, out], k) => (
        <span key={k} className="vil-puff" style={{ top: `${top}%`, width: `${size}vmax`, height: `${size}vmax`, [side === 'left' ? 'right' : 'left']: `${-size / 2 - out}vmax`, marginTop: `${-size / 2}vmax` }} />
      ))}
    </div>
  );
}

export function Curtain({ phase, text }: { phase: CurtainPhase; text?: string }) {
  if (phase === 'off') return null;
  return (
    <div className={`vil-curtain ${phase}`} aria-hidden={phase === 'out'}>
      <Side side="left" />
      <Side side="right" />
      {text && <div className="vil-curtain-text">{text}</div>}
    </div>
  );
}
