import { type CSSProperties, lazy, ReactNode, Suspense, useEffect, useState } from 'react';
import { amountText, EXERCISE_LABELS } from '../repCounter';
import { PetFace } from './PetEntry';
import { Gear, GEAR, gearById, gearIcon, gearText, ITEMS, itemById, PotionId, POTIONS, RARITY_COLORS, RARITY_NAMES } from './items';
import { BASE_DAMAGE, heroPower } from './power';
import { LevelDef } from './levels';
import type { DailyTask } from './daily';
import { AchBadge } from './Achievements';
import { achDone, ACHIEVEMENTS, heroBadge, visibleAchievements } from './achievements';
import { Portrait } from './Dialog';
import { NPCS, portraitUrl } from './npcs';
import { dayKey, heroLevel, heroTitle, heroXp, maxLives, Progress, streakOf } from './progress';
import { Album, Bag, Check, City, Coin, Cog, Dumbbell, Flame, Flask, GoldShieldArt, Heart, HolidayToken, Kettlebell, Lock, PassShield, Plan, Swords, Users } from '../icons';
import type { Feature } from './unlocks';
import { pickToday, TodayKind } from './today';
import { HOLIDAY_GOAL, holidayAt, holidayOutfit, holidayTokens, tokenWord } from './holidays';
import { collectionDone, visibleCollections } from './collections';
import { OutfitFace } from './EventScreen';
import './holiday.css';
import { gymOf, todayTemplate } from '../gym/gym';
import { PASS_TIERS, passTier } from './pass';
import { passOf } from './progress';
import { availability, programById, programsOf } from './programs';
import { petLevel, petName, petXp } from './pets';
import { villageOf } from './resources';
import { Bolt, MonsterFace } from './match3/art';
import { DUNGEON_LANDS, dungeonOf, FLOOR_COST, FLOOR_COUNT, floorDef } from './match3/dungeon';
import { homeBadges } from './homeBadges';
import { WorldBackdrop } from './WorldBackdrop';
import { useSettings } from '../settings';
import { LANDS } from './lands';
import { MONTHS, MONTHS_OF, recapMonth } from './recap';
import { lastTitan, titanWindow } from '../../shared/titan';
import { daysUntil, eventBoss, eventBossSay, eventOf, eventWindow, fmtDays, fmtLeft, triesLeft } from './event';
import { clearedLevels } from './unlocks';
import './home.css';
import { Sheet } from '../Sheet';
import { t, locale } from '../i18n';

// Главное меню на один экран телефона: сверху ресурсы, герой, большая кнопка боя и задание дня,
// под ними четыре быстрые плитки и сетка «Ещё». Снаряжение и сила героя — в листе по тапу на героя.

// Портреты тех же моделей, что и у героя в этом снаряжении.
const FACE: Record<string, string> = { Knight: 'hero', Rogue: 'lisa', Mage: 'fedor', Barbarian: 'grom' };
const ItemFace = ({ hero, color, glow, size }: { hero: string; color: string; glow?: string; size?: number }) => (
  <span className="inv-face" style={{ background: `radial-gradient(circle at 50% 35%, ${color}, #1b1d26 80%)`, boxShadow: glow ? `0 0 12px ${glow}` : undefined, width: size, height: size }}>
    <img src={portraitUrl(FACE[hero] ?? 'hero')} alt="" draggable={false} />
  </span>
);

// 3D-витрина героя грузится отдельно: меню видно сразу, а three.js докачивается следом.
const HeroStage = lazy(() => import('./HeroStage').then((m) => ({ default: m.HeroStage })));

interface Props {
  progress: Progress;
  lives: ReactNode;
  current: LevelDef;
  onTrain: () => void;
  onShop: (tab?: ShopTab) => void;
  onStrength: () => void;
  onEquip: (id: string) => void;
  onEquipGear: (id: string) => void;
  onPotion: (id: PotionId) => void;
  onSettings: () => void;
  daily: DailyTask;
  dailyDone: number;
  onDaily: () => void;
  onClaimDaily: () => void;
  onAchievements: () => void;
  // Pro Pass от сервера: золотой щит за героем.
  pro: boolean;
  onPass: () => void;
  // Событие выходных: экран босса месяца.
  onEvent: () => void;
  // Экран питомцев.
  onPets: () => void;
  // Программы тренировок Мастера Грома.
  onPrograms: () => void;
  // Дневник зала: свои тренировки с весами.
  onGym: () => void;
  // Подземелье «три в ряд»: тратит заряд от тренировок.
  onDungeon: () => void;
  // Друзья: экран во вкладке дуэли.
  onFriends: () => void;
  // Праздник Атлетии, коллекции обликов и топ города.
  onHoliday: () => void;
  onCollections: () => void;
  onCity: () => void;
  onRecap: (month: string) => void;
  onTitan: () => void;
  // Сколько жизней сейчас: от них зависит, что предложит «Тренировка дня».
  livesLeft: number;
  // Сколько уровней карты осталось до раздела (0 — открыт) и что сказать, если нажали закрытый.
  lockLeft: (f: Feature) => number;
  onLocked: (f: Feature) => void;
}

export type ShopTab = 'weapon' | 'offhand' | 'outfit' | 'potion';
const INV_TABS: { tab: ShopTab; label: string }[] = [
  { tab: 'weapon', label: t('Оружие') },
  { tab: 'offhand', label: t('Щиты') },
  { tab: 'outfit', label: t('Облик') },
  { tab: 'potion', label: t('Зелья') },
];

