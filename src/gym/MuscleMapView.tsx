import { BODY_PATHS, BODY_VIEW } from './bodyMap';
import { useSport } from '../settings';
import { t } from '../i18n';

const NEUTRAL = new Set(['hair', 'head', 'neck', 'hands', 'feet', 'ankles', 'knees']);

/** Тело спереди и сзади: чем больше подходов на мышцу, тем ярче она горит. levels — участок → 0..1. */
export function MuscleMapView({ levels, size = 150 }: { levels: Record<string, number>; size?: number }) {
  const sport = useSport();
  const hot = sport ? '#4ade80' : '#ff8a5c';
  return (
    <div className="gym-body">
      {(['front', 'back'] as const).map((side) => {
        const [x, y, w, h] = BODY_VIEW[side];
        return (
          <figure key={side}>
            <svg viewBox={`${x} ${y} ${w} ${h}`} width={size} height={(size * h) / w} role="img" aria-label={side === 'front' ? t('Спереди') : t('Сзади')}>
              {Object.entries(BODY_PATHS[side]).map(([slug, paths]) => {
                const v = levels[slug] ?? 0;
                return (
                  <g key={slug}>
                    {paths.map((d, i) => (
                      <path key={i} d={d} fill={NEUTRAL.has(slug) ? '#3b4152' : '#2b3040'} stroke="#151821" strokeWidth={2} />
                    ))}
                    {v > 0 && paths.map((d, i) => <path key={`h${i}`} d={d} fill={hot} opacity={0.25 + v * 0.75} />)}
                  </g>
                );
              })}
            </svg>
            <figcaption>{side === 'front' ? t('Спереди') : t('Сзади')}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}
