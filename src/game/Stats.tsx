import { useState } from 'react';
import { EXERCISE_LABELS, type Exercise } from '../repCounter';
import { dayKey, type Progress } from './progress';

const EXERCISES: Exercise[] = ['squat', 'pushup', 'situp'];
export const EX_COLOR: Record<Exercise, string> = { squat: '#ffb46b', pushup: '#ff7a59', situp: '#7dd3fc', plank: '#6ee7b7' };
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const DAY = 86_400_000;

/** Календарь месяца: чем больше повторов, тем ярче день. */
export function Calendar({ progress, now }: { progress: Progress; now: number }) {
  const [shift, setShift] = useState(0);
  const base = new Date(now);
  const first = new Date(base.getFullYear(), base.getMonth() + shift, 1);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  // Неделя с понедельника.
  const lead = (first.getDay() + 6) % 7;
  const reps = (d: number) => progress.days[dayKey(new Date(first.getFullYear(), first.getMonth(), d).getTime())] ?? 0;
  const month = Array.from({ length: days }, (_, i) => reps(i + 1));
  const max = Math.max(50, ...month);
  const active = month.filter(Boolean).length;
  const total = month.reduce((a, b) => a + b, 0);
  const today = dayKey(now);
  const oldest = Object.keys(progress.days).sort()[0];
  const canBack = !!oldest && oldest < dayKey(first.getTime());
  return (
    <div className="calendar">
      <div className="cal-head">
        <button className="cal-nav" disabled={!canBack} onClick={() => setShift(shift - 1)} aria-label="Раньше">
          ‹
        </button>
        <div className="cal-title">
          {MONTHS[first.getMonth()]} {first.getFullYear() !== base.getFullYear() ? first.getFullYear() : ''}
          <div className="muted">
            {active} {active === 1 ? 'день' : active > 1 && active < 5 ? 'дня' : 'дней'} с тренировкой · {total.toLocaleString('ru')} повторов
          </div>
        </div>
        <button className="cal-nav" disabled={shift >= 0} onClick={() => setShift(shift + 1)} aria-label="Позже">
          ›
        </button>
      </div>
      <div className="cal-grid">
        {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((d) => (
          <span key={d} className="cal-wd">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`e${i}`} />
        ))}
        {month.map((r, i) => {
          const key = dayKey(new Date(first.getFullYear(), first.getMonth(), i + 1).getTime());
          const level = r ? Math.min(4, 1 + Math.floor((r / max) * 4)) : 0;
          return (
            <span key={i} className={`cal-day l${level} ${key === today ? 'today' : ''} ${key > today ? 'future' : ''}`} title={`${r} повторов`}>
              {i + 1}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Повторы за 30 дней по упражнениям и как рос лучший подход. */
export function RepsChart({ progress, now }: { progress: Progress; now: number }) {
  const days = Array.from({ length: 30 }, (_, i) => {
    const key = dayKey(now - (29 - i) * DAY);
    const log = progress.log?.[key];
    const total = progress.days[key] ?? 0;
    const byEx = EXERCISES.map((ex) => log?.r[ex] ?? 0);
    // Повторы до журнала (или в смешанных миссиях) — серым «другое».
    return { key, total, byEx, other: Math.max(0, total - byEx.reduce((a, b) => a + b, 0)) };
  });
  const max = Math.max(20, ...days.map((d) => d.total));
  const W = 300;
  const H = 120;
  const bw = W / 30;
  // Лучший подход по дням для каждого упражнения: ломаная.
  const lines = EXERCISES.map((ex) => {
    const pts = Object.entries(progress.log ?? {})
      .filter(([, d]) => d.b[ex])
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .slice(-30)
      .map(([, d]) => d.b[ex]!);
    return { ex, pts };
  });
  const bestMax = Math.max(10, ...lines.flatMap((l) => l.pts));
  return (
    <div className="chart">
      <div className="chart-title">Повторы за 30 дней</div>
      <svg viewBox={`0 0 ${W} ${H + 14}`} className="chart-svg" aria-hidden>
        {[0.5, 1].map((f) => (
          <line key={f} x1={0} x2={W} y1={H - H * f} y2={H - H * f} className="chart-grid" />
        ))}
        {days.map((d, i) => {
          let y = H;
          const parts = [...d.byEx.map((v, j) => ({ v, c: EX_COLOR[EXERCISES[j]] })), { v: d.other, c: '#5b6075' }];
          return (
            <g key={d.key}>
              {parts.map((p, j) => {
                if (!p.v) return null;
                const h = (p.v / max) * (H - 4);
                y -= h;
                return <rect key={j} x={i * bw + 1.5} y={y} width={bw - 3} height={h} rx={1.5} fill={p.c} />;
              })}
              {i % 7 === 2 && (
                <text x={i * bw + bw / 2} y={H + 12} className="chart-label" textAnchor="middle">
                  {d.key.slice(8)}.{d.key.slice(5, 7)}
                </text>
              )}
            </g>
          );
        })}
        <text x={W} y={10} className="chart-label" textAnchor="end">
          {max}
        </text>
      </svg>
      <div className="chart-legend">
        {EXERCISES.map((ex) => (
          <span key={ex}>
            <i style={{ background: EX_COLOR[ex] }} />
            {EXERCISE_LABELS[ex]}
          </span>
        ))}
      </div>
      {lines.some((l) => l.pts.length > 1) && (
        <>
          <div className="chart-title">Лучший подход: как растёт сила</div>
          <svg viewBox={`0 0 ${W} 90`} className="chart-svg" aria-hidden>
            {lines.map(
              (l) =>
                l.pts.length > 1 && (
                  <polyline
                    key={l.ex}
                    points={l.pts.map((v, i) => `${(i / (l.pts.length - 1)) * (W - 8) + 4},${86 - (v / bestMax) * 78}`).join(' ')}
                    fill="none"
                    stroke={EX_COLOR[l.ex]}
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ),
            )}
          </svg>
        </>
      )}
    </div>
  );
}
