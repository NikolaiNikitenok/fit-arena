// Эффекты стиля «Спорт»: число «накатом», искры, светлячки, волна от кольца. Всё на CSS и одном rAF —
// без 3D и без лишних кадров. В экономном режиме (calm) эффекты тише или выключены.
import { useEffect, useRef, useState, type CSSProperties } from 'react';

/** Число, которое плавно докручивается до нового значения. */
export function CountUp({ value, ms = 900 }: { value: number; ms?: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const v = Math.round(a + (value - a) * e);
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, ms]);
  return <>{shown}</>;
}

// Детерминированный «случай»: искры разлетаются по-разному на каждый повтор, но без Math.random в рендере.
const rnd = (seed: number) => {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};

/** Вспышка искр из точки (в процентах контейнера). Новый burst — новый залп. */
export function Sparks({ burst, x, y, count = 14, hue = 140 }: { burst: number; x: number; y: number; count?: number; hue?: number }) {
  if (!burst) return null;
  return (
    <div key={burst} className="fx-sparks" style={{ left: `${x}%`, top: `${y}%` }} aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const ang = (i / count) * Math.PI * 2 + rnd(burst + i) * 0.6;
        const dist = 30 + rnd(burst * 3 + i) * 46;
        const style = {
          '--dx': `${Math.cos(ang) * dist}px`,
          '--dy': `${Math.sin(ang) * dist}px`,
          '--h': hue + Math.round(rnd(burst * 7 + i) * 60) - 20,
          '--s': 0.6 + rnd(burst * 5 + i) * 0.9,
          animationDelay: `${rnd(burst * 11 + i) * 60}ms`,
        } as CSSProperties;
        return <i key={i} style={style} />;
      })}
    </div>
  );
}

/** Светлячки: редкие светящиеся точки медленно поднимаются по экрану. */
export function Fireflies({ n = 14 }: { n?: number }) {
  return (
    <div className="fx-flies" aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const style = {
          left: `${rnd(i + 1) * 100}%`,
          '--d': `${9 + rnd(i + 20) * 10}s`,
          '--delay': `${-rnd(i + 40) * 18}s`,
          '--x': `${(rnd(i + 60) - 0.5) * 60}px`,
          '--sz': `${2 + rnd(i + 80) * 3}px`,
        } as CSSProperties;
        return <i key={i} style={style} />;
      })}
    </div>
  );
}

/** Волна, расходящаяся от кольца на каждый повтор. */
export function Ripple({ burst }: { burst: number }) {
  if (!burst) return null;
  return <span key={burst} className="fx-ripple" aria-hidden />;
}
