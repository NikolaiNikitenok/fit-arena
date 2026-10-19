import { ReactNode, Suspense, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EXERCISE_LABELS, Exercise } from '../repCounter';
import { Character } from '../three/Character';
import { ITEMS, itemById, RARITY_COLORS, RARITY_NAMES } from './items';
import { LevelDef } from './levels';
import { portraitUrl } from './npcs';
import { heroLevel, heroTitle, heroXp, maxLives, Progress, streak } from './progress';
import { Coin, Flame, Heart } from '../icons';

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
    <Canvas shadows dpr={[1, 1.6]} camera={{ position: [0, 1.4, 5.8], fov: 30 }} onCreated={({ camera }) => camera.lookAt(0, 1.0, 0)}>
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
          <Character model={item.hero} tint={item.tint} glow={item.glow} anim="idle" pulse={pulse} pulseAnim="jump" onClick={() => setPulse((p) => p + 1)} />
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
  onShop: () => void;
  onStrength: () => void;
  onEquip: (id: string) => void;
}

export function HeroHome({ progress, lives, current, onTrain, onMap, onShop, onStrength, onEquip }: Props) {
  const item = itemById(progress.equipped);
  const xp = heroXp(progress);
  const lvl = heroLevel(xp);
  const series = streak(progress.days, Date.now());
  const extraLives = maxLives(progress) - 5;
  const owned = ITEMS.filter((i) => progress.items.includes(i.id));
  const forSale = ITEMS.filter((i) => i.inShop && !progress.items.includes(i.id)).slice(0, 4);

  return (
    <div className="home">
      <div className="app-head">
        <h1>Атлетия</h1>
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
        <div className="hero-perks">
          <span>
            <Heart size={13} className="heart" /> жизней: {5 + extraLives}
          </span>
          <span>{lvl.level < 30 ? `+1 жизнь на ${(Math.floor(lvl.level / 10) + 1) * 10} уровне` : 'максимум жизней'}</span>
          {item.coinBonus > 0 && <span>+{Math.round(item.coinBonus * 100)}% монет</span>}
        </div>
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
        Снаряжение
        <button className="link" onClick={onShop}>
          Лавка Фёдора ›
        </button>
      </div>
      <div className="inventory">
        {owned.map((i) => (
          <button key={i.id} className={`inv-item ${progress.equipped === i.id ? 'on' : ''}`} style={{ borderColor: progress.equipped === i.id ? RARITY_COLORS[i.rarity] : undefined }} onClick={() => onEquip(i.id)}>
            <ItemFace hero={i.hero} color={i.color} glow={i.glow} />
            <span className="inv-name">{i.name}</span>
            <span className="inv-meta" style={{ color: RARITY_COLORS[i.rarity] }}>
              {progress.equipped === i.id ? 'надето' : RARITY_NAMES[i.rarity]}
            </span>
          </button>
        ))}
        {forSale.map((i) => (
          <button key={i.id} className="inv-item locked" onClick={onShop}>
            <ItemFace hero={i.hero} color={i.color} />
            <span className="inv-name">{i.name}</span>
            <span className="inv-meta">
              <Coin size={12} className="coin" /> {i.price}
            </span>
          </button>
        ))}
      </div>

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
