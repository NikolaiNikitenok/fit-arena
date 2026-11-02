import { Suspense } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GEAR } from '../three/Character';
import { parseTint } from '../three/Instanced';
import { ANIMS_URL, charUrl, useGltf } from '../three/kit';
import { buildRegalia, skinTexture } from '../three/skin';
import { openVisor, staticFace } from '../three/face';
import { TroopId } from '../../shared/villageBattle';
import { Lock } from '../icons';
import { ResRow } from './BattleScreen';
import { ModelThumb } from './Preview';
import { troopInfo } from './troopInfo';
import { bombGroup, type HeroLook, levelLook, paintTroop, TROOP_RIGS } from './troops3d';
import { Sheet } from '../Sheet';
import { t } from '../i18n';

// Карточка отряда в казармах: живая мини-модель, роль, все цифры из боя (troopInfo.ts) и кнопка обучения.

// Что показывает мини-модель: каждый отряд — в своём главном движении.
const SHOWCASE: Record<TroopId, string> = {
  warrior: '1H_Melee_Attack_Chop',
  archer: '1H_Ranged_Shoot',
  giant: '2H_Melee_Attack_Chop',
  wallbreaker: 'Running_A',
  healer: 'Spellcasting',
};

// Портрет на карточке в бою: какой момент движения (с).
const POSE_T: Record<TroopId, number> = { warrior: 0.45, archer: 0.35, giant: 0.55, wallbreaker: 0.25, healer: 0.6 };

function Live({ id, size, level, still }: { id: TroopId; size: number; level?: number; still?: boolean }) {
  const rig = TROOP_RIGS[id];
  const char = useGltf(charUrl(rig.model));
  const anims = useGltf(ANIMS_URL);
  const make = () => {
    const root = cloneSkinned(char.scene) as THREE.Group;
    if (rig.bomb) root.getObjectByName('handslotr')?.add(bombGroup());
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!(m as THREE.SkinnedMesh).isSkinnedMesh && !m.name.startsWith('bomb') && !rig.gear.includes(m.name)) m.visible = false;
      if (m.name.startsWith('bomb')) return;
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      paintTroop(mat, rig, level);
      m.material = mat;
    });
    const mixer = new THREE.AnimationMixer(root);
    const clip = anims.animations.find((a) => a.name === SHOWCASE[id]) ?? anims.animations.find((a) => a.name === 'Idle');
    if (clip) mixer.clipAction(clip).play();
    const g = new THREE.Group();
    g.add(root);
    // Рамка по росту персонажа (KayKit ~2,5 единицы), с запасом на шапку и полёт.
    g.userData.frame = { h: rig.fly ? 2.7 : 2.5, half: 1.55 };
    g.userData.poseT = POSE_T[id];
    g.userData.tick = (tm: number) => {
      mixer.setTime(tm);
      // Целитель парит.
      if (rig.fly) root.position.y = 0.1 + 0.08 * Math.sin(tm * 3);
    };
    return g;
  };
  return <ModelThumb id={`troop:${id}:${levelLook(level).tint ?? ''}${levelLook(level).glow ?? ''}`} make={make} size={size} label={t('Модель: {0}', { 0: troopInfo(id, 1).name })} still={still} />;
}

/** Живая мини-модель отряда; still — неподвижный портрет (карточки в бою). */
export function TroopThumb({ id, size = 48, level, still }: { id: TroopId; size?: number; level?: number; still?: boolean }) {
  return (
    <Suspense fallback={<span className={`vil-unit-big u-${id}`} style={{ width: size, height: size }} />}>
      <Live id={id} size={size} level={level} still={still} />
    </Suspense>
  );
}

function HeroLive({ look, size }: { look: HeroLook; size: number }) {
  const char = useGltf(charUrl(look.model));
  const anims = useGltf(ANIMS_URL);
  const make = () => {
    const root = cloneSkinned(char.scene) as THREE.Group;
    const gear = GEAR[look.model];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (gear && !(m as THREE.SkinnedMesh).isSkinnedMesh && !gear.includes(m.name)) m.visible = false;
      if (m.name === 'Knight_Helmet') {
        root.updateMatrixWorld(true);
        openVisor(m);
      }
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      // Облик с костюмом: своя палитра брони и ткани вместо оттенка всей модели.
      if (look.skin && mat.map) mat.map = skinTexture(look.model, mat.map, look.skin);
      else if (look.tint) mat.color.multiply(parseTint(look.tint));
      if (look.glow && mat.emissive) {
        mat.emissive.set(look.glow);
        mat.emissiveIntensity = 0.18;
      }
      m.material = mat;
    });
    if (look.skin) buildRegalia(root, look.model, look.skin, true);
    staticFace(root, look.model);
    const mixer = new THREE.AnimationMixer(root);
    const clip = anims.animations.find((a) => a.name === 'Idle_Combat') ?? anims.animations.find((a) => a.name === 'Idle');
    if (clip) mixer.clipAction(clip).play();
    const g = new THREE.Group();
    g.add(root);
    g.userData.frame = { h: 2.5, half: 1.55 };
    g.userData.poseT = 0.3;
    g.userData.tick = (tm: number) => mixer.setTime(tm);
    return g;
  };
  return <ModelThumb id={`hero:${look.model}:${look.skin?.key ?? look.tint ?? ''}:${look.glow ?? ''}`} make={make} size={size} label={t('Модель: герой')} still />;
}

