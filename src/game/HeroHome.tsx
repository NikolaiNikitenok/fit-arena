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
import { Album, Bag, Check, City, Coin, Cog, Dumbbell, Flame, Flask, GoldShieldArt, Heart, HolidayToken, Kettlebell, PassShield, Plan, Swords, Users } from '../icons';
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
import { MONTHS_OF, recapMonth } from './recap';
import { lastTitan, titanWindow } from '../../shared/titan';
import { daysUntil, eventBoss, eventBossSay, eventOf, eventWindow, fmtDays, fmtLeft, triesLeft } from './event';
import './home.css';
import { Sheet } from '../Sheet';

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
}

export type ShopTab = 'weapon' | 'offhand' | 'outfit' | 'potion';
const INV_TABS: { tab: ShopTab; label: string }[] = [
  { tab: 'weapon', label: 'Оружие' },
  { tab: 'offhand', label: 'Щиты' },
  { tab: 'outfit', label: 'Облик' },
  { tab: 'potion', label: 'Зелья' },
];

export const GearFace = ({ g, size = 52 }: { g: Gear; size?: number }) => (
  <span className="gear-face" style={{ width: size, height: size, borderColor: RARITY_COLORS[g.rarity], boxShadow: g.glow ? `0 0 14px ${g.glow}66` : undefined }}>
    <img src={gearIcon(g.id)} alt="" draggable={false} />
  </span>
);

/** Метка на плитке: точка или число. */
const Dot = ({ n }: { n: number | boolean }) => (n ? <span className="hb-dot">{typeof n === 'number' && n > 1 ? n : ''}</span> : null);

/** Большая карточка раздела под героем: значок, название, состояние и полоска прогресса в цвете раздела. */
function Feat({ title, sub, icon, color, bar, dot, cls = '', iconCls = '', onClick }: { title: string; sub: string; icon: ReactNode; color: string; bar?: number; dot?: number | boolean; cls?: string; iconCls?: string; onClick: () => void }) {
  return (
    <button className={`hb-feat ${cls}`} style={{ ['--fc' as string]: color }} onClick={onClick}>
      <span className={`hb-feat-icon ${iconCls}`}>{icon}</span>
      <span className="hb-feat-chev" aria-hidden>
        ›
      </span>
      <b>{title}</b>
      <small>{sub}</small>
      {bar !== undefined && (
        <span className="hb-feat-bar">
          <span style={{ width: `${Math.max(4, Math.min(100, bar * 100))}%` }} />
        </span>
      )}
      <Dot n={dot ?? 0} />
    </button>
  );
}

type Tone = 'accent' | 'gold' | 'mint' | 'teal' | 'blue' | 'violet' | 'rose' | 'pet';
/** Плитка сетки «Ещё»: яркий значок-«иконка приложения» и подпись. */
function More({ title, sub, icon, tone, dot, cls = '', style, onClick }: { title: string; sub: string; icon: ReactNode; tone: Tone; dot?: number | boolean; cls?: string; style?: CSSProperties; onClick: () => void }) {
  return (
    <button className={`hb-more-item ${cls}`} style={style} onClick={onClick}>
      <span className={`hb-more-icon ${tone}`}>{icon}</span>
      <span className="hb-more-text">
        <b>{title}</b>
        <small>{sub}</small>
      </span>
      <Dot n={dot ?? 0} />
    </button>
  );
}

