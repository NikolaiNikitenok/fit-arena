import { Suspense, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Canvas3D } from '../three/Canvas3D';
import { Character, type HandGear } from '../three/Character';
import { Sheet } from '../Sheet';
import { Coin } from '../icons';
import { t } from '../i18n';
import { type Item, RARITY_COLORS, RARITY_NAMES } from './items';
import { heroLook, outfitSkin } from './outfitSkin';

// Примерка облика в лавке: герой в этом облике крутится на подставке, тап — радуется.
// Видно, за что платишь: металл, наплечники, корона, крылья.

function Turntable({ children }: { children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.5;
  });
  return <group ref={g}>{children}</group>;
}

// Что есть у облика этой редкости (src/three/skin.ts).
const PERKS: string[][] = [
  [t('Свои цвета одежды')],
  [t('Полированный металл'), t('Наплечники с кантом'), t('Наручи и пряжка с камнем')],
  [t('Наплечники в два слоя'), t('Медальон на груди'), t('Убор на голове')],
  [t('Корона'), t('Крылья за спиной'), t('Искры на камнях')],
];

export function perksOf(item: Item): string[] {
  const tier = outfitSkin(item)?.tier ?? 0;
  // У эпического и легендарного главное — новое на этом уровне, плюс пара деталей уровнем ниже.
  return tier >= 2 ? [...PERKS[tier], ...PERKS[tier - 1].slice(0, 2)] : PERKS[tier];
}

export function OutfitPreview({
  item,
  hands,
  owned,
  equipped,
  coins,
  onBuy,
  onEquip,
  onClose,
}: {
  item: Item;
  hands?: { weapon?: HandGear; offhand?: HandGear };
  owned: boolean;
  equipped: boolean;
  coins: number;
  onBuy: () => void;
  onEquip: () => void;
  onClose: () => void;
}) {
  const [pulse, setPulse] = useState(0);
  const color = RARITY_COLORS[item.rarity];
  return (
    <Sheet onClose={onClose} className="outfit-preview">
      <div className="op-stage" style={{ background: `radial-gradient(circle at 50% 62%, ${color}38, transparent 68%)` }} onClick={() => setPulse((p) => p + 1)}>
        <Canvas3D sharp camera={{ position: [0, 1.5, 6.2], fov: 30 }} onCreated={({ camera }) => camera.lookAt(0, 1.05, 0)}>
          <hemisphereLight args={['#ffffff', '#3a3040', 1.3]} />
          <directionalLight position={[3, 5, 3]} intensity={2.2} />
          <pointLight position={[-2.5, 1.5, -1.5]} intensity={4} color={item.glow ?? color} />
          <mesh position={[0, -0.08, 0]}>
            <cylinderGeometry args={[1.0, 1.1, 0.16, 6]} />
            <meshStandardMaterial color="#2c3146" flatShading />
          </mesh>
          <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.88, 0.96, 6]} />
            <meshBasicMaterial color={color} />
          </mesh>
          <Suspense fallback={null}>
            <Turntable>
              <Character {...heroLook(item)} aura={item.glow} hands={hands} anim="idle" pulse={pulse} pulseAnim="jump" />
            </Turntable>
          </Suspense>
        </Canvas3D>
      </div>
      <div className="op-info">
        <div className="op-name">{item.name}</div>
        <div className="op-meta" style={{ color }}>
          {RARITY_NAMES[item.rarity]}
          {item.coinBonus > 0 && t(' · +{0}% монет', { 0: Math.round(item.coinBonus * 100) })}
        </div>
        <div className="op-perks">
          {perksOf(item).map((p) => (
            <span key={p} className="op-perk" style={{ borderColor: `${color}66` }}>
              {p}
            </span>
          ))}
        </div>
        {owned ? (
          <button className="primary op-btn" disabled={equipped} onClick={onEquip}>
            {equipped ? t('Надето') : t('Надеть')}
          </button>
        ) : item.inShop ? (
          <button className="primary op-btn" disabled={coins < item.price} onClick={onBuy}>
            {t('Купить за')} <Coin size={16} /> {item.price}
          </button>
        ) : null}
        {!owned && item.inShop && coins < item.price && <div className="muted op-hint">{t('Не хватает {0} монет', { 0: item.price - coins })}</div>}
      </div>
    </Sheet>
  );
}
