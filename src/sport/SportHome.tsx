// Главная в стиле «Спорт»: вместо героя на сцене — сводка дня (повторы, серия, неделя), одна кнопка
// «Тренировка дня» и спокойный список разделов. Те же действия и замки, что у HeroHome.
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { amountText, EXERCISE_LABELS } from '../repCounter';
import { Check, Cog, Dumbbell, Feed, Flame, Kettlebell, Lock, Plan, Star, Swords, Users } from '../icons';
import { dayKey, heroLevel, heroXp, streakOf } from '../game/progress';
import { UNLOCK_AT, type Feature } from '../game/unlocks';
import type { HeroHome } from '../game/HeroHome';
import { useFeedBadge } from '../social/useFeedBadge';
import { locale, t } from '../i18n';
import { Gas, Snake } from './SportStage';
import { CountUp } from './fx';
import './fx.css';
import { useSettings } from '../settings';
import './sport.css';

type Props = ComponentProps<typeof HeroHome>;
const DAY = 86_400_000;

/** Повторы за последние 7 дней, от старого к сегодняшнему. */
export function weekReps(days: Record<string, number>, now: number): { date: string; reps: number }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = dayKey(now - (6 - i) * DAY);
    return { date, reps: Math.max(0, Math.floor(Number(days[date]) || 0)) };
  });
}

export function SportHome(props: Props) {
  const { progress, lives, current, onTrain, onSettings, daily, dailyDone, onDaily, onClaimDaily, onStrength, onAchievements, onPrograms, onGym, onFeed, onFriends, lockLeft, onLocked } = props;
  const now = Date.now();
  const { dayGoal, lowPower: calm } = useSettings();
  const feedDot = useFeedBadge();
  const week = weekReps(progress.days, now);
  const today = week[6].reps;
  const best = Math.max(1, ...week.map((d) => d.reps));
  const series = streakOf(progress, now).days;
  const lvl = heroLevel(heroXp(progress)).level;
  const total = week.reduce((s, d) => s + d.reps, 0);
  // Цель дня — из знакомства-чата, а без неё — средний активный день недели.
  const active = week.filter((d) => d.reps > 0);
  const goal = dayGoal ?? Math.max(30, Math.round(active.length ? active.reduce((s, d) => s + d.reps, 0) / active.length : 50));
  const dailyLeft = Math.max(0, daily.target - dailyDone);
  const dailyClaimed = progress.dailyDone === daily.date;
  const g = (f: Feature, fn: () => void) => (lockLeft(f) ? { lock: UNLOCK_AT[f], onClick: () => onLocked(f) } : { lock: 0, onClick: fn });
  const rows: { icon: ReactNode; title: string; sub: string; dot?: boolean; lock: number; onClick: () => void }[] = [
    { icon: <Plan size={20} />, title: t('Программы тренировок'), sub: t('план на несколько недель'), ...g('programs', onPrograms) },
    { icon: <Kettlebell size={20} />, title: t('Дневник зала'), sub: t('свои тренировки с весами'), ...g('gym', onGym) },
    { icon: <Flame size={20} />, title: t('Статистика'), sub: t('рекорды, календарь и график'), lock: 0, onClick: onStrength },
    { icon: <Star size={20} />, title: t('Достижения'), sub: t('цели и награды'), lock: 0, onClick: onAchievements },
    { icon: <Feed size={20} />, title: t('Лента'), sub: t('результаты других игроков'), dot: feedDot, lock: 0, onClick: onFeed },
    { icon: <Users size={20} />, title: t('Друзья'), sub: t('вызовы и совместные тренировки'), lock: 0, onClick: onFriends },
  ];
  return (
    <div className="sp-home">
      <Gas calm={calm} />
      <header className="sp-home-head fx-in">
        <div>
          <small>{new Date(now).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })}</small>
          <h1>{t('Сегодня')}</h1>
        </div>
        <div className="sp-home-tools">
          {lives}
          <button className="sp-icon-btn" aria-label={t('Настройки')} onClick={onSettings}>
            <Cog size={20} />
          </button>
        </div>
      </header>

      <section className="sp-today fx-in fx-edge" style={{ '--i': '.08s' } as CSSProperties}>
        <Snake share={today / goal} reps={today} size={150} calm>
          <b>
            <CountUp value={today} />
          </b>
          <small>{t('из {0} повт.', { 0: goal })}</small>
        </Snake>
        <div className="sp-today-stats">
          <span>
            <small>{t('Серия')}</small>
            <b>{t('{0} дн.', { 0: series })}</b>
          </span>
          <span>
            <small>{t('За неделю')}</small>
            <b>
              <CountUp value={total} ms={1200} />
            </b>
          </span>
          <span>
            <small>{t('Уровень')}</small>
            <b>{lvl}</b>
          </span>
        </div>
      </section>

      <div className="sp-week fx-in" style={{ '--i': '.16s' } as CSSProperties} aria-label={t('Повторы за неделю')}>
        {week.map((d, i) => (
          <div key={d.date} className={`sp-week-day ${i === 6 ? 'today' : ''}`}>
            <span style={{ height: `${Math.max(4, (d.reps / best) * 100)}%`, '--i': `${0.3 + i * 0.06}s` } as CSSProperties} />
            <small>{new Date(`${d.date}T12:00:00`).toLocaleDateString(locale(), { weekday: 'narrow' })}</small>
          </div>
        ))}
      </div>

      <button className="primary sp-cta fx-in fx-shine fx-flow" style={{ '--i': '.24s' } as CSSProperties} onClick={onTrain}>
        <Swords size={22} />
        <span>
          {t('Тренировка дня')}
          <small>{t('Уровень {0} · {1}', { 0: current.id, 1: current.exercises.map((e) => t(EXERCISE_LABELS[e]).toLowerCase()).join(', ') })}</small>
        </span>
      </button>

      <button className="sp-row sp-daily fx-in" style={{ '--i': '.3s' } as CSSProperties} onClick={dailyLeft === 0 && !dailyClaimed ? onClaimDaily : onDaily} disabled={dailyClaimed}>
        <span className="sp-row-icon">{dailyClaimed ? <Check size={20} /> : <Dumbbell size={20} />}</span>
        <span className="sp-row-text">
          <b>{t('Задание дня')}</b>
          <small>
            {dailyClaimed
              ? t('выполнено')
              : dailyLeft === 0
                ? t('готово — забрать награду')
                : `${t(EXERCISE_LABELS[daily.exercise])}: ${amountText(daily.exercise, dailyLeft)}`}
          </small>
        </span>
      </button>

      <div className="sp-list fx-in" style={{ '--i': '.36s' } as CSSProperties}>
        {rows.map((r) => (
          <button key={r.title} className={`sp-row ${r.lock ? 'locked' : ''}`} onClick={r.onClick}>
            <span className="sp-row-icon">{r.lock ? <Lock size={18} /> : r.icon}</span>
            <span className="sp-row-text">
              <b>{r.title}</b>
              <small>{r.lock ? t('откроется после ур. {0}', { 0: r.lock }) : r.sub}</small>
            </span>
            {r.dot && !r.lock && <span className="hb-dot" />}
          </button>
        ))}
      </div>
    </div>
  );
}