/** Часы раз в 30 секунд: отсчёт события на плитке. */
function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function HeroHome(props: Props) {
  const { progress, lives, current, onTrain, onShop, onStrength, onSettings, daily, dailyDone, onDaily, onClaimDaily, onAchievements, pro, onPass, onEvent, onPets, onPrograms, onGym, onDungeon, onFriends, onHoliday, onCollections, onCity, onRecap, onTitan } = props;
  const gym = gymOf(progress);
  const now = useNow();
  const gymToday = todayTemplate(gym, now);
  const [heroOpen, setHeroOpen] = useState(false);
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

  const pet = progress.pets?.active;
  const petLvl = pet ? petLevel(petXp(progress, pet)).level : 0;

  const achFeat = (
    <Feat color="#ffd27a" onClick={onAchievements} title="Достижения" sub={`${achGot.length} из ${achAll.length}`} bar={achAll.length ? achGot.length / achAll.length : 0} dot={badges.achievements} icon={<AchBadge ach={lastAch ?? ACHIEVEMENTS[0]} done={!!lastAch} size={44} />} />
  );

  return (
    <div className="home hb">
      <div className="app-head hb-head">
        <button className="pill btn icon-only hb-hit" onClick={onSettings} aria-label="Настройки">
          <Cog />
        </button>
        <div className="stats">
          {lives}
          <button className="pill btn hb-hit" onClick={onStrength} aria-label="Серия и сила">
            <Flame className="flame" /> {series.days}
          </button>
          <button className="pill btn hb-hit" onClick={() => onShop()} aria-label="Монеты: лавка">
            <Coin className="coin" /> {progress.coins}
          </button>
          <button className="pill btn hb-hit" onClick={onDungeon} aria-label="Заряд подземелья">
            <Bolt className="hb-bolt" /> {charge}
          </button>
        </div>
      </div>

      <div className={`hero-card hb-hero ${pro ? 'pro' : ''}`} role="button" tabIndex={0} aria-label="Герой и снаряжение" onClick={() => setHeroOpen(true)} onKeyDown={(e) => e.key === 'Enter' && setHeroOpen(true)}>
        <div className="hero-stage hb-stage">
          {pro && <GoldShieldArt className="gold-art" />}
          <Suspense fallback={null}>
            <HeroStage progress={progress} />
          </Suspense>
        </div>
        <div className="hb-hero-bar">
          <span className="hero-level hb-level">{lvl.level}</span>
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

      <button className="primary hb-cta" onClick={onTrain}>
        <Swords size={24} />
        <span className="hb-cta-text">
          В бой: уровень {current.num}
          <small>{current.title}</small>
        </span>
      </button>

      <DailyChip task={daily} done={dailyDone} claimed={progress.dailyDone === daily.date} onPlay={onDaily} onClaim={onClaimDaily} />

      {titanShown && (
        <button className="hb-titan" style={{ ['--tg' as string]: titanShown.def.glow }} onClick={onTitan}>
          <MonsterFace shape="golem" color={titanShown.def.color} boss angry size={44} />
          <span className="hb-titan-text">
            <b>{titanShown.def.name}</b>
            <small>{titanShown.live ? `Вся страна бьёт Титана · ещё ${fmtLeft(titanShown.end - now)}` : now < titanShown.start ? `Нападёт ${fmtDays(Math.ceil((titanShown.start - now) / 86_400_000))} — готовься` : 'Битва окончена: итоги и награда'}</small>
          </span>
          <Dot n={titanShown.live} />
        </button>
      )}

      {recapM && (
        <button className="hb-recap" onClick={() => onRecap(recapM)}>
          <span className="hb-recap-emoji">🎉</span>
          <span className="hb-recap-text">
            <b>Итоги {MONTHS_OF[Number(recapM.slice(5)) - 1]} готовы</b>
            <small>Твой месяц в цифрах — посмотри и поделись</small>
          </span>
          <Dot n={progress.recapSeen !== recapM} />
        </button>
      )}

      {holShown && (
        <button className="hb-holiday" style={{ ['--hs1' as string]: hol.def.sky[0], ['--hs2' as string]: hol.def.sky[1], ['--hg' as string]: hol.def.glow }} onClick={onHoliday}>
          <HolidayToken id={hol.def.id} size={30} />
          <span className="hb-holiday-text">
            <b>{hol.def.name}</b>
            <small>{hol.live ? `${holTokens.toLocaleString('ru')} ${tokenWord(hol.def, holTokens)} · ещё ${fmtLeft(hol.end - now)}` : `праздник ${fmtDays(daysUntil({ ...hol, live: false }, now))}`}</small>
            <span className="hb-holiday-bar">
              <span style={{ width: `${Math.min(100, (holTokens / HOLIDAY_GOAL) * 100)}%` }} />
            </span>
          </span>
          <OutfitFace id={holidayOutfit(hol).id} size={34} />
          <Dot n={badges.holiday} />
        </button>
      )}

      <div className="hb-feats">
        <Feat cls={`hb-dungeon ${unfinished || floors ? 'ready' : ''}`} color={land.accent} onClick={onDungeon} title="Подземелье" sub={unfinished ? `этаж ${floor.id} не доигран` : floors ? `этаж ${floor.id} · ×${floors}` : `ещё ${FLOOR_COST - charge} повт.`} bar={unfinished || floors ? 1 : charge / FLOOR_COST} dot={badges.dungeon} icon={<MonsterFace shape={monster.shape} color={monster.color} boss={floor.boss} size={44} />} />
        <Feat color="#ff8a5c" onClick={onPrograms} title="Программы" sub={prog && run ? (av === 'ready' ? `день ${run.day} сегодня` : `день ${run.day} из ${prog.days}`) : 'выбрать план'} bar={prog && run ? (run.day - 1) / prog.days : undefined} dot={badges.programs} icon={<Plan size={28} />} iconCls="hb-prog" />
        <Feat cls={pro ? 'pro' : ''} color={pro ? '#ffd27a' : '#8fb3ff'} onClick={onPass} title="Пропуск" sub={`ступень ${passT.tier} из ${PASS_TIERS}`} bar={passT.into / passT.need} dot={badges.pass} icon={<PassShield size={40} gold={pro} label={passT.tier} />} />
        {w.live ? (
          <Feat cls={`hb-event ${ev.won ? 'won' : ''}`} color={boss.glow} onClick={onEvent} title="Событие" sub={ev.won ? 'босс повержен!' : `ещё ${fmtLeft(w.end - now)}`} dot={badges.event} icon={<Portrait line={bossFace} size={46} />} />
        ) : (
          achFeat
        )}
      </div>

      <div className="hb-more-title">Ещё</div>
      <div className="hb-more">
        <More onClick={onPets} title={pet ? petName(progress, pet) : 'Питомец'} sub={pet ? `ур. ${petLvl}` : 'яйцо ждёт'} dot={badges.pets} icon={pet ? <PetFace id={pet} size={40} /> : <span className="pet-entry-egg hb-egg" />} tone="pet" />
        <More onClick={() => setHeroOpen(true)} title="Вещи" sub="и зелья" icon={<Swords size={22} />} tone="accent" />
        <More onClick={() => onShop()} title="Лавка" sub="Фёдора" icon={<Bag size={22} />} tone="gold" />
        <More onClick={onStrength} title="Сила" sub="рекорды" icon={<Dumbbell size={22} />} tone="mint" />
        <More onClick={onGym} title="Зал" sub={gym.run ? 'идёт' : gymToday ? 'сегодня' : 'дневник'} dot={!!gym.run || (!!gymToday && !gym.history.some((s) => dayKey(s.start) === dayKey(now)))} icon={<Kettlebell size={22} />} tone="teal" />
        <More onClick={onCollections} title="Коллекции" sub={`${colsDone} из ${cols.length}`} icon={<Album size={22} />} tone="violet" />
        <More onClick={onCity} title="Битва городов" sub="карта России" icon={<City size={22} />} tone="blue" />
        <More onClick={onFriends} title="Друзья" sub="и вызовы" icon={<Users size={22} />} tone="rose" />
        {w.live ? (
          <More onClick={onAchievements} title="Достижения" sub={`${achGot.length} из ${achAll.length}`} dot={badges.achievements} icon={<AchBadge ach={lastAch ?? ACHIEVEMENTS[0]} done={!!lastAch} size={40} />} tone="pet" />
        ) : (
          <More onClick={onEvent} cls="hb-event-soon" style={{ ['--eg' as string]: boss.glow }} title="Событие" sub={fmtDays(daysUntil(w, now))} icon={<Portrait line={bossFace} size={40} />} tone="pet" />
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
          Задание дня · <span style={{ color: npc.color }}>{npc.name}</span>
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
            <Check size={14} /> готово
          </>
        ) : ready ? (
          'Забрать'
        ) : done > 0 ? (
          'Доделать'
        ) : (
          'Начать'
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
            {lvl.into} / {lvl.need} опыта · 1 повтор = 1 опыт
          </div>
        </div>
      </div>
      <div className="power-tiles hb-sheet-power">
        <div>
          <b>
            <Swords size={16} /> {power.damage}
          </b>
          <span>урон за повтор</span>
        </div>
        <div>
          <b>
            <Heart size={15} className="heart" /> {maxLives(progress)}
          </b>
          <span>жизней</span>
        </div>
        <div>
          <b>
            <Heart size={15} className="heart" /> {power.hearts}
          </b>
          <span>сердец у боссов</span>
        </div>
      </div>
      <div className="power-hint hb-sheet-hint">
        Урон: база {BASE_DAMAGE} + уровень {power.level} + снаряжение {power.atk}
        {power.pct > 0 && ` и +${(Math.round(power.pct * 1000) / 10).toLocaleString('ru')}%`}
        {power.pet > 0 && ` (питомец +${(Math.round(power.pet * 1000) / 10).toLocaleString('ru')}%)`}
        {power.offhandOff && ' · двуручное оружие: вторая рука не действует'}
      </div>

      <div className="slots">
        <button className={`slot ${inv === 'outfit' ? 'on' : ''}`} onClick={() => setInv('outfit')}>
          <ItemFace hero={item.hero} color={item.color} glow={item.glow} />
          <span className="slot-label">Облик</span>
          <span className="slot-name">{item.name}</span>
        </button>
        <button className={`slot ${inv === 'weapon' ? 'on' : ''}`} onClick={() => setInv('weapon')}>
          {weapon ? <GearFace g={weapon} /> : <span className="gear-face empty" />}
          <span className="slot-label">Оружие</span>
          <span className="slot-name">{weapon?.name ?? 'пусто'}</span>
        </button>
        <button className={`slot ${power.offhandOff ? 'off' : ''} ${inv === 'offhand' ? 'on' : ''}`} onClick={() => setInv('offhand')}>
          {offhand ? <GearFace g={offhand} /> : <span className="gear-face empty">+</span>}
          <span className="slot-label">Вторая рука</span>
          <span className="slot-name">{offhand?.name ?? 'пусто'}</span>
        </button>
      </div>

      <div className="section-title">
        Инвентарь
        <button className="link hb-hit" onClick={() => onShop(inv)}>
          Лавка Фёдора ›
        </button>
      </div>
      <div className="tabs hb-tabs">
        {INV_TABS.map((t) => (
          <button key={t.tab} className={inv === t.tab ? 'active' : ''} onClick={() => setInv(t.tab)}>
            {t.label}
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
                  <div className="muted">{active ? 'Выпит: действует в следующем бою' : pt.text}</div>
                </div>
                {n > 0 ? (
                  <button className="small-btn" disabled={!!active} onClick={() => onPotion(pt.id)}>
                    {pt.id === 'swap' ? 'Прочесть' : 'Выпить'}
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
                    {progress.equipped === i.id ? 'надето' : i.coinBonus ? `+${Math.round(i.coinBonus * 100)}% монет` : RARITY_NAMES[i.rarity]}
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
                      {on ? 'надето' : gearText(g)}
                    </span>
                  </button>
                );
              })}
          <button className="inv-item add" onClick={() => onShop(inv)}>
            <span className="gear-face empty">+</span>
            <span className="inv-name">Ещё в лавке</span>
            <span className="inv-meta">и в сундуках</span>
          </button>
        </div>
      )}
    </Sheet>
  );
}
