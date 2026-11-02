// Стиль «Спорт» (src/settings.ts style): строгий экран подхода вместо 3D-сцены — счётчик в кольце прогресса,
// таймер, темп и цель. Те же данные, что у сцены приключения (MissionView), только без сказки.
import type { ReactNode } from 'react';
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

/** Живой фон «газ»: несколько размытых пятен медленно плывут за экраном. В экономном режиме стоят на месте. */
export function Gas({ calm }: { calm?: boolean }) {
  return (
    <div className={`sp-gas ${calm ? 'calm' : ''}`} aria-hidden>
      <span />
      <span />
      <span />
    </div>
  );
}

/** «Змейка»: светящаяся дуга прогресса с яркой головой, вокруг медленно крутится пунктирная орбита.
 *  На каждый повтор кольцо коротко вспыхивает (key = reps перезапускает анимацию). */
export function Snake({ share, reps, children, size = 250 }: { share: number; reps: number; children: ReactNode; size?: number }) {
  const p = Math.max(0, Math.min(1, share));
  const a = p * 2 * Math.PI;
  const hx = 110 + R * Math.cos(a);
  const hy = 110 + R * Math.sin(a);
  return (
    <div className="sp-snake" style={{ width: size, height: size }}>
      <svg viewBox="0 0 220 220" width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id="sp-snake-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="55%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#bef264" />
          </linearGradient>
        </defs>
        <circle cx="110" cy="110" r={R + 13} className="sp-orbit" />
        <circle cx="110" cy="110" r={R} className="sp-ring-track" />
        <circle cx="110" cy="110" r={R} className="sp-snake-body" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - p) }} />
        {p > 0 && <circle key={reps} cx={hx} cy={hy} r="9" className="sp-snake-head" />}
      </svg>
      <div key={reps} className="sp-ring-mid sp-bump">
        {children}
      </div>
    </div>
  );
}

export interface SportStep {
  exercise: RepExercise;
  target: number;
  done: number;
}

/** Список упражнений тренировки: раскрывается по одному, текущее подсвечено и заполняется. */
export function StepList({ steps }: { steps: SportStep[] }) {
  const now = steps.findIndex((s) => s.done < s.target);
  return (
    <ol className="sp-steps">
      {steps.map((s, i) => {
        const state = now === -1 || i < now ? 'done' : i === now ? 'now' : 'next';
        return (
          <li key={i} className={`sp-step ${state}`} style={{ animationDelay: `${0.12 * i + 0.2}s` }}>
            <span className="sp-step-dot">{state === 'done' ? '✓' : i + 1}</span>
            <span className="sp-step-name">{t(EXERCISE_LABELS[s.exercise])}</span>
            <span className="sp-step-count">
              {state === 'next' ? s.target : `${Math.min(s.done, s.target)}/${s.target}`}
            </span>
            {state === 'now' && (
              <span className="sp-step-bar">
                <span style={{ width: `${(Math.min(s.done, s.target) / Math.max(1, s.target)) * 100}%` }} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function SportStage({ exercise, reps, target, share, leftMs, totalMs, live, steps, calm }: { exercise: RepExercise; reps: number; target: number; share: number; leftMs: number; totalMs: number; live: boolean; steps?: SportStep[]; calm?: boolean }) {
  const spent = Math.max(1, totalMs - leftMs);
  const pace = live && reps > 0 ? Math.round((reps / spent) * 60_000) : null;
  const cur = steps?.find((s) => s.done < s.target);
  const shown = cur ? cur.done : reps;
  const goal = cur ? cur.target : target;
  return (
    <div className={`sp-stage ${live ? 'live' : ''}`}>
      <Gas calm={calm} />
      <div className="sp-top">
        <span className="sp-ex">
          {live && <i className="sp-live" />}
          {t(EXERCISE_LABELS[exercise])}
        </span>
        <span className="sp-clock">{clock(leftMs)}</span>
      </div>
      <Snake share={cur ? cur.done / Math.max(1, cur.target) : share} reps={reps}>
        <b>{shown}</b>
        <small>{t('из {0}', { 0: goal })}</small>
      </Snake>
      <div className="sp-stats">
        <span>
          <small>{t('Темп')}</small>
          <b>{pace != null ? t('{0}/мин', { 0: pace }) : '—'}</b>
        </span>
        <span>
          <small>{t('Осталось')}</small>
          <b>{Math.max(0, target - (steps ? steps.reduce((a, s) => a + Math.min(s.done, s.target), 0) : reps))}</b>
        </span>
      </div>
      {steps && steps.length > 1 && <StepList steps={steps} />}
    </div>
  );
}