/** Портрет героя в его облике (без оружия из рук — только набор модели). */
export function HeroThumb({ look, size = 48 }: { look: HeroLook; size?: number }) {
  return (
    <Suspense fallback={<span className="vil-unit-big u-hero" style={{ width: size, height: size }} />}>
      <HeroLive look={look} size={size} />
    </Suspense>
  );
}

interface Props {
  id: TroopId;
  barracks: number;
  // Уровень отряда из лаборатории.
  level?: number;
  have: number;
  queued: number;
  onTrain: () => void;
  onClose: () => void;
}

export function TroopSheet({ id, barracks, level = 1, have, queued, onTrain, onClose }: Props) {
  const info = troopInfo(id, Math.max(1, barracks), level);
  const locked = barracks < info.unlock;
  return (
    <Sheet onClose={onClose} className="vil-troop-sheet">
      <div className="vil-ti-head">
        <div className={`vil-ti-pic u-${id}`}>
          <TroopThumb id={id} size={112} level={level} />
        </div>
        <div className="vil-ti-title">
          <b>
            {info.name} <span className="level-tag">{t('ур. {0}', { 0: info.level })}</span>
          </b>
          <span className="muted">
            {t('в лагере ×{0}', { 0: have })}
            {queued ? t(' · учатся {0}', { 0: queued }) : ''}
          </span>
          <div className="vil-ti-tags">
            {info.tags.map((tm) => (
              <span key={tm} className={tm === t('Летающий') ? 'air' : tm === t('Наземный') ? 'ground' : ''}>
                {tm}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="vil-ti-role">{info.role}</p>
      <div className="vil-ti-grid">
        {info.stats.map((s) => (
          <div key={s.label} className={s.label === t('Цель') ? 'wide' : ''}>
            <small>{s.label}</small>
            <b>{s.value}</b>
            {s.note && <em>{s.note}</em>}
          </div>
        ))}
      </div>
      <div className="vil-ti-hit">
        <small>{t('По нему бьют')}</small>
        <div>
          {info.hitBy.map((n) => (
            <span key={n} className="bad">
              {n}
            </span>
          ))}
          {info.safeFrom.map((n) => (
            <span key={n} className="ok">
              {t('{0} не достаёт', { 0: n })}
            </span>
          ))}
        </div>
      </div>
      <div className="vil-ti-bonus">
        {info.bonus > 0 ? (
          <>
            {t('Казармы {0} ур.:', { 0: barracks })} <b>+{info.bonus}%</b> {t('{0} (уже в цифрах). Каждый следующий уровень — ещё +{1}%.', { 0: info.bonusWhat, 1: info.perLevel })}
          </>
        ) : (
          <>{t('Каждый уровень казарм выше первого: +{0}% {1}.', { 0: info.perLevel, 1: info.bonusWhat })}</>
        )}{' '}
        {info.levelBonus > 0 ? (
          <>
            {t('Лаборатория, {0} ур. отряда:', { 0: info.level })} <b>+{info.levelBonus}%</b> {t('(тоже в цифрах).')}
          </>
        ) : (
          <>{t('В лаборатории каждый уровень отряда даёт ещё +{0}%.', { 0: info.perTroopLevel })}</>
        )}
      </div>
      <div className="vil-actions">
        <span className="vil-ti-cost">
          <ResRow res={info.cost} />
        </span>
        {locked ? (
          <button className="secondary" disabled>
            <Lock /> {t('Казармы {0} уровня', { 0: info.unlock })}
          </button>
        ) : (
          <button className="primary" onClick={onTrain}>
            {t('Обучить')}
          </button>
        )}
      </div>
    </Sheet>
  );
}
