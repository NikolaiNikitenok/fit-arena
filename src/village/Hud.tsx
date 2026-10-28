import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ResIcon } from './BattleScreen';
import { ChunkyRes } from './icons';
import { fmtNum } from './state';
import type { ResKey } from '../../shared/village';
import './hud.css';
import { t } from '../i18n';

// Панели деревни в одном стиле: тёмно-синяя основа, рамка из дерева или камня, крупные полосы
// запасов сверху справа. Числа не прыгают, а докручиваются; при сборе урожая монеты летят
// из пузыря прямо в свою полосу.

/** Число, которое плавно докручивается до нового значения. */
export function useCountUp(value: number, ms = 800): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const cur = useRef(value);
  useEffect(() => {
    from.current = cur.current;
    if (from.current === value) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (tm: number) => {
      const k = Math.min(1, (tm - t0) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      cur.current = Math.round(from.current + (value - from.current) * e);
      setShown(cur.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

export type BarKey = ResKey | 'charge';

/** Полоса запаса: иконка в каменном кольце, заполнение по вместимости, число. */
export const ResBar = forwardRef<HTMLDivElement, { k: BarKey; value: number; cap: number; onClick?: () => void }>(function ResBar({ k, value, cap, onClick }, ref) {
  const n = useCountUp(value);
  const [bump, setBump] = useState(0);
  const prev = useRef(value);
  useEffect(() => {
    if (value > prev.current) setBump((b) => b + 1);
    prev.current = value;
  }, [value]);
  const full = value >= cap;
  return (
    <div ref={ref} className={`hud-bar hud-${k} ${full ? 'full' : ''}`} onClick={onClick}>
      <div className="hud-track">
        <div className="hud-fillbox">
          <div className="hud-fill" style={{ width: `${Math.min(100, (100 * n) / Math.max(1, cap))}%` }} />
        </div>
        <b key={bump} className={bump ? 'hud-num bump' : 'hud-num'}>
          {k === 'charge' ? n : fmtNum(n)}
        </b>
        <small>{full ? t('полно') : k === 'charge' ? `/${cap}` : `/${fmtNum(cap)}`}</small>
      </div>
      <span className="hud-ico">{k === 'charge' ? <ChunkyRes r="charge" size={22} /> : <ResIcon r={k} size={20} />}</span>
    </div>
  );
});

interface Flight {
  id: number;
  k: BarKey;
  x: number;
  y: number;
  dx: number;
  dy: number;
  n: number;
  amount: number;
}

export interface FlyApi {
  /** Пустить монеты из точки экрана в полосу запаса. */
  fly(k: BarKey, x: number, y: number, amount: number): void;
}

/** Слой с летящими монетами и всплывающим «+120» над местом сбора. */
export const FlyLayer = forwardRef<FlyApi, { bars: React.RefObject<Partial<Record<BarKey, HTMLDivElement | null>>> }>(function FlyLayer({ bars }, ref) {
  const [list, setList] = useState<Flight[]>([]);
  const seq = useRef(0);
  useImperativeHandle(ref, () => ({
    fly(k, x, y, amount) {
      const el = bars.current?.[k];
      const r = el?.getBoundingClientRect();
      const tx = r ? r.right - 16 : window.innerWidth - 40;
      const ty = r ? r.top + r.height / 2 : 30;
      const id = ++seq.current;
      const n = Math.max(6, Math.min(12, Math.round(amount / 30)));
      setList((l) => [...l, { id, k, x, y, dx: tx - x, dy: ty - y, n, amount }]);
      window.setTimeout(() => setList((l) => l.filter((f) => f.id !== id)), 1500);
    },
  }));
  return (
    <div className="hud-fly" aria-hidden="true">
      {list.map((f) => (
        <div key={f.id}>
          <span className="hud-plus" style={{ left: f.x, top: f.y }}>
            +{fmtNum(f.amount)}
          </span>
          {Array.from({ length: f.n }, (_, j) => {
            // Монеты сначала разлетаются фонтаном, потом по дуге летят к полосе.
            const a = (j / f.n) * Math.PI * 2 + f.id;
            const style = {
              left: f.x,
              top: f.y,
              '--sx': `${Math.cos(a) * (26 + (j % 3) * 10)}px`,
              '--sy': `${Math.sin(a) * 18 - 34 - (j % 2) * 12}px`,
              '--dx': `${f.dx}px`,
              '--dy': `${f.dy}px`,
              animationDelay: `${j * 45}ms`,
            } as React.CSSProperties;
            return (
              <span key={j} className="hud-coin" style={style}>
                <span>{f.k === 'charge' ? <ChunkyRes r="charge" size={24} /> : <ResIcon r={f.k} size={26} />}</span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
});
