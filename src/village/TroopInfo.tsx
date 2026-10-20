import { Suspense } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { parseTint } from '../three/Instanced';
import { ANIMS_URL, charUrl, useGltf } from '../three/kit';
import { TroopId } from '../../shared/villageBattle';
import { Lock } from '../icons';
import { ResRow } from './BattleScreen';
import { ModelThumb } from './Preview';
import { troopInfo } from './troopInfo';
import { bombGroup, TROOP_RIGS } from './troops3d';

// Карточка отряда в казармах: живая мини-модель, роль, все цифры из боя (troopInfo.ts) и кнопка обучения.

// Что показывает мини-модель: каждый отряд — в своём главном движении.
const SHOWCASE: Record<TroopId, string> = {
  warrior: '1H_Melee_Attack_Chop',
  archer: '1H_Ranged_Shoot',
  giant: '2H_Melee_Attack_Chop',
  wallbreaker: 'Running_A',
  healer: 'Spellcasting',
};

function Live({ id, size }: { id: TroopId; size: number }) {
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
      mat.color.multiply(parseTint(rig.tint));
      if (rig.glow) {
        mat.emissive.set(rig.glow);
        mat.emissiveIntensity = 0.22;
      }
      m.material = mat;
    });
    const mixer = new THREE.AnimationMixer(root);
    const clip = anims.animations.find((a) => a.name === SHOWCASE[id]) ?? anims.animations.find((a) => a.name === 'Idle');
    if (clip) mixer.clipAction(clip).play();
    const g = new THREE.Group();
    g.add(root);
    // Рамка по росту персонажа (KayKit ~2,5 единицы), с запасом на шапку и полёт.
    g.userData.frame = { h: rig.fly ? 2.7 : 2.5, half: 1.55 };
    g.userData.tick = (t: number) => {
      mixer.setTime(t);
      // Целитель парит.
      if (rig.fly) root.position.y = 0.1 + 0.08 * Math.sin(t * 3);
    };
    return g;
  };
  return <ModelThumb id={`troop:${id}`} make={make} size={size} label={`Модель: ${troopInfo(id, 1).name}`} />;
}

/** Живая мини-модель отряда. */
export function TroopThumb({ id, size = 48 }: { id: TroopId; size?: number }) {
  return (
    <Suspense fallback={<span className={`vil-unit-big u-${id}`} style={{ width: size, height: size }} />}>
      <Live id={id} size={size} />
    </Suspense>
  );
}

interface Props {
  id: TroopId;
  barracks: number;
  have: number;
  queued: number;
  onTrain: () => void;
  onClose: () => void;
}

export function TroopSheet({ id, barracks, have, queued, onTrain, onClose }: Props) {
  const info = troopInfo(id, Math.max(1, barracks));
  const locked = barracks < info.unlock;
  return (
    <div className="sheet vil-troop-sheet" onClick={onClose}>
      <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
        <div className="vil-ti-head">
          <div className={`vil-ti-pic u-${id}`}>
            <TroopThumb id={id} size={112} />
          </div>
          <div className="vil-ti-title">
            <b>{info.name}</b>
            <span className="muted">
              в лагере ×{have}
              {queued ? ` · учатся ${queued}` : ''}
            </span>
            <div className="vil-ti-tags">
              {info.tags.map((t) => (
                <span key={t} className={t === 'Летающий' ? 'air' : t === 'Наземный' ? 'ground' : ''}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
        <p className="vil-ti-role">{info.role}</p>
        <div className="vil-ti-grid">
          {info.stats.map((s) => (
            <div key={s.label} className={s.label === 'Цель' ? 'wide' : ''}>
              <small>{s.label}</small>
              <b>{s.value}</b>
              {s.note && <em>{s.note}</em>}
            </div>
          ))}
        </div>
        <div className="vil-ti-hit">
          <small>По нему бьют</small>
          <div>
            {info.hitBy.map((n) => (
              <span key={n} className="bad">
                {n}
              </span>
            ))}
            {info.safeFrom.map((n) => (
              <span key={n} className="ok">
                {n} не достаёт
              </span>
            ))}
          </div>
        </div>
        <div className="vil-ti-bonus">
          {info.bonus > 0 ? (
            <>
              Казармы {barracks} ур.: <b>+{info.bonus}%</b> {info.bonusWhat} (уже в цифрах). Каждый следующий уровень — ещё +{info.perLevel}%.
            </>
          ) : (
            <>Каждый уровень казарм выше первого: +{info.perLevel}% {info.bonusWhat}.</>
          )}
        </div>
        <div className="vil-actions">
          <span className="vil-ti-cost">
            <ResRow res={info.cost} />
          </span>
          {locked ? (
            <button className="secondary" disabled>
              <Lock /> Казармы {info.unlock} уровня
            </button>
          ) : (
            <button className="primary" onClick={onTrain}>
              Обучить
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
