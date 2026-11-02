// Стиль «Спорт» (src/settings.ts style): строгий экран подхода вместо 3D-сцены — счётчик в кольце прогресса,
// таймер, темп и цель. Те же данные, что у сцены приключения (MissionView), только без сказки.
import { useId, type ReactNode } from 'react';
import { Fireflies, Ripple, Sparks } from './fx';
import { EXERCISE_LABELS, type RepExercise } from '../repCounter';
import { t } from '../i18n';
import './sport.css';
import './fx.css';

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

/** Живой фон «газ»: размытые цветные пятна плывут, поверх — медленный перелив и светлячки.
 *  В экономном режиме (calm) всё стоит на месте. */
export function Gas({ calm }: { calm?: boolean }) {
  return (
    <div className={`sp-gas ${calm ? 'calm' : ''}`} aria-hidden>
      <span />
      <span />
      <span />
      <span />
      <em className="sp-sheen" />
      {!calm && <Fireflies />}
    </div>
  );
}

const TICKS = 60;

/** «Змейка»: светящаяся дуга прогресса с переливом и яркой головой; вокруг — шкала делений, которые
 *  загораются по мере прогресса, и медленная орбита. На каждый повтор — искры из головы и волна от кольца. */
export function Snake({ share, reps, children, size = 250, calm }: { share: number; reps: number; children: ReactNode; size?: number; calm?: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const p = Math.max(0, Math.min(1, share));
  const a = p * 2 * Math.PI;
  const hx = 110 + R * Math.cos(a);
  const hy = 110 + R * Math.sin(a);
  // Голова на экране (svg повёрнут на −90°): для искр в процентах контейнера.
  const k = (R / 220) * 100;
  const sx = 50 + k * Math.sin(a);
  const sy = 50 - k * Math.cos(a);
  const lit = Math.round(p * TICKS);
  const full = p >= 1;
  return (
    <div className={`sp-snake ${full ? 'full' : ''} ${calm ? 'calm' : ''}`} style={{ width: size, height: size }}>
      <span className="sp-aura" aria-hidden />
      <Ripple burst={calm ? 0 : reps} />
      <svg viewBox="0 0 220 220" width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id={`g${id}`} gradientUnits="userSpaceOnUse" x1="20" y1="20" x2="200" y2="200">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="45%" stopColor="#4ade80" />
            <stop offset="75%" stopColor="#bef264" />
            <stop offset="100%" stopColor="#a78bfa" />
            {!calm && <animateTransform attributeName="gradientTransform" type="rotate" from="0 110 110" to="360 110 110" dur="6s" repeatCount="indefinite" />}
          </linearGradient>
          <filter id={`b${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <g className="sp-ticks">
          {Array.from({ length: TICKS }, (_, i) => {
            const t2 = (i / TICKS) * 2 * Math.PI;
            const r1 = R + 17;
            const r2 = R + (i % 5 === 0 ? 24 : 21);
            return (
              <line key={i} x1={110 + r1 * Math.cos(t2)} y1={110 + r1 * Math.sin(t2)} x2={110 + r2 * Math.cos(t2)} y2={110 + r2 * Math.sin(t2)} className={i < lit ? 'on' : ''} style={{ transitionDelay: `${(i % 6) * 20}ms` }} />
            );
          })}
        </g>
        <circle cx="110" cy="110" r={R + 31} className="sp-orbit" />
        <circle cx="110" cy="110" r={R} className="sp-ring-track" />
        {!calm && <circle cx="110" cy="110" r={R} className="sp-snake-bloom" stroke={`url(#g${id})`} filter={`url(#b${id})`} style={{ strokeDasharray: C, strokeDashoffset: C * (1 - p) }} />}
        <circle cx="110" cy="110" r={R} className="sp-snake-body" stroke={`url(#g${id})`} style={{ strokeDasharray: C, strokeDashoffset: C * (1 - p) }} />
        {p > 0 && (
          <g key={reps} className="sp-snake-head-g">
            <circle cx={hx} cy={hy} r="16" className="sp-snake-halo" />
            <circle cx={hx} cy={hy} r="8" className="sp-snake-head" />
          </g>
        )}
      </svg>
      {!calm && <Sparks burst={reps} x={sx} y={sy} />}
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

const MILESTONES = [0.25, 0.5, 0.75];
const MILESTONE_TEXT = [t('Четверть!'), t('Половина!'), t('Финишная прямая!')];

export function SportStage({ exercise, reps, target, share, leftMs, totalMs, live, steps, calm }: { exercise: RepExercise; reps: number; target: number; share: number; leftMs: number; totalMs: number; live: boolean; steps?: SportStep[]; calm?: boolean }) {
  const spent = Math.max(1, totalMs - leftMs);
  const pace = live && reps > 0 ? Math.round((reps / spent) * 60_000) : null;
  const cur = steps?.find((s) => s.done < s.target);
  const shown = cur ? cur.done : reps;
  const goal = cur ? cur.target : target;
  const ringShare = cur ? cur.done / Math.max(1, cur.target) : share;
  // Отметки 25/50/75%: короткая надпись над кольцом.
  const passed = MILESTONES.filter((m) => share >= m).length;
  const hurry = live && leftMs < 10_000;
  return (
    <div className={`sp-stage ${live ? 'live' : ''} ${share >= 1 ? 'won' : ''} ${hurry ? 'hurry' : ''}`}>
      <Gas calm={calm} />
      <div className="sp-top">
        <span className="sp-ex">
          {live && <i className="sp-live" />}
          {t(EXERCISE_LABELS[exercise])}
        </span>
        <span className="sp-clock">{clock(leftMs)}</span>
      </div>
      <div className="sp-time" aria-hidden>
        <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, leftMs / Math.max(1, totalMs)))})` }} />
      </div>
      {passed > 0 && share < 1 && (
        <div key={passed} className="sp-mile">
          {MILESTONE_TEXT[passed - 1]}
        </div>
      )}
      <Snake share={ringShare} reps={reps} calm={calm}>
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
