import { useId } from 'react';
import { defaultFlag, FLAG_COLORS, FLAG_PATTERNS, FLAG_SYMBOLS, parseFlag } from '../../shared/clan';
import { clanRank } from '../../shared/clanLevel';

export const COLORS = ['#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#0090ff', '#3e63dd', '#8e4ec6', '#d6409f', '#f2f2f2', '#22252f', '#8d6e63'];
const LIGHT = new Set([2, 9]);

// Узоры полотнища в координатах знамени 40×52.
const PATTERNS: ((c: string) => React.ReactNode)[] = [
  () => null,
  (c) => <rect y={17} width={40} height={11} fill={c} />,
  (c) => <rect x={14.5} width={11} height={52} fill={c} />,
  (c) => (
    <>
      <rect y={17} width={40} height={9} fill={c} />
      <rect x={15.5} width={9} height={52} fill={c} />
    </>
  ),
  (c) => <path d="M0 0h12l28 34v14z" fill={c} />,
  (c) => <rect x={20} width={20} height={52} fill={c} />,
  (c) => <rect width={40} height={13} fill={c} />,
  (c) => <path d="M0 26l20 13 20-13v8L20 47 0 34z" fill={c} />,
];

// Символы в сетке 24×24.
const SYMBOLS = [
  'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z',
  'M3 7l4.5 4.5L12 4l4.5 7.5L21 7l-2 12H5z',
  'M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 0 2 1 3 2 3 0-3-1-5 1-8z',
  'M18.5 2H22v3.5L10 17.5 6.5 14zM4.5 13.5l6 6-1.5 1.5-1.8-1.8L4.5 22 2 19.5l2.8-2.7L3 15z',
  'M12 2l8 3v6c0 5.5-3.5 9.5-8 11-4.5-1.5-8-5.5-8-11V5z',
  'M13.5 2L4 14h6.5l-1 8L19 10h-6.5z',
  'M14.5 2.5a9.5 9.5 0 1 0 7 15.2A8 8 0 0 1 14.5 2.5z',
  'M12 21s-8.5-5.2-8.5-11.2A4.7 4.7 0 0 1 12 7a4.7 4.7 0 0 1 8.5 2.8C20.5 15.8 12 21 12 21z',
  'M1.5 20.5l7.5-13 4.2 6.6 3-4.1 6.3 10.5z',
  'M2 9h2V6.5h3V11h10V6.5h3V9h2v6h-2v2.5h-3V13H7v4.5H4V15H2z',
  'M8 3h8a3.2 3.2 0 0 1 .6 6.3A7.5 7.5 0 1 1 7.4 9.3 3.2 3.2 0 0 1 8 3zm.3 2.3a.9.9 0 0 0 0 1.8h7.4a.9.9 0 0 0 0-1.8z',
  'M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM11 .5h2v4.5h-2zM11 19h2v4.5h-2zM.5 11H5v2H.5zM19 11h4.5v2H19z',
];
if (PATTERNS.length !== FLAG_PATTERNS || SYMBOLS.length !== FLAG_SYMBOLS || COLORS.length !== FLAG_COLORS) throw new Error('flag tables');

const RANK = { bronze: '#c08457', silver: '#d3dae4', gold: '#ffcf5a', legend: '#c4a1ff' };
const SHAPE = 'M3 2h34v42.5L20 37 3 44.5z';

/** Знамя клана. Рамка показывает ранг: бронза, серебро, золото, легенда. */
export function Flag({ flag, tag = '', level = 1, size = 48 }: { flag: string; tag?: string; level?: number; size?: number }) {
  const id = useId();
  const [bg, pattern, symbol, fg] = parseFlag(flag) ?? parseFlag(defaultFlag(tag))!;
  const rank = clanRank(level);
  return (
    <svg className={`flag ${rank}`} width={size * 0.77} height={size} viewBox="0 0 40 52" aria-hidden>
      <clipPath id={id}>
        <path d={SHAPE} />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <rect width={40} height={52} fill={COLORS[bg]} />
        {PATTERNS[pattern](COLORS[fg])}
        <path d="M0 0h40v6H0z" fill="rgba(0,0,0,.18)" />
      </g>
      <path d={SYMBOLS[symbol]} transform="translate(10.4 10.5) scale(.8)" fill={LIGHT.has([1, 2, 3].includes(pattern) ? fg : bg) ? '#1b1d26' : '#fff'} fillRule="evenodd" stroke="rgba(0,0,0,.25)" strokeWidth={0.6} />
      <path d={SHAPE} fill="none" stroke={RANK[rank]} strokeWidth={rank === 'bronze' ? 2 : 2.6} strokeLinejoin="round" />
      <rect x={1} y={0} width={38} height={3.2} rx={1.6} fill={RANK[rank]} />
    </svg>
  );
}

/** Выбор флага: фон, узор, символ и цвет узора. */
export function FlagPicker({ flag, tag, onChange }: { flag: string; tag: string; onChange: (f: string) => void }) {
  const v = parseFlag(flag) ?? parseFlag(defaultFlag(tag))!;
  const set = (i: number, x: number) => onChange(v.map((y, j) => (j === i ? x : y)).join('.'));
  const swatches = (i: number) => (
    <div className="pick-row">
      {COLORS.map((c, x) => (
        <button type="button" key={c} className={`swatch-btn ${v[i] === x ? 'on' : ''}`} style={{ background: c }} onClick={() => set(i, x)} aria-label={`цвет ${x + 1}`} />
      ))}
    </div>
  );
  return (
    <div className="flag-picker">
      <div className="flag-preview">
        <Flag flag={v.join('.')} size={92} />
      </div>
      <div className="pick-label">Цвет полотна</div>
      {swatches(0)}
      <div className="pick-label">Узор</div>
      <div className="pick-row">
        {PATTERNS.map((_, x) => (
          <button type="button" key={x} className={`pick-btn ${v[1] === x ? 'on' : ''}`} onClick={() => set(1, x)} aria-label={`узор ${x + 1}`}>
            <Flag flag={[v[0], x, v[2], v[3]].join('.')} size={34} />
          </button>
        ))}
      </div>
      {v[1] > 0 && (
        <>
          <div className="pick-label">Цвет узора</div>
          {swatches(3)}
        </>
      )}
      <div className="pick-label">Символ</div>
      <div className="pick-row">
        {SYMBOLS.map((d, x) => (
          <button type="button" key={x} className={`pick-btn sym ${v[2] === x ? 'on' : ''}`} onClick={() => set(2, x)} aria-label={`символ ${x + 1}`}>
            <svg width={22} height={22} viewBox="0 0 24 24">
              <path d={d} fill="currentColor" fillRule="evenodd" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
