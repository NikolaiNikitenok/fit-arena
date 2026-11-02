// Главная в стиле «Спорт»: вместо героя на сцене — сводка дня (повторы, серия, неделя), одна кнопка
// «Тренировка дня» и спокойный список разделов. Те же действия и замки, что у HeroHome.
import type { ComponentProps, ReactNode } from 'react';
import { amountText, EXERCISE_LABELS } from '../repCounter';
import { Album, Bag, Check, Cog, Dumbbell, Feed, Flame, Kettlebell, Lock, PassShield, Plan, Star, Swords, Users } from '../icons';
import { dayKey, heroLevel, heroXp, streakOf } from '../game/progress';
import { UNLOCK_AT, type Feature } from '../game/unlocks';
import type { HeroHome } from '../game/HeroHome';
import { useFeedBadge } from '../social/useFeedBadge';
import { locale, t } from '../i18n';
import { Ring } from './SportStage';
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
  const { progress, lives, current, onTrain, onSettings, daily, dailyDone, onDaily, onClaimDaily, onStrength, onAchievements, onPrograms, onGym, onFeed, onFriends, onPass, onShop, onDungeon, lockLeft, onLocked } = props;
  const now = Date.now();
  const feedDot = useFeedBadge();
  const week = weekReps(progress.days, now);
  const today = week[6].reps;
  const best = Math.max(1, ...week.map((d) => d.reps));
  const series = streakOf(progress, now).days;
  const lvl = heroLevel(heroXp(progress)).level;
  const total = week.reduce((s, d) => s + d.reps, 0);
  // Цель дня — как у задания дня, а если оно уже сделано, то средний активный день недели.
  const active = week.filter((d) => d.reps > 0);
  const goal = Math.max(30, Math.round(active.length ? active.reduce((s, d) => s + d.reps, 0) / active.length : 50));
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
    { icon: <PassShield size={20} />, title: t('Сезон'), sub: t('награды за активность'), ...g('pass', onPass) },
    { icon: <Bag size={20} />, title: t('Магазин'), sub: t('облики и бонусы'), ...g('shop', () => onShop()) },
    { icon: <Album size={20} />, title: t('Головоломка'), sub: t('три в ряд на заряде от тренировок'), ...g('dungeon', onDungeon) },
  ];
  return (
    <div className="sp-home">
      <header className="sp-home-head">
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

      <section className="sp-today">
        <Ring share={today / goal} value={today} caption={t('из {0} повт.', { 0: goal })} size={150} />
        <div className="sp-today-stats">
          <span>
            <small>{t('Серия')}</small>
            <b>{t('{0} дн.', { 0: series })}</b>
          </span>
          <span>
            <small>{t('За неделю')}</small>
            <b>{total}</b>
          </span>
          <span>
            <small>{t('Уровень')}</small>
            <b>{lvl}</b>
          </span>
        </div>
      </section>

      <div className="sp-week" aria-label={t('Повторы за неделю')}>
        {week.map((d, i) => (
          <div key={d.date} className={`sp-week-day ${i === 6 ? 'today' : ''}`}>
            <span style={{ height: `${Math.max(4, (d.reps / best) * 100)}%` }} />
            <small>{new Date(`${d.date}T12:00:00`).toLocaleDateString(locale(), { weekday: 'narrow' })}</small>
          </div>
        ))}
      </div>

      <button className="primary sp-cta" onClick={onTrain}>
        <Swords size={22} />
        <span>
          {t('Тренировка дня')}
          <small>{t('Уровень {0} · {1}', { 0: current.id, 1: current.exercises.map((e) => t(EXERCISE_LABELS[e]).toLowerCase()).join(', ') })}</small>
        </span>
      </button>

      <button className="sp-row sp-daily" onClick={dailyLeft === 0 && !dailyClaimed ? onClaimDaily : onDaily} disabled={dailyClaimed}>
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

      <div className="sp-list">
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