export const GearFace = ({ g, size = 52 }: { g: Gear; size?: number }) => (
  <span className="gear-face" style={{ width: size, height: size, borderColor: RARITY_COLORS[g.rarity], boxShadow: g.glow ? `0 0 14px ${g.glow}66` : undefined }}>
    <img src={gearIcon(g.id)} alt="" draggable={false} />
  </span>
);

/** Метка на плитке: точка или число. */
const Dot = ({ n }: { n: number | boolean }) => (n ? <span className="hb-dot">{typeof n === 'number' && n > 1 ? n : ''}</span> : null);

/** Закрытый раздел: замок поверх значка и сколько уровней карты осталось. */
const LockMark = () => (
  <span className="hb-lock" aria-hidden>
    <Lock size={12} />
  </span>
);
const lockSub = (n: number) => t('откроется через {0} ур.', { 0: n });

/** Большая карточка раздела под героем: значок, название, состояние и полоска прогресса в цвете раздела. */
function Feat({ title, sub, icon, color, bar, dot, cls = '', iconCls = '', lock = 0, onClick }: { title: string; sub: string; icon: ReactNode; color: string; bar?: number; dot?: number | boolean; cls?: string; iconCls?: string; lock?: number; onClick: () => void }) {
  return (
    <button className={`hb-feat ${cls} ${lock ? 'locked' : ''}`} style={{ ['--fc' as string]: color }} onClick={onClick}>
      <span className={`hb-feat-icon ${iconCls}`}>
        {icon}
        {lock > 0 && <LockMark />}
      </span>
      <span className="hb-feat-text">
        <b>{title}</b>
        <small>{lock ? lockSub(lock) : sub}</small>
        {bar !== undefined && !lock && (
          <span className="hb-feat-bar">
            <span style={{ width: `${Math.max(4, Math.min(100, bar * 100))}%` }} />
          </span>
        )}
      </span>
      <Dot n={lock ? 0 : (dot ?? 0)} />
    </button>
  );
}

/** Кнопка боковой колонки главной «во весь экран»: значок-плитка, подпись и точка. */
function Side({ title, sub, icon, color, dot, lock = 0, onClick }: { title: string; sub?: string; icon: ReactNode; color: string; dot?: number | boolean; lock?: number; onClick: () => void }) {
  return (
    <button className={`hv-btn ${lock ? 'locked' : ''}`} style={{ ['--c' as string]: color }} onClick={onClick}>
      <span className="hv-ico">
        {icon}
        {lock > 0 ? <LockMark /> : <Dot n={dot ?? 0} />}
      </span>
      <b>{title}</b>
      {lock ? <small>{t('через {0} ур.', { 0: lock })}</small> : sub && <small>{sub}</small>}
    </button>
  );
}

type Tone = 'accent' | 'gold' | 'mint' | 'teal' | 'blue' | 'violet' | 'rose' | 'pet';
/** Плитка сетки «Ещё»: яркий значок-«иконка приложения» и подпись. */
function More({ title, sub, icon, tone, dot, cls = '', style, lock = 0, onClick }: { title: string; sub: string; icon: ReactNode; tone: Tone; dot?: number | boolean; cls?: string; style?: CSSProperties; lock?: number; onClick: () => void }) {
  return (
    <button className={`hb-more-item ${cls} ${lock ? 'locked' : ''}`} style={style} onClick={onClick}>
      <span className={`hb-more-icon ${tone}`}>
        {icon}
        {lock > 0 && <LockMark />}
      </span>
      <span className="hb-more-text">
        <b>{title}</b>
        <small>{lock ? lockSub(lock) : sub}</small>
      </span>
      <Dot n={lock ? 0 : (dot ?? 0)} />
    </button>
  );
}

/** Значок «все разделы»: четыре квадратика. */
const MoreIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
    {[3, 13].flatMap((x) => [3, 13].map((y) => <rect key={`${x}${y}`} x={x} y={y} width="8" height="8" rx="2.5" fill="currentColor" />))}
  </svg>
);

/** Часы раз в 30 секунд: отсчёт события на плитке. */
function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tm = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(tm);
  }, [ms]);
  return now;
}

