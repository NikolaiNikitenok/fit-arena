import { lazy, ReactNode, Suspense, useEffect, useState } from 'react';
import { amountText, EXERCISE_LABELS } from '../repCounter';
import { PetFace } from './PetEntry';
import { Gear, GEAR, gearById, gearIcon, gearText, ITEMS, itemById, PotionId, POTIONS, RARITY_COLORS, RARITY_NAMES } from './items';
import { BASE_DAMAGE, heroPower } from './power';
import { LevelDef } from './levels';
import type { DailyTask } from './daily';
import { AchBadge } from './Achievements';
import { achDone, ACHIEVEMENTS, heroBadge } from './achievements';
import { Portrait } from './Dialog';
import { NPCS, portraitUrl } from './npcs';
import { heroLevel, heroTitle, heroXp, maxLives, Progress, streak } from './progress';
import { Bag, Check, Coin, Cog, Dumbbell, Flame, Flask, GoldShieldArt, Heart, PassShield, Plan, Swords, Users } from '../icons';
import { PASS_TIERS, passTier } from './pass';
import { passOf } from './progress';
import { availability, programById, programsOf } from './programs';
import { petLevel, petName, petXp } from './pets';
import { villageOf } from './resources';
import { Bolt, MonsterFace } from './match3/art';
import { DUNGEON_LANDS, dungeonOf, FLOOR_COST, FLOOR_COUNT, floorDef } from './match3/dungeon';
import { homeBadges } from './homeBadges';
import { daysUntil, eventBoss, eventBossSay, eventOf, eventWindow, fmtDays, fmtLeft, triesLeft } from './event';
import './home.css';

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
  // Подземелье «три в ряд»: тратит заряд от тренировок.
  onDungeon: () => void;
  // Друзья: экран во вкладке дуэли.
  onFriends: () => void;
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
  const { progress, lives, current, onTrain, onShop, onStrength, onSettings, daily, dailyDone, onDaily, onClaimDaily, onAchievements, pro, onPass, onEvent, onPets, onPrograms, onDungeon, onFriends } = props;
  const now = useNow();
  const [heroOpen, setHeroOpen] = useState(false);
  const badges = homeBadges(progress, daily, pro, now);
  const item = itemById(progress.equipped);
  const lvl = heroLevel(heroXp(progress));
  const series = streak(progress.days, now);
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

  const achGot = ACHIEVEMENTS.filter((a) => achDone(a, progress, now));
  const lastAch = achGot[achGot.length - 1];

  const pet = progress.pets?.active;
  const petLvl = pet ? petLevel(petXp(progress, pet)).level : 0;

  const achTile = (
    <button className="hb-tile" onClick={onAchievements}>
      <span className="hb-tile-icon">
        <AchBadge ach={lastAch ?? ACHIEVEMENTS[0]} done={!!lastAch} size={34} />
      </span>
      <b>Достижения</b>
      <small>
        {achGot.length} из {ACHIEVEMENTS.length}
      </small>
      <Dot n={badges.achievements} />
    </button>
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

      <div className="hb-tiles">
        <button className={`hb-tile hb-dungeon ${unfinished || floors ? 'ready' : ''}`} style={{ ['--la' as string]: land.accent }} onClick={onDungeon}>
          <span className="hb-tile-icon">
            <MonsterFace shape={monster.shape} color={monster.color} boss={floor.boss} size={36} />
          </span>
          <b>Подземелье</b>
          <small>{unfinished ? `этаж ${floor.id} не доигран` : floors ? `этаж ${floor.id} · ×${floors}` : `ещё ${FLOOR_COST - charge} повт.`}</small>
          <Dot n={badges.dungeon} />
        </button>
        <button className="hb-tile" onClick={onPrograms}>
          <span className="hb-tile-icon hb-prog">
            <Plan size={24} />
          </span>
          <b>Программы</b>
          <small>{prog && run ? (av === 'ready' ? `день ${run.day} сегодня` : `день ${run.day} из ${prog.days}`) : 'выбрать план'}</small>
          <Dot n={badges.programs} />
        </button>
        <button className={`hb-tile ${pro ? 'pro' : ''}`} onClick={onPass}>
          <span className="hb-tile-icon">
            <PassShield size={32} gold={pro} label={passT.tier} />
          </span>
          <b>Пропуск</b>
          <small>
            ступень {passT.tier}/{PASS_TIERS}
          </small>
          <Dot n={badges.pass} />
        </button>
        {w.live ? (
          <button className={`hb-tile hb-event ${ev.won ? 'won' : ''}`} style={{ ['--eg' as string]: boss.glow }} onClick={onEvent}>
            <span className="hb-tile-icon">
              <Portrait line={bossFace} size={36} />
            </span>
            <b>Событие</b>
            <small>{ev.won ? 'повержен!' : `ещё ${fmtLeft(w.end - now)}`}</small>
            <Dot n={badges.event} />
          </button>
        ) : (
          achTile
        )}
      </div>

      <div className="hb-more-title">Ещё</div>
      <div className="hb-more">
        <button className="hb-more-item" onClick={onPets}>
          {pet ? <PetFace id={pet} size={28} /> : <span className="pet-entry-egg hb-egg" />}
          <span>
            <b>{pet ? petName(progress, pet) : 'Питомец'}</b>
            <small>{pet ? `ур. ${petLvl}` : 'яйцо ждёт'}</small>
          </span>
          <Dot n={badges.pets} />
        </button>
        <button className="hb-more-item" onClick={() => setHeroOpen(true)}>
          <span className="hb-more-icon">
            <Swords size={18} />
          </span>
          <span>
            <b>Вещи</b>
            <small>и зелья</small>
          </span>
        </button>
        <button className="hb-more-item" onClick={() => onShop()}>
          <span className="hb-more-icon gold">
            <Bag size={18} />
          </span>
          <span>
            <b>Лавка</b>
            <small>Фёдора</small>
          </span>
        </button>
        <button className="hb-more-item" onClick={onStrength}>
          <span className="hb-more-icon mint">
            <Dumbbell size={18} />
          </span>
          <span>
            <b>Сила</b>
            <small>рекорды</small>
          </span>
        </button>
        <button className="hb-more-item" onClick={onFriends}>
          <span className="hb-more-icon blue">
            <Users size={18} />
          </span>
          <span>
            <b>Друзья</b>
            <small>и вызовы</small>
          </span>
        </button>
        {w.live ? (
          <button className="hb-more-item" onClick={onAchievements}>
            <AchBadge ach={lastAch ?? ACHIEVEMENTS[0]} done={!!lastAch} size={28} />
            <span>
              <b>Достижения</b>
              <small>
                {achGot.length} из {ACHIEVEMENTS.length}
              </small>
            </span>
            <Dot n={badges.achievements} />
          </button>
        ) : (
          <button className="hb-more-item hb-event-soon" style={{ ['--eg' as string]: boss.glow }} onClick={onEvent}>
            <Portrait line={bossFace} size={28} />
            <span>
              <b>Событие</b>
              <small>{fmtDays(daysUntil(w, now))}</small>
            </span>
          </button>
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
    <div className="sheet" onClick={onClose}>
      <div className="sheet-body hb-sheet" onClick={(e) => e.stopPropagation()}>
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
        <button className="secondary" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
