import { ReactNode, Suspense, useRef, useState } from 'react';
import { canvasProps, getSettings } from '../settings';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EXERCISE_LABELS, Exercise } from '../repCounter';
import { Character } from '../three/Character';
import { Gear, GEAR, gearById, gearIcon, gearText, ITEMS, itemById, PotionId, POTIONS, RARITY_COLORS, RARITY_NAMES } from './items';
import { BASE_DAMAGE, heroHands, heroPower } from './power';
import { LevelDef } from './levels';
import { portraitUrl } from './npcs';
import { heroLevel, heroTitle, heroXp, maxLives, Progress, streak } from './progress';
import { Coin, Cog, Flame, Flask, Heart, Swords } from '../icons';

// Главное меню: герой в надетом снаряжении, его уровень, инвентарь и тренировка дня.

const EXERCISES: Exercise[] = ['squat', 'pushup', 'situp'];

// Портреты тех же моделей, что и у героя в этом снаряжении.
const FACE: Record<string, string> = { Knight: 'hero', Rogue: 'lisa', Mage: 'fedor', Barbarian: 'grom' };
const ItemFace = ({ hero, color, glow }: { hero: string; color: string; glow?: string }) => (
  <span className="inv-face" style={{ background: `radial-gradient(circle at 50% 35%, ${color}, #1b1d26 80%)`, boxShadow: glow ? `0 0 12px ${glow}` : undefined }}>
    <img src={portraitUrl(FACE[hero] ?? 'hero')} alt="" draggable={false} />
  </span>
);

function Turntable({ children }: { children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.35;
  });
  return <group ref={g}>{children}</group>;
}

function HeroStage({ progress }: { progress: Progress }) {
  const item = itemById(progress.equipped);
  const [pulse, setPulse] = useState(0);
  return (
    <Canvas {...canvasProps(getSettings())} camera={{ position: [0, 1.4, 5.8], fov: 30 }} onCreated={({ camera }) => camera.lookAt(0, 1.0, 0)}>
      <hemisphereLight args={['#ffffff', '#3a3040', 1.3]} />
      <directionalLight position={[3, 5, 3]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-2.5, 1.5, -1.5]} intensity={8} color={item.glow ?? RARITY_COLORS[item.rarity]} />
      <mesh position={[0, -0.08, 0]} receiveShadow>
        <cylinderGeometry args={[1.05, 1.15, 0.16, 6]} />
        <meshStandardMaterial color="#3a3f52" flatShading />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.92, 1.0, 6]} />
        <meshBasicMaterial color={RARITY_COLORS[item.rarity]} />
      </mesh>
      <Suspense fallback={null}>
        <Turntable>
          <Character model={item.hero} tint={item.tint} glow={item.glow} hands={heroHands(progress)} anim="idle" pulse={pulse} pulseAnim="jump" onClick={() => setPulse((p) => p + 1)} />
        </Turntable>
      </Suspense>
    </Canvas>
  );
}

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

export function HeroHome({ progress, lives, current, onTrain, onMap, onShop, onStrength, onEquip, onEquipGear, onPotion, onSettings }: Props) {
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

      <div className="hero-card">
        <div className="hero-stage">
          <HeroStage progress={progress} />
        </div>
        <div className="hero-info">
          <div className="hero-level">{lvl.level}</div>
          <div className="hero-meta">
            <div className="hero-title">{heroTitle(lvl.level)}</div>
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
          {power.pct > 0 && ` и +${Math.round(power.pct * 100)}%`}
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