export function HeroHome(props: Props) {
  const { progress, lives, current, onTrain, onShop, onStrength, onSettings, daily, dailyDone, onDaily, onClaimDaily, onAchievements, pro, onPass, onEvent, onPets, onPrograms, onGym, onDungeon, onFriends, onHoliday, onCollections, onCity, onRecap, onTitan, lockLeft, onLocked, livesLeft } = props;
  // Закрытый раздел: вместо перехода — подсказка, когда он откроется.
  const g = (f: Feature, fn: () => void) => ({ lock: lockLeft(f), onClick: lockLeft(f) ? () => onLocked(f) : fn });
  const gym = gymOf(progress);
  const now = useNow();
  const gymToday = todayTemplate(gym, now);
  const [heroOpen, setHeroOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Вид главной: «сцена» — герой во весь экран, кнопки по бокам, без прокрутки; или старый список (настройки).
  const layout = useSettings().homeList ? 'feed' : 'stage';
  const badges = homeBadges(progress, daily, pro, now);
  const item = itemById(progress.equipped);
  const lvl = heroLevel(heroXp(progress));
  const series = streakOf(progress, now);
  const weapon = gearById(progress.weapon);
  const offhand = gearById(progress.offhand);
  const charge = villageOf(progress).charge;

  // Подземелье: недоигранный этаж важнее следующего.
  const dg = dungeonOf(progress);
  const unfinished = dg.run?.floor;
  const floor = floorDef(unfinished ?? Math.min(FLOOR_COUNT, dg.reached));
  const land = DUNGEON_LANDS[floor.land];
  const monster = floor.monster ?? { shape: land.boss[1], color: land.boss[2] };
  const floors = Math.floor(charge / FLOOR_COST);

  // Программа Грома.
  const run = programsOf(progress).run;
  const prog = run && programById(run.id);
  const av = run && availability(run, now);

  // Пропуск сезона.
  const passT = passTier(passOf(progress, now).xp);

  // Событие выходных: плитка, пока идёт; в остальные дни — анонс в «Ещё», а плитка — достижения.
  const w = eventWindow(now);
  const boss = eventBoss(w.key);
  const ev = eventOf(progress, now);
  const bossFace = eventBossSay(boss, '');

  const achAll = visibleAchievements(progress, now);
  const achGot = achAll.filter((a) => achDone(a, progress, now));
  const lastAch = achGot[achGot.length - 1];

  // Праздник: полоса под заданием дня, пока он идёт.
  const hol = holidayAt(now);
  const holTokens = hol.live ? holidayTokens(progress, hol) : 0;
  // За неделю до начала полоса уже видна: анонс.
  const holShown = hol.live || hol.start - now < 7 * 86_400_000;
  const cols = visibleCollections(now);
  const colsDone = cols.filter((c) => collectionDone(c, progress)).length;

  // Первая неделя месяца: итоги прошлого.
  const recapM = recapMonth(progress, now);
  // Титан: за 3 дня до появления — анонс, пока идёт — битва, 3 дня после — итоги и награда.
  const titan = titanWindow(now);
  const titanLast = lastTitan(now);
  const titanShown = titan.live || titan.start - now < 3 * 86_400_000 ? titan : now - titanLast.end < 3 * 86_400_000 ? titanLast : null;

  // На главной — одна полоса события, самая важная сейчас: идущий Титан, идущий праздник, свежие итоги,
  // потом анонсы. Остальные события не пропадают — они плитками в начале «Ещё».
  const recapFresh = !!recapM && progress.recapSeen !== recapM;
  // Титан и праздник — после открытия событий: в первые дни новичку хватает карты.
  const eventsOpen = !lockLeft('events');
  const slots = [
    eventsOpen && titanShown?.live && 'titan',
    eventsOpen && hol.live && 'holiday',
    recapFresh && 'recap',
    eventsOpen && titanShown && !titanShown.live && 'titan',
    eventsOpen && holShown && !hol.live && 'holiday',
    recapM && !recapFresh && 'recap',
  ].filter((x): x is 'titan' | 'holiday' | 'recap' => !!x);
  // «Тренировка дня»: одна кнопка выбирает лучшее дело на сегодня (src/game/today.ts).
  const dailyClaimed = progress.dailyDone === daily.date;
  const today: TodayKind = pickToday({
    cleared: clearedLevels(progress),
    lives: livesLeft,
    unlocked: (f) => !lockLeft(f),
    programReady: av === 'ready',
    dailyDone,
    dailyTarget: daily.target,
    dailyClaimed,
    eventLive: w.live,
    eventWon: !!ev.won,
    eventTries: triesLeft(progress, now),
    dungeonFloors: unfinished ? 1 : floors,
  });
  const todayGo: Record<TodayKind, () => void> = { level: onTrain, program: onPrograms, daily: onDaily, event: onEvent, dungeon: onDungeon, programs: onPrograms };
  const todaySub: Record<TodayKind, string> = {
    level: t('Уровень карты {0} · {1}', { 0: current.num, 1: current.title }),
    program: prog && run ? t('{0} · день {1}', { 0: prog.title, 1: run.day }) : t('Программа Грома'),
    daily: t('{0}: {1} — просьба жителя', { 0: EXERCISE_LABELS[daily.exercise], 1: amountText(daily.exercise, Math.max(0, daily.target - dailyDone)) }),
    event: t('{0}: попыток сегодня {1}', { 0: boss.name, 1: triesLeft(progress, now) }),
    dungeon: t('Жизни копятся — потрать заряд в подземелье'),
    programs: t('Жизни копятся — тренировка по программе'),
  };
  const cta = (
    <button className="primary hb-cta" onClick={todayGo[today]}>
      <Swords size={24} />
      <span className="hb-cta-text">
        {t('Тренировка дня')}
        <small>{todaySub[today]}</small>
      </span>
    </button>
  );
  const slot = slots[0];
  const extra = slots.slice(1);

  const pet = progress.pets?.active;
  const petLvl = pet ? petLevel(petXp(progress, pet)).level : 0;

  const achFeat = (
    <Feat color="#ffd27a" onClick={onAchievements} title={t('Достижения')} sub={t('{0} из {1}', { 0: achGot.length, 1: achAll.length })} bar={achAll.length ? achGot.length / achAll.length : 0} dot={badges.achievements} icon={<AchBadge ach={lastAch ?? ACHIEVEMENTS[0]} done={!!lastAch} size={44} />} />
  );

  // Шапка: настройки, жизни, серия, монеты, заряд — одна на оба вида главной.
  const head = (
    <div className="app-head hb-head">
      <button className="pill btn icon-only hb-hit" onClick={onSettings} aria-label={t('Настройки')}>
        <Cog />
      </button>
      <div className="stats">
        {lives}
        <button className="pill btn hb-hit" onClick={onStrength} aria-label={t('Серия и сила')}>
          <Flame className="flame" /> {series.days}
        </button>
        <button className="pill btn hb-hit" {...g('shop', () => onShop())} aria-label={t('Монеты: лавка')}>
          <Coin className="coin" /> {progress.coins}
        </button>
        {!lockLeft('dungeon') && (
          <button className="pill btn hb-hit" onClick={onDungeon} aria-label={t('Заряд подземелья')}>
            <Bolt className="hb-bolt" /> {charge}
          </button>
        )}
      </div>
    </div>
  );

  // Полоса самого важного события сейчас (Титан, итоги, праздник).
  const eventBanner = (
    <>
      {slot === 'titan' && titanShown && (
        <button className="hb-titan" style={{ ['--tg' as string]: titanShown.def.glow }} onClick={onTitan}>
          <MonsterFace shape="golem" color={titanShown.def.color} boss angry size={44} />
          <span className="hb-titan-text">
            <b>{titanShown.def.name}</b>
            <small>{titanShown.live ? t('Вся страна бьёт Титана · ещё {0}', { 0: fmtLeft(titanShown.end - now) }) : now < titanShown.start ? t('Нападёт {0} — готовься', { 0: fmtDays(Math.ceil((titanShown.start - now) / 86_400_000)) }) : t('Битва окончена: итоги и награда')}</small>
          </span>
          <Dot n={titanShown.live} />
        </button>
      )}

      {slot === 'recap' && recapM && (
        <button className="hb-recap" onClick={() => onRecap(recapM)}>
          <span className="hb-recap-emoji">🎉</span>
          <span className="hb-recap-text">
            <b>{t('Итоги {0} готовы', { 0: MONTHS_OF[Number(recapM.slice(5)) - 1] })}</b>
            <small>{t('Твой месяц в цифрах — посмотри и поделись')}</small>
          </span>
          <Dot n={progress.recapSeen !== recapM} />
        </button>
      )}

      {slot === 'holiday' && (
        <button className="hb-holiday" style={{ ['--hs1' as string]: hol.def.sky[0], ['--hs2' as string]: hol.def.sky[1], ['--hg' as string]: hol.def.glow }} onClick={onHoliday}>
          <HolidayToken id={hol.def.id} size={30} />
          <span className="hb-holiday-text">
            <b>{hol.def.name}</b>
            <small>{hol.live ? t('{0} {1} · ещё {2}', { 0: holTokens.toLocaleString(locale()), 1: tokenWord(hol.def, holTokens), 2: fmtLeft(hol.end - now) }) : t('праздник {0}', { 0: fmtDays(daysUntil({ ...hol, live: false }, now)) })}</small>
            <span className="hb-holiday-bar">
              <span style={{ width: `${Math.min(100, (holTokens / HOLIDAY_GOAL) * 100)}%` }} />
            </span>
          </span>
          <OutfitFace id={holidayOutfit(hol).id} size={34} />
          <Dot n={badges.holiday} />
        </button>
      )}
    </>
  );

  // Главная «как в играх»: герой во весь экран на своём мире, главные разделы столбиками по бокам,
  // внизу задание дня и бой. Остальное — под «Ещё». Без прокрутки.
  if (layout === 'stage') {
    const world = LANDS[current.land].world;
    const moreDot = badges.achievements || (extra.includes('titan') && titanShown?.live) || (extra.includes('recap') && recapFresh);
    return (
      <>
      <div className="hv">
        <div className="hv-stage" role="button" tabIndex={0} aria-label={t('Герой и снаряжение')} onClick={() => setHeroOpen(true)} onKeyDown={(e) => e.key === 'Enter' && setHeroOpen(true)}>
          <WorldBackdrop world={world} />
          <Suspense fallback={null}>
            <HeroStage progress={progress} world={world} far />
          </Suspense>
        </div>

        <div className="hv-top">
          {head}
          {slot && <div className="hv-event">{eventBanner}</div>}
        </div>

        <div className="hv-col left">
          <Side title={t('Пропуск')} sub={t('{0} из {1}', { 0: passT.tier, 1: PASS_TIERS })} color={pro ? '#ffd27a' : '#8fb3ff'} dot={badges.pass} {...g('pass', onPass)} icon={<PassShield size={34} gold={pro} label={passT.tier} />} />
          {w.live && eventsOpen ? (
            <Side title={t('Событие')} sub={ev.won ? t('победа!') : fmtLeft(w.end - now)} color={boss.glow} dot={badges.event} {...g('events', onEvent)} icon={<Portrait line={bossFace} size={44} />} />
          ) : (
            <Side title={t('Награды')} sub={t('{0} из {1}', { 0: achGot.length, 1: achAll.length })} color="#ffd27a" dot={badges.achievements} onClick={onAchievements} icon={<AchBadge ach={lastAch ?? ACHIEVEMENTS[0]} done={!!lastAch} size={40} />} />
          )}
          <Side title={t('Подземелье')} sub={unfinished ? t('не доигран') : floors ? `×${floors}` : t('{0} повт.', { 0: FLOOR_COST - charge })} color={land.accent} dot={badges.dungeon} {...g('dungeon', onDungeon)} icon={<MonsterFace shape={monster.shape} color={monster.color} boss={floor.boss} size={42} />} />
          <Side title={t('Программы')} sub={prog && run ? t('день {0}', { 0: run.day }) : t('план')} color="#ff8a5c" dot={badges.programs} {...g('programs', onPrograms)} icon={<Plan size={26} />} />
        </div>

        <div className="hv-col right">
          <Side title={t('Лавка')} sub={t('Фёдора')} color="#ffd27a" {...g('shop', () => onShop())} icon={<Bag size={26} />} />
          <Side title={pet ? petName(progress, pet) : t('Питомец')} sub={pet ? t('ур. {0}', { 0: petLvl }) : t('яйцо')} color="#ffb46b" dot={badges.pets} onClick={onPets} icon={pet ? <PetFace id={pet} size={40} /> : <span className="pet-entry-egg hb-egg" />} />
          <Side title={t('Друзья')} sub={t('и вызовы')} color="#ff6b81" {...g('duel', onFriends)} icon={<Users size={26} />} />
          <Side title={t('Ещё')} sub={t('все разделы')} color="#a78bfa" dot={moreDot} onClick={() => setMoreOpen(true)} icon={<MoreIcon />} />
        </div>

        <button className={`hv-hero ${pro ? 'pro' : ''}`} onClick={() => setHeroOpen(true)}>
          <span className="hero-level hb-level">
            {lvl.level}
            <small>{t('ур.')}</small>
          </span>
          <span className="hb-hero-meta">
            <span className="hb-hero-title">
              <span className={pro ? 'pro-name' : ''}>{heroTitle(lvl.level)}</span>
              {pro && <span className="pro-chip">PRO</span>}
            </span>
            <span className="xp-bar">
              <span style={{ display: 'block', width: `${(lvl.into / lvl.need) * 100}%` }} />
            </span>
          </span>
          <span className="chev">›</span>
        </button>

        <div className="hv-bottom">
          {!lockLeft('daily') && <DailyChip task={daily} done={dailyDone} claimed={dailyClaimed} onPlay={onDaily} onClaim={onClaimDaily} />}
          {cta}
        </div>

        </div>

        {/* Листы — вне .hv: внутри него (fixed) они оказались бы под нижним меню. */}
        {moreOpen && (
          <Sheet onClose={() => setMoreOpen(false)}>
            <div className="level-title">{t('Все разделы')}</div>
            <div className="hb-more">
              {extra.includes('titan') && titanShown && <More onClick={onTitan} title={t('Титан')} sub={titanShown.live ? t('битва идёт') : now < titanShown.start ? fmtDays(Math.ceil((titanShown.start - now) / 86_400_000)) : t('итоги')} dot={titanShown.live} icon={<MonsterFace shape="golem" color={titanShown.def.color} boss size={40} />} tone="pet" />}
              {extra.includes('holiday') && <More onClick={onHoliday} title={hol.def.name} sub={hol.live ? t('ещё {0}', { 0: fmtLeft(hol.end - now) }) : fmtDays(daysUntil({ ...hol, live: false }, now))} dot={badges.holiday} icon={<HolidayToken id={hol.def.id} size={32} />} tone="pet" />}
              {extra.includes('recap') && recapM && <More onClick={() => onRecap(recapM)} title={t('Итоги')} sub={MONTHS[Number(recapM.slice(5)) - 1]} dot={recapFresh} icon={<span className="hb-recap-emoji">🎉</span>} tone="pet" />}
              <More onClick={() => setHeroOpen(true)} title={t('Вещи')} sub={t('и зелья')} icon={<Swords size={22} />} tone="accent" />
              <More onClick={onStrength} title={t('Сила')} sub={t('рекорды')} icon={<Dumbbell size={22} />} tone="mint" />
              <More {...g('gym', onGym)} title={t('Зал')} sub={gym.run ? t('идёт') : gymToday ? t('сегодня') : t('дневник')} icon={<Kettlebell size={22} />} tone="teal" />
              <More {...g('collections', onCollections)} title={t('Коллекции')} sub={t('{0} из {1}', { 0: colsDone, 1: cols.length })} icon={<Album size={22} />} tone="violet" />
              <More {...g('city', onCity)} title={t('Битва городов')} sub={t('карта России')} icon={<City size={22} />} tone="blue" />
              {w.live ? (
                <More onClick={onAchievements} title={t('Достижения')} sub={t('{0} из {1}', { 0: achGot.length, 1: achAll.length })} dot={badges.achievements} icon={<AchBadge ach={lastAch ?? ACHIEVEMENTS[0]} done={!!lastAch} size={40} />} tone="pet" />
              ) : (
                <More {...g('events', onEvent)} cls="hb-event-soon" style={{ ['--eg' as string]: boss.glow }} title={t('Событие')} sub={fmtDays(daysUntil(w, now))} icon={<Portrait line={bossFace} size={40} />} tone="pet" />
              )}
            </div>
          </Sheet>
        )}
        {heroOpen && <HeroSheet {...props} onClose={() => setHeroOpen(false)} />}
      </>
    );
  }

  return (
    <div className="home hb">
      {head}

      <div className={`hero-card hb-hero ${pro ? 'pro' : ''}`} role="button" tabIndex={0} aria-label={t('Герой и снаряжение')} onClick={() => setHeroOpen(true)} onKeyDown={(e) => e.key === 'Enter' && setHeroOpen(true)}>
        <div className="hero-stage hb-stage">
          {/* За героем — мир, в котором он сейчас сражается. */}
          <WorldBackdrop world={LANDS[current.land].world} />
          {pro && <GoldShieldArt className="gold-art" />}
          <Suspense fallback={null}>
            <HeroStage progress={progress} world={LANDS[current.land].world} />
          </Suspense>
        </div>
        <div className="hb-hero-bar">
          <span className="hero-level hb-level">
            {lvl.level}
            <small>{t('ур.')}</small>
          </span>
          <span className="hb-hero-meta">
            <span className="hb-hero-title">
              <span className={pro ? 'pro-name' : ''}>{heroTitle(lvl.level)}</span>
              {pro && <span className="pro-chip">PRO</span>}
            </span>
            <span className="xp-bar">
              <span style={{ display: 'block', width: `${(lvl.into / lvl.need) * 100}%` }} />
            </span>
          </span>
          <span className="hb-gear" aria-hidden>
            <ItemFace hero={item.hero} color={item.color} glow={item.glow} size={30} />
            {weapon ? <GearFace g={weapon} size={30} /> : <span className="gear-face empty" style={{ width: 30, height: 30 }} />}
            {offhand ? <GearFace g={offhand} size={30} /> : <span className="gear-face empty" style={{ width: 30, height: 30 }}>+</span>}
          </span>
          <span className="chev">›</span>
        </div>
      </div>

      {cta}

      {!lockLeft('daily') && <DailyChip task={daily} done={dailyDone} claimed={dailyClaimed} onPlay={onDaily} onClaim={onClaimDaily} />}

      {eventBanner}

      <div className="hb-feats">
        <Feat cls={`hb-dungeon ${unfinished || floors ? 'ready' : ''}`} color={land.accent} {...g('dungeon', onDungeon)} title={t('Подземелье')} sub={unfinished ? t('этаж {0} не доигран', { 0: floor.id }) : floors ? t('этаж {0} · ×{1}', { 0: floor.id, 1: floors }) : t('ещё {0} повт.', { 0: FLOOR_COST - charge })} bar={unfinished || floors ? 1 : charge / FLOOR_COST} dot={badges.dungeon} icon={<MonsterFace shape={monster.shape} color={monster.color} boss={floor.boss} size={44} />} />
        <Feat color="#ff8a5c" {...g('programs', onPrograms)} title={t('Программы')} sub={prog && run ? (av === 'ready' ? t('день {0} сегодня', { 0: run.day }) : t('день {0} из {1}', { 0: run.day, 1: prog.days })) : t('выбрать план')} bar={prog && run ? (run.day - 1) / prog.days : undefined} dot={badges.programs} icon={<Plan size={28} />} iconCls="hb-prog" />
        <Feat cls={pro ? 'pro' : ''} color={pro ? '#ffd27a' : '#8fb3ff'} {...g('pass', onPass)} title={t('Пропуск')} sub={t('ступень {0} из {1}', { 0: passT.tier, 1: PASS_TIERS })} bar={passT.into / passT.need} dot={badges.pass} icon={<PassShield size={40} gold={pro} label={passT.tier} />} />
        {w.live && eventsOpen ? (
          <Feat cls={`hb-event ${ev.won ? 'won' : ''}`} color={boss.glow} {...g('events', onEvent)} title={t('Событие')} sub={ev.won ? t('босс повержен!') : t('ещё {0}', { 0: fmtLeft(w.end - now) })} dot={badges.event} icon={<Portrait line={bossFace} size={46} />} />
        ) : (
          achFeat
        )}
      </div>

      <div className="hb-more-title">{t('Ещё')}</div>
      <div className="hb-more">
        {extra.includes('titan') && titanShown && <More onClick={onTitan} title={t('Титан')} sub={titanShown.live ? t('битва идёт') : now < titanShown.start ? fmtDays(Math.ceil((titanShown.start - now) / 86_400_000)) : t('итоги')} dot={titanShown.live} icon={<MonsterFace shape="golem" color={titanShown.def.color} boss size={40} />} tone="pet" />}
        {extra.includes('holiday') && <More onClick={onHoliday} title={hol.def.name} sub={hol.live ? t('ещё {0}', { 0: fmtLeft(hol.end - now) }) : fmtDays(daysUntil({ ...hol, live: false }, now))} dot={badges.holiday} icon={<HolidayToken id={hol.def.id} size={32} />} tone="pet" />}
        {extra.includes('recap') && recapM && <More onClick={() => onRecap(recapM)} title={t('Итоги')} sub={MONTHS[Number(recapM.slice(5)) - 1]} dot={recapFresh} icon={<span className="hb-recap-emoji">🎉</span>} tone="pet" />}
        <More onClick={onPets} title={pet ? petName(progress, pet) : t('Питомец')} sub={pet ? t('ур. {0}', { 0: petLvl }) : t('яйцо ждёт')} dot={badges.pets} icon={pet ? <PetFace id={pet} size={40} /> : <span className="pet-entry-egg hb-egg" />} tone="pet" />
        <More onClick={() => setHeroOpen(true)} title={t('Вещи')} sub={t('и зелья')} icon={<Swords size={22} />} tone="accent" />
        <More {...g('shop', () => onShop())} title={t('Лавка')} sub={t('Фёдора')} icon={<Bag size={22} />} tone="gold" />
        <More onClick={onStrength} title={t('Сила')} sub={t('рекорды')} icon={<Dumbbell size={22} />} tone="mint" />
        <More {...g('gym', onGym)} title={t('Зал')} sub={gym.run ? t('идёт') : gymToday ? t('сегодня') : t('дневник')} dot={!!gym.run || (!!gymToday && !gym.history.some((s) => dayKey(s.start) === dayKey(now)))} icon={<Kettlebell size={22} />} tone="teal" />
        <More {...g('collections', onCollections)} title={t('Коллекции')} sub={t('{0} из {1}', { 0: colsDone, 1: cols.length })} icon={<Album size={22} />} tone="violet" />
        <More {...g('city', onCity)} title={t('Битва городов')} sub={t('карта России')} icon={<City size={22} />} tone="blue" />
        <More {...g('duel', onFriends)} title={t('Друзья')} sub={t('и вызовы')} icon={<Users size={22} />} tone="rose" />
        {w.live ? (
          <More onClick={onAchievements} title={t('Достижения')} sub={t('{0} из {1}', { 0: achGot.length, 1: achAll.length })} dot={badges.achievements} icon={<AchBadge ach={lastAch ?? ACHIEVEMENTS[0]} done={!!lastAch} size={40} />} tone="pet" />
        ) : (
          <More {...g('events', onEvent)} cls="hb-event-soon" style={{ ['--eg' as string]: boss.glow }} title={t('Событие')} sub={fmtDays(daysUntil(w, now))} icon={<Portrait line={bossFace} size={40} />} tone="pet" />
        )}
      </div>

      {heroOpen && <HeroSheet {...props} onClose={() => setHeroOpen(false)} />}
    </div>
  );
}

/** Задание дня одной строкой: просьба жителя, полоска и действие справа. */
function DailyChip({ task, done, claimed, onPlay, onClaim }: { task: DailyTask; done: number; claimed: boolean; onPlay: () => void; onClaim: () => void }) {
  const npc = NPCS[task.npc];
  const ready = done >= task.target;
  return (
    <button className={`hb-daily ${claimed ? 'claimed' : ready ? 'ready' : ''}`} disabled={claimed} onClick={ready ? onClaim : onPlay}>
      <Portrait line={{ face: task.npc, color: npc.color, who: npc.name }} size={38} />
      <span className="hb-daily-text">
        <span className="hb-daily-who">
          {t('Задание дня')} · <span style={{ color: npc.color }}>{npc.name}</span>
        </span>
        <span className="hb-daily-goal">
          {EXERCISE_LABELS[task.exercise]}: <b>{amountText(task.exercise, Math.min(done, task.target))}</b> / {amountText(task.exercise, task.target)}
          <span className="hb-daily-gift">
            <Coin size={12} className="coin" /> {task.coins}
            {task.potion && <Flask size={14} color={task.potion === 'vigor' ? '#ff6b81' : task.potion === 'might' ? '#ffb46b' : '#7dd3fc'} scroll={task.potion === 'swap'} />}
          </span>
        </span>
        <span className="hb-daily-bar">
          <span style={{ width: `${Math.min(100, (done / task.target) * 100)}%`, background: npc.color }} />
        </span>
      </span>
      <span className="hb-daily-act">
        {claimed ? (
          <>
            <Check size={14} /> {t('готово')}
          </>
        ) : ready ? (
          t('Забрать')
        ) : done > 0 ? (
          t('Доделать')
        ) : (
          t('Начать')
        )}
      </span>
      {ready && !claimed && <Dot n />}
    </button>
  );
}

/** Лист героя: уровень и урон, слоты снаряжения, инвентарь и зелья. */
function HeroSheet({ progress, pro, onShop, onEquip, onEquipGear, onPotion, onAchievements, onClose }: Props & { onClose: () => void }) {
  const badge = heroBadge(progress);
  const item = itemById(progress.equipped);
  const lvl = heroLevel(heroXp(progress));
  const power = heroPower(progress, progress.might);
  const weapon = gearById(progress.weapon);
  const offhand = gearById(progress.offhand);
  const [inv, setInv] = useState<ShopTab>('weapon');
  const ownedGear = GEAR.filter((g) => progress.items.includes(g.id) && g.slot === inv);
  const owned = ITEMS.filter((i) => progress.items.includes(i.id));

  return (
    <Sheet onClose={onClose} bodyClassName="hb-sheet">
      <div className="hero-info hb-sheet-info">
        <div className="hero-level">{lvl.level}</div>
        <div className="hero-meta">
          <div className="hero-title">
            <span className={pro ? 'pro-name' : ''}>{heroTitle(lvl.level)}</span>
            {pro && <span className="pro-chip">PRO</span>}
          </div>
          {badge && (
            <button className="hero-badge" onClick={onAchievements}>
              <AchBadge ach={badge} done size={18} /> {badge.title}
            </button>
          )}
          <div className="hero-skin" style={{ color: RARITY_COLORS[item.rarity] }}>
            {item.name}
          </div>
          <div className="xp-bar">
            <div style={{ width: `${(lvl.into / lvl.need) * 100}%` }} />
          </div>
          <div className="xp-text">
            {t('{0} / {1} опыта · 1 повтор = 1 опыт', { 0: lvl.into, 1: lvl.need })}
          </div>
        </div>
      </div>
      <div className="power-tiles hb-sheet-power">
        <div>
          <b>
            <Swords size={16} /> {power.damage}
          </b>
          <span>{t('урон за повтор')}</span>
        </div>
        <div>
          <b>
            <Heart size={15} className="heart" /> {maxLives(progress)}
          </b>
          <span>{t('жизней')}</span>
        </div>
        <div>
          <b>
            <Heart size={15} className="heart" /> {power.hearts}
          </b>
          <span>{t('сердец у боссов')}</span>
        </div>
      </div>
      <div className="power-hint hb-sheet-hint">
        {t('Урон: база {0} + уровень {1} + снаряжение {2}', { 0: BASE_DAMAGE, 1: power.level, 2: power.atk })}
        {power.pct > 0 && t(' и +{0}%', { 0: (Math.round(power.pct * 1000) / 10).toLocaleString(locale()) })}
        {power.pet > 0 && t(' (питомец +{0}%)', { 0: (Math.round(power.pet * 1000) / 10).toLocaleString(locale()) })}
        {power.offhandOff && t(' · двуручное оружие: вторая рука не действует')}
      </div>

      <div className="slots">
        <button className={`slot ${inv === 'outfit' ? 'on' : ''}`} onClick={() => setInv('outfit')}>
          <ItemFace hero={item.hero} color={item.color} glow={item.glow} />
          <span className="slot-label">{t('Облик')}</span>
          <span className="slot-name">{item.name}</span>
        </button>
        <button className={`slot ${inv === 'weapon' ? 'on' : ''}`} onClick={() => setInv('weapon')}>
          {weapon ? <GearFace g={weapon} /> : <span className="gear-face empty" />}
          <span className="slot-label">{t('Оружие')}</span>
          <span className="slot-name">{weapon?.name ?? t('пусто')}</span>
        </button>
        <button className={`slot ${power.offhandOff ? 'off' : ''} ${inv === 'offhand' ? 'on' : ''}`} onClick={() => setInv('offhand')}>
          {offhand ? <GearFace g={offhand} /> : <span className="gear-face empty">+</span>}
          <span className="slot-label">{t('Вторая рука')}</span>
          <span className="slot-name">{offhand?.name ?? t('пусто')}</span>
        </button>
      </div>

      <div className="section-title">
        {t('Инвентарь')}
        <button className="link hb-hit" onClick={() => onShop(inv)}>
          {t('Лавка Фёдора ›')}
        </button>
      </div>
      <div className="tabs hb-tabs">
        {INV_TABS.map((tm) => (
          <button key={tm.tab} className={inv === tm.tab ? 'active' : ''} onClick={() => setInv(tm.tab)}>
            {tm.label}
          </button>
        ))}
      </div>
      {inv === 'potion' ? (
        <div className="potion-list">
          {POTIONS.map((pt) => {
            const n = progress.potions?.[pt.id] ?? 0;
            const active = pt.id === 'might' && progress.might;
            return (
              <div key={pt.id} className={`potion ${n ? '' : 'none'}`}>
                <Flask color={pt.color} scroll={pt.id === 'swap'} />
                <div className="potion-body">
                  <div className="potion-name">
                    {pt.name} <span className="potion-count">×{n}</span>
                  </div>
                  <div className="muted">{active ? t('Выпит: действует в следующем бою') : pt.text}</div>
                </div>
                {n > 0 ? (
                  <button className="small-btn" disabled={!!active} onClick={() => onPotion(pt.id)}>
                    {pt.id === 'swap' ? t('Прочесть') : t('Выпить')}
                  </button>
                ) : (
                  <button className="small-btn ghost" onClick={() => onShop('potion')}>
                    <Coin size={13} /> {pt.price}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="inventory">
          {inv === 'outfit'
            ? owned.map((i) => (
                <button key={i.id} className={`inv-item ${progress.equipped === i.id ? 'on' : ''}`} style={{ borderColor: progress.equipped === i.id ? RARITY_COLORS[i.rarity] : undefined }} onClick={() => onEquip(i.id)}>
                  <ItemFace hero={i.hero} color={i.color} glow={i.glow} />
                  <span className="inv-name">{i.name}</span>
                  <span className="inv-meta" style={{ color: RARITY_COLORS[i.rarity] }}>
                    {progress.equipped === i.id ? t('надето') : i.coinBonus ? t('+{0}% монет', { 0: Math.round(i.coinBonus * 100) }) : RARITY_NAMES[i.rarity]}
                  </span>
                </button>
              ))
            : ownedGear.map((g) => {
                const on = progress.weapon === g.id || progress.offhand === g.id;
                return (
                  <button key={g.id} className={`inv-item ${on ? 'on' : ''}`} style={{ borderColor: on ? RARITY_COLORS[g.rarity] : undefined }} onClick={() => onEquipGear(g.id)}>
                    <GearFace g={g} />
                    <span className="inv-name">{g.name}</span>
                    <span className="inv-meta" style={{ color: on ? RARITY_COLORS[g.rarity] : undefined }}>
                      {on ? t('надето') : gearText(g)}
                    </span>
                  </button>
                );
              })}
          <button className="inv-item add" onClick={() => onShop(inv)}>
            <span className="gear-face empty">+</span>
            <span className="inv-name">{t('Ещё в лавке')}</span>
            <span className="inv-meta">{t('и в сундуках')}</span>
          </button>
        </div>
      )}
    </Sheet>
  );
}
