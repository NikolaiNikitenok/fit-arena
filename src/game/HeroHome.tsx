import { lazy, ReactNode, Suspense, useEffect, useState } from 'react';
import { amountText, EXERCISE_LABELS, Exercise } from '../repCounter';
import { PetEntry } from './PetEntry';
import { Gear, GEAR, gearById, gearIcon, gearText, ITEMS, itemById, PotionId, POTIONS, RARITY_COLORS, RARITY_NAMES } from './items';
import { BASE_DAMAGE, heroPower } from './power';
import { LevelDef } from './levels';
import type { DailyTask } from './daily';
import { AchBadge } from './Achievements';
import { ProgramsEntry } from './ProgramsEntry';
import { DungeonEntry } from './match3/DungeonEntry';
import { achDone, ACHIEVEMENTS, heroBadge } from './achievements';
import { Portrait } from './Dialog';
import { NPCS, portraitUrl } from './npcs';
import { heroLevel, heroTitle, heroXp, maxLives, Progress, streak } from './progress';
import { Coin, Cog, Flame, Flask, GoldShieldArt, Heart, PassShield, Swords } from '../icons';
import { PASS_TIERS, passReady, passTier } from './pass';
import { passOf } from './progress';
import { daysUntil, eventBoss, eventBossSay, eventHpLeft, eventOf, eventOutfit, eventWindow, fmtDays, fmtLeft, fmtWeekend, triesLeft, EVENT_TRIES_PER_DAY } from './event';

// Главное меню: герой в надетом снаряжении, его уровень, инвентарь и тренировка дня.

const EXERCISES: Exercise[] = ['squat', 'pushup', 'situp'];

