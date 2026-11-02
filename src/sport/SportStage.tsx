// Стиль «Спорт» (src/settings.ts style): строгий экран подхода вместо 3D-сцены — счётчик в кольце прогресса,
// таймер, темп и цель. Те же данные, что у сцены приключения (MissionView), только без сказки.
import { EXERCISE_LABELS, type RepExercise } from '../repCounter';
import { t } from '../i18n';
import './sport.css';

const R = 92;
const C = 2 * Math.PI * R;

export const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Кольцо прогресса с числом внутри. */
export function Ring({ share, value, caption, color = 'var(--sp-accent)', size = 220 }: { share: number; value: string | number; caption?: string; color?: string; size?: number }) {
  const p = Math.max(0, Math.min(1, share));
  return (
    <div className="sp-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 220 220" width={size} height={size} aria-hidden>
        <circle cx="110" cy="110" r={R} className="sp-ring-track" />
        <circle cx="110" cy="110" r={R} className="sp-ring-fill" style={{ stroke: color, strokeDasharray: C, strokeDashoffset: C * (1 - p) }} />
      </svg>
      <div className="sp-ring-mid">
        <b>{value}</b>
        {caption && <small>{caption}</small>}
      </div>
    </div>
  );
}

export function SportStage({ exercise, reps, target, share, leftMs, totalMs, live, step }: { exercise: RepExercise; reps: number; target: number; share: number; leftMs: number; totalMs: number; live: boolean; step?: string }) {
  const spent = Math.max(1, totalMs - leftMs);
  const pace = live && reps > 0 ? Math.round((reps / spent) * 60_000) : null;
  return (
    <div className="sp-stage">
      <div className="sp-top">
        <span className="sp-ex">{t(EXERCISE_LABELS[exercise])}</span>
        <span className="sp-clock">{clock(leftMs)}</span>
      </div>
      <Ring share={share} value={reps} caption={t('из {0}', { 0: target })} />
      <div className="sp-stats">
        <span>
          <small>{t('Темп')}</small>
          <b>{pace != null ? t('{0}/мин', { 0: pace }) : '—'}</b>
        </span>
        <span>
          <small>{t('Осталось')}</small>
          <b>{Math.max(0, target - reps)}</b>
        </span>
        {step && (
          <span>
            <small>{t('Этап')}</small>
            <b>{step}</b>
          </span>
        )}
      </div>
    </div>
  );
}
