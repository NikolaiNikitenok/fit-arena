import { memo } from 'react';
import type { LandTheme } from './lands';

// Живой фон земли: два слоя света, которые медленно плывут с разной скоростью (параллакс), и
// частицы темы — пыль, споры, искры, снег, пузыри, блёстки, угли, туман, звёзды, лепестки.
// Только transform и opacity; в экономном режиме частиц втрое меньше, при «меньше движения» — стоят.

// Сколько частиц и как они двигаются: падают, всплывают или мерцают на месте.
const MOTION: Record<LandTheme, 'fall' | 'rise' | 'twinkle' | 'drift'> = {
  cellar: 'drift',
  forest: 'rise',
  mine: 'drift',
  ice: 'fall',
  water: 'rise',
  crystal: 'twinkle',
  lava: 'rise',
  crypt: 'drift',
  space: 'twinkle',
  throne: 'fall',
};

// Постоянный разброс без случайности: фон одинаковый между кадрами и перерисовками.
const spread = (i: number, k: number) => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;

export const Backdrop = memo(function Backdrop({ theme, lite, count = 18 }: { theme: LandTheme; lite?: boolean; count?: number }) {
  const n = lite ? Math.ceil(count / 3) : count;
  const motion = MOTION[theme];
  return (
    <div className={`m3-backdrop m3-th-${theme} ${lite ? 'lite' : ''}`} aria-hidden="true">
      <div className="m3-layer far" />
      <div className="m3-layer near" />
      <div className={`m3-particles ${motion}`}>
        {Array.from({ length: n }, (_, i) => (
          <i
            key={i}
            style={{
              ['--x' as string]: `${(spread(i, 1) * 100).toFixed(1)}%`,
              ['--y' as string]: `${(spread(i, 2) * 100).toFixed(1)}%`,
              ['--s' as string]: (0.6 + spread(i, 3) * 0.9).toFixed(2),
              ['--d' as string]: `${(7 + spread(i, 4) * 9).toFixed(1)}s`,
              ['--dl' as string]: `${(-spread(i, 5) * 16).toFixed(1)}s`,
              ['--sw' as string]: `${((spread(i, 6) - 0.5) * 60).toFixed(0)}px`,
            }}
          />
        ))}
      </div>
      <div className="m3-vignette" />
    </div>
  );
});