// Портреты тех же моделей, что и у героя в этом снаряжении.
const FACE: Record<string, string> = { Knight: 'hero', Rogue: 'lisa', Mage: 'fedor', Barbarian: 'grom' };
const ItemFace = ({ hero, color, glow }: { hero: string; color: string; glow?: string }) => (
  <span className="inv-face" style={{ background: `radial-gradient(circle at 50% 35%, ${color}, #1b1d26 80%)`, boxShadow: glow ? `0 0 12px ${glow}` : undefined }}>
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
  onMap: () => void;
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

export function HeroHome({ progress, lives, current, onTrain, onMap, onShop, onStrength, onEquip, onEquipGear, onPotion, onSettings, daily, dailyDone, onDaily, onClaimDaily, onAchievements, pro, onPass, onEvent, onPets, onPrograms, onDungeon }: Props) {
  const passT = passTier(passOf(progress, Date.now()).xp);
  const passWaiting = passReady(progress, pro, Date.now());
  const badge = heroBadge(progress);
  const achGot = ACHIEVEMENTS.filter((a) => achDone(a, progress, Date.now()));
  const achReady = achGot.filter((a) => !progress.achClaimed?.includes(a.id)).length;
  const item = itemById(progress.equipped);
  const xp = heroXp(progress);
  const lvl = heroLevel(xp);
  const series = streak(progress.days, Date.now());
  const power = heroPower(progress, progress.might);
  const weapon = gearById(progress.weapon);
  const offhand = gearById(progress.offhand);
  const [inv, setInv] = useState<ShopTab>('weapon');
  const ownedGear = GEAR.filter((g) => progress.items.includes(g.id) && g.slot === inv);
  const owned = ITEMS.filter((i) => progress.items.includes(i.id));

  return (
    <div className="home">
      <div className="app-head">
        <button className="pill btn icon-only" onClick={onSettings} aria-label="Настройки">
          <Cog />
        </button>
        <div className="stats">
          {lives}
          <button className="pill btn" onClick={onStrength}>
            <Flame className="flame" /> {series.days}
          </button>
          <span className="pill">
            <Coin className="coin" /> {progress.coins}
          </span>
        </div>
      </div>

      <div className={`hero-card ${pro ? 'pro' : ''}`}>
        <div className="hero-stage">
          {pro && <GoldShieldArt className="gold-art" />}
          <Suspense fallback={null}>
            <HeroStage progress={progress} />
          </Suspense>
        </div>
        <div className="hero-info">
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
        <div className="power-tiles">
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
        <div className="power-hint">
          Урон: база {BASE_DAMAGE} + уровень {power.level} + снаряжение {power.atk}
          {power.pct > 0 && ` и +${(Math.round(power.pct * 1000) / 10).toLocaleString('ru')}%`}
          {power.pet > 0 && ` (питомец +${(Math.round(power.pet * 1000) / 10).toLocaleString('ru')}%)`}
          {power.offhandOff && ' · двуручное оружие: вторая рука не действует'}
        </div>
      </div>

      <div className="slots">
        <button className="slot" onClick={() => setInv('outfit')}>
          <ItemFace hero={item.hero} color={item.color} glow={item.glow} />
          <span className="slot-label">Облик</span>
          <span className="slot-name">{item.name}</span>
        </button>
        <button className="slot" onClick={() => setInv('weapon')}>
          {weapon ? <GearFace g={weapon} /> : <span className="gear-face empty" />}
          <span className="slot-label">Оружие</span>
          <span className="slot-name">{weapon?.name ?? 'пусто'}</span>
        </button>
        <button className={`slot ${power.offhandOff ? 'off' : ''}`} onClick={() => setInv('offhand')}>
          {offhand ? <GearFace g={offhand} /> : <span className="gear-face empty">+</span>}
          <span className="slot-label">Вторая рука</span>
          <span className="slot-name">{offhand?.name ?? 'пусто'}</span>
        </button>
      </div>

      <DungeonEntry progress={progress} onOpen={onDungeon} />

      <EventBanner progress={progress} onOpen={onEvent} />

      <button className={`pass-entry ${pro ? 'pro' : ''}`} onClick={onPass}>
        <span className="pass-entry-shields">
          <PassShield size={30} label={passT.tier} />
          <PassShield size={36} gold dim={!pro} star={!pro} label={pro ? passT.tier : undefined} />
        </span>
        <span className="pass-entry-text">
          <span className={pro ? 'pro-name' : ''}>Пропуск сезона</span>
          <small>
            Ступень {passT.tier} из {PASS_TIERS} · {pro ? 'Pro Pass' : 'задания и награды'}
          </small>
          <span className="pass-bar">
            <span style={{ display: 'block', width: `${(passT.into / passT.need) * 100}%` }} />
          </span>
        </span>
        {passWaiting > 0 && <span className="ach-entry-new">+{passWaiting}</span>}
        <span className="chev">›</span>
      </button>

      <button className="ach-entry" onClick={onAchievements}>
        <span className="ach-entry-badges">
          {achGot.slice(-3).map((a) => (
            <AchBadge key={a.id} ach={a} done size={30} />
          ))}
          {!achGot.length && <AchBadge ach={ACHIEVEMENTS[0]} done={false} size={30} />}
        </span>
        <span className="ach-entry-text">
          Достижения
          <small>
            {achGot.length} из {ACHIEVEMENTS.length}
          </small>
        </span>
        {achReady > 0 && <span className="ach-entry-new">+{achReady}</span>}
        <span className="chev">›</span>
      </button>

      <PetEntry progress={progress} onOpen={onPets} />
      <ProgramsEntry progress={progress} onOpen={onPrograms} />

      <DailyCard task={daily} done={dailyDone} claimed={progress.dailyDone === daily.date} onPlay={onDaily} onClaim={onClaimDaily} />

      <button className="primary daily" onClick={onTrain}>
        {series.today ? 'Продолжить приключение' : 'Тренировка дня'}
        <small>
          Уровень {current.num}: {current.title}
        </small>
      </button>
      <button className="secondary" onClick={onMap}>
        Открыть карту мира
      </button>


      <div className="section-title">
        Инвентарь
        <button className="link" onClick={() => onShop(inv)}>
          Лавка Фёдора ›
        </button>
      </div>
      <div className="tabs">
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

      <div className="section-title">
        Сила
        <button className="link" onClick={onStrength}>
          Подробнее ›
        </button>
      </div>
      <div className="strength-mini">
        {EXERCISES.map((ex) => (
          <div key={ex}>
            <b>{progress.best[ex]?.reps ?? '—'}</b>
            <span>{EXERCISE_LABELS[ex]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Задание дня от жителя: просьба, полоска повторов за сегодня и награда. */
function DailyCard({ task, done, claimed, onPlay, onClaim }: { task: DailyTask; done: number; claimed: boolean; onPlay: () => void; onClaim: () => void }) {
  const npc = NPCS[task.npc];
  const ready = done >= task.target;
  return (
    <div className={`daily-card ${claimed ? 'claimed' : ''}`}>
      <div className="daily-top">
        <Portrait line={{ face: task.npc, color: npc.color, who: npc.name }} size={46} />
        <div className="daily-meta">
          <div className="daily-who">
            Задание дня · <span style={{ color: npc.color }}>{npc.name}</span>
          </div>
          <div className="daily-ask">«{task.ask}»</div>
        </div>
      </div>
      <div className="daily-goal">
        <span>
          {EXERCISE_LABELS[task.exercise]}: <b>{amountText(task.exercise, Math.min(done, task.target))}</b> / {amountText(task.exercise, task.target)}
        </span>
        <span className="daily-gift">
          <Coin size={13} className="coin" /> {task.coins}
          {task.potion && <Flask size={15} color={task.potion === 'vigor' ? '#ff6b81' : task.potion === 'might' ? '#ffb46b' : '#7dd3fc'} scroll={task.potion === 'swap'} />}
        </span>
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${Math.min(100, (done / task.target) * 100)}%`, background: npc.color }} />
      </div>
      {claimed ? (
        <div className="muted daily-note">Выполнено! Завтра будет новая просьба.</div>
      ) : ready ? (
        <button className="primary" onClick={onClaim}>
          Забрать награду
        </button>
      ) : (
        <button className="secondary" onClick={onPlay}>
          {done > 0 ? `Доделать: ещё ${amountText(task.exercise, task.target - done)}` : 'Выполнить'}
        </button>
      )}
    </div>
  );
}

/** Событие выходных: светится, пока идёт (с отсчётом до конца), а в остальные дни — анонс. */
function EventBanner({ progress, onOpen }: { progress: Progress; onOpen: () => void }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const w = eventWindow(now);
  const boss = eventBoss(w.key);
  const state = eventOf(progress, now);
  const outfit = eventOutfit(boss);
  const face = eventBossSay(boss, '');
  const share = state.hpMax ? eventHpLeft(state) / state.hpMax : 1;
  if (!w.live)
    return (
      <button className="event-banner teaser" style={{ ['--eg' as string]: boss.glow }} onClick={onOpen}>
        <Portrait line={face} size={44} />
        <span className="event-banner-text">
          <span className="event-banner-tag">{fmtDays(daysUntil(w, now)).replace(/^./, (c) => c.toUpperCase())}: событие</span>
          <span className="event-banner-name">{boss.name}</span>
          <small>
            {fmtWeekend(w)} · награда: <span style={{ color: RARITY_COLORS[outfit.rarity] }}>{outfit.name}</span>
          </small>
        </span>
        <span className="chev">›</span>
      </button>
    );
  return (
    <button className={`event-banner live ${state.won ? 'won' : ''}`} style={{ ['--eg' as string]: boss.glow }} onClick={onOpen}>
      <Portrait line={face} size={52} />
      <span className="event-banner-text">
        <span className="event-banner-tag">Событие · ещё {fmtLeft(w.end - now)}</span>
        <span className="event-banner-name">{boss.name}</span>
        {state.won ? (
          <small>Повержен! Облик «{outfit.name}» твой</small>
        ) : (
          <>
            <span className="pass-bar event-banner-bar">
              <span style={{ display: 'block', width: `${share * 100}%`, background: boss.glow }} />
            </span>
            <small>
              Попытки сегодня: {triesLeft(progress, now)} из {EVENT_TRIES_PER_DAY} · награда: {outfit.name}
            </small>
          </>
        )}
      </span>
      <span className="chev">›</span>
    </button>
  );
}
