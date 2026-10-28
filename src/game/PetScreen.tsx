import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { BAD_NAME, badName } from '../../shared/profanity';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Coin } from '../icons';
import { Pet } from '../three/Pet';
import { Dialog, Remark } from './Dialog';
import { say } from './story';
import { sfx } from '../audio';
import { useBusy } from '../updates/busy';
import {
  bonusText,
  buyPet,
  choosePet,
  markPetsSeen,
  newPets,
  PetDef,
  PetId,
  petBonusAt,
  petById,
  petLevel,
  petMood,
  petName,
  petOpen,
  PETS,
  petStage,
  petXp,
  renamePet,
  SAD_AFTER_DAYS,
  STAGE_NAMES,
  TREAT_XP,
  unlockText,
} from './pets';
import { heroLevel, heroXp, Progress, saveProgress as save } from './progress';
import './pets.css';
import { PetEntry, PetFace } from './PetEntry';
import { Canvas3D } from '../three/Canvas3D';
import { Sheet } from '../Sheet';

// Кнопка и мордочка — в лёгком модуле главного экрана; отсюда тоже доступны.
export { PetEntry, PetFace };

// Экран питомцев, кнопка на главном экране и вылупление дракончика из яйца Мастера Грома.

const heroLvl = (p: Progress) => heroLevel(heroXp(p)).level;

const MOOD_TEXT = (p: Progress, now: number, name: string): { cls: string; title: string; text: string } => {
  const mood = petMood(p, now);
  if (mood === 'happy')
    return { cls: 'happy', title: 'Сыт и доволен', text: `Сегодня ${name} получил лакомство за тренировку (+${TREAT_XP} опыта). Бонус действует.` };
  if (mood === 'sad')
    return { cls: 'sad', title: 'Скучает', text: `${SAD_AFTER_DAYS - 1} дня без тренировок, и бонус пока не действует. Одна тренировка — и ${name} снова рядом в бою.` };
  return { cls: 'hungry', title: 'Ждёт лакомства', text: `Первая тренировка дня — это лакомство: +${TREAT_XP} опыта. День отдыха ${name} понимает.` };
};

/** Питомец на подставке: тап — прыжок. */
function PetStage({ id, stage, sad, hop, onTap }: { id: PetId; stage: 0 | 1 | 2; sad: boolean; hop: number; onTap: () => void }) {
  return (
    <Canvas3D camera={{ position: [0, 0.75, 2.1], fov: 32 }} onCreated={({ camera }) => camera.lookAt(0, 0.32, 0)}>
      <hemisphereLight args={['#ffffff', '#3a3040', 1.4]} />
      <directionalLight position={[2, 4, 3]} intensity={2.2} />
      <pointLight position={[-1.5, 1, -1]} intensity={5} color={petById(id)!.color} />
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[0.55, 0.6, 0.1, 6]} />
        <meshStandardMaterial color="#3a3f52" flatShading />
      </mesh>
      <Suspense fallback={null}>
        <Pet id={id} stage={stage} sad={sad} hop={hop} lively rotation={0.25} scale={1.25} onClick={onTap} />
      </Suspense>
    </Canvas3D>
  );
}

/** Экран питомцев: кто рядом, кличка, уровень, бонус, лакомство дня и все питомцы с условиями. */
export function PetScreen({ progress, setProgress, onClose }: { progress: Progress; setProgress: (p: Progress) => void; onClose: () => void }) {
  const now = Date.now();
  const lvl = heroLvl(progress);
  const id = progress.pets?.active;
  const def = petById(id);
  const [hop, setHop] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  // Метка «новый» видна, пока экран открыт; при закрытии питомцы считаются увиденными.
  const [fresh] = useState(() => newPets(progress, lvl));
  const latest = useRef(progress);
  latest.current = progress;
  useEffect(
    () => () => {
      if (fresh.length) setProgress(markPetsSeenSaved(latest.current, fresh));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const pick = (d: PetDef) => {
    const next = choosePet(progress, d.id, lvl);
    if (!next) return;
    setProgress(save(next));
    setHop((h) => h + 1);
    sfx('coin');
  };
  const buy = (d: PetDef) => {
    const next = buyPet(progress, d.id);
    if (!next) return setMsg('Не хватает монет.');
    setProgress(save(next));
    setMsg(`${d.kind} теперь твой!`);
    sfx('chest');
  };

  return (
    <Sheet onClose={onClose} bodyClassName="pet-sheet">
      <div className="level-title">Питомцы</div>
      {def && id ? (
        <ActivePet progress={progress} def={def} hop={hop} onHop={() => setHop((h) => h + 1)} editing={editing} draft={draft} setDraft={setDraft}
          onEdit={() => {
            setDraft(petName(progress, def.id));
            setEditing(true);
          }}
          onSave={() => {
            // Кличку видит только сам игрок, но с матом всё равно не принимаем.
            if (badName(draft)) return setMsg(BAD_NAME);
            setProgress(save(renamePet(progress, def.id, draft)));
            setEditing(false);
          }}
          now={now}
        />
      ) : (
        <div className="pet-empty">
          <span className="pet-entry-egg big" />
          <div className="muted">Мастер Гром нашёл яйцо и отдаст его после твоей первой победы. Пройди первый уровень на карте.</div>
        </div>
      )}
      {msg && <div className="pet-msg">{msg}</div>}
      <div className="section-title">Все питомцы</div>
      <div className="pet-list">
        {PETS.map((d) => {
          const open = petOpen(progress, d, lvl);
          const on = d.id === id;
          const pl = petLevel(petXp(progress, d.id)).level;
          return (
            <div key={d.id} className={`pet-row ${on ? 'on' : ''} ${open ? '' : 'locked'}`} style={{ ['--pc' as string]: d.color }}>
              <PetFace id={d.id} size={46} dim={!open} />
              <div className="pet-row-meta">
                <div className="pet-row-name">
                  {open ? petName(progress, d.id) : d.kind}
                  {fresh.includes(d.id) && !on && <span className="pet-new">новый</span>}
                </div>
                {open && (
                  <div className="pet-row-kind">
                    {d.kind} · ур. {pl}, {STAGE_NAMES[petStage(pl)]}
                  </div>
                )}
                <div className="pet-row-bonus">{open ? bonusText(petBonusAt(d, pl)) : `до ${bonusText(petBonusAt(d, 20))}`}</div>
                <div className="muted">{open ? d.text : unlockText(progress, d, lvl)}</div>
              </div>
              {on ? (
                <span className="pet-on">рядом</span>
              ) : open ? (
                <button className="small-btn" onClick={() => pick(d)}>
                  Взять
                </button>
              ) : d.unlock.kind === 'shop' ? (
                <button className="small-btn" disabled={progress.coins < d.unlock.price} onClick={() => buy(d)}>
                  <Coin size={13} /> {d.unlock.price}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="muted pet-help">
        Опыт получает тот, кто рядом: 1 повтор = 1 опыт в любом режиме. Облик меняется на 7-м и 14-м уровне, бонус растёт до 20-го.
      </div>
    </Sheet>
  );
}

// Экран питомцев сохраняет сам: прогресс меняется вне миссий.
const markPetsSeenSaved = (p: Progress, ids: PetId[]) => save(markPetsSeen(p, ids));

function ActivePet({ progress, def, hop, onHop, editing, draft, setDraft, onEdit, onSave, now }: {
  progress: Progress; def: PetDef; hop: number; onHop: () => void; editing: boolean; draft: string; setDraft: (s: string) => void; onEdit: () => void; onSave: () => void; now: number;
}) {
  const L = petLevel(petXp(progress, def.id));
  const stage = petStage(L.level);
  const name = petName(progress, def.id);
  const mood = MOOD_TEXT(progress, now, name);
  const sad = petMood(progress, now) === 'sad';
  const bonus = petBonusAt(def, L.level);
  return (
    <div className="pet-card" style={{ ['--pc' as string]: def.color }}>
      <div className="pet-stage">
        <PetStage id={def.id} stage={stage} sad={sad} hop={hop} onTap={onHop} />
        <span className="pet-stage-tag">{STAGE_NAMES[stage]}</span>
      </div>
      <div className="pet-name-row">
        {editing ? (
          <>
            <input className="pet-name-input" value={draft} maxLength={14} autoFocus onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSave()} />
            <button className="small-btn" onClick={onSave}>
              Готово
            </button>
          </>
        ) : (
          <>
            <div className="pet-name">{name}</div>
            <button className="pet-rename" onClick={onEdit} aria-label="Переименовать">
              <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden>
                <path d="M4 20h4l10-10-4-4L4 16zM15 5l4 4 1.5-1.5a1.4 1.4 0 0 0 0-2l-2-2a1.4 1.4 0 0 0-2 0z" fill="currentColor" />
              </svg>
            </button>
          </>
        )}
      </div>
      <div className="muted pet-kind">
        {def.kind} · уровень {L.level}
        {L.level >= 20 ? ' · максимальный' : ''}
      </div>
      <div className="pet-xp">
        <div className="bar big">
          <div className="bar-fill" style={{ width: `${(L.into / L.need) * 100}%`, background: def.color }} />
        </div>
        <span>{L.level >= 20 ? 'Вырос!' : `${L.into} / ${L.need} опыта`}</span>
      </div>
      <div className="pet-stages">
        {STAGE_NAMES.map((s, i) => (
          <span key={s} className={i <= stage ? 'on' : ''}>
            {s} <small>ур. {[1, 7, 14][i]}</small>
          </span>
        ))}
      </div>
      <div className={`pet-bonus ${sad ? 'off' : ''}`}>
        <b>Бонус:</b> {bonusText(bonus)}
        {L.level < 20 && <small> · на 20-м: {bonusText(petBonusAt(def, 20))}</small>}
      </div>
      <div className={`pet-mood ${mood.cls}`}>
        <b>{mood.title}</b>
        <span>{mood.text}</span>
      </div>
    </div>
  );
}

// ——— Вылупление ———

const EGG_TAPS = 3;

/** Яйцо в 3D: качается от каждого стука, трескается и раскрывается, а внутри — дракончик. */
function EggScene({ taps, hatched }: { taps: number; hatched: boolean }) {
  const egg = useRef<THREE.Group>(null);
  const top = useRef<THREE.Group>(null);
  const bottom = useRef<THREE.Group>(null);
  const pet = useRef<THREE.Group>(null);
  const sparks = useRef<THREE.Group>(null);
  const tapAt = useRef(-10);
  const hatchAt = useRef<number | null>(null);
  const [hop, setHop] = useState(0);
  const lastTaps = useRef(taps);
  const dirs = useMemo(() => Array.from({ length: 18 }, (_, i) => new THREE.Vector3(Math.cos(i * 2.4) * (0.35 + (i % 3) * 0.15), 0.9 + (i % 4) * 0.25, Math.sin(i * 2.4) * (0.35 + (i % 3) * 0.15))), []);
  // Трещина зигзагом по поясу яйца: с каждым стуком длиннее.
  const cracks = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0);
    const at = (i: number) => {
      const a = (i / 14) * Math.PI * 2 - Math.PI * 0.75;
      return new THREE.Vector3(Math.sin(a) * 0.274, i % 2 ? 0.37 : 0.3, Math.cos(a) * 0.274);
    };
    return Array.from({ length: 14 }, (_, i) => {
      const from = at(i);
      const v = at(i + 1).sub(from);
      return { p: from.clone().addScaledVector(v, 0.5), q: new THREE.Quaternion().setFromUnitVectors(up, v.clone().normalize()), len: v.length() + 0.01 };
    });
  }, []);
  // Пятнышки лежат на поверхности скорлупы.
  const onShell = (theta: number, phi: number): [number, number, number] => [Math.sin(theta) * Math.cos(phi) * 0.262, 0.32 + Math.cos(theta) * 0.27 * 1.26, Math.sin(theta) * Math.sin(phi) * 0.262];

  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    if (taps !== lastTaps.current) {
      lastTaps.current = taps;
      tapAt.current = now;
    }
    if (hatched && hatchAt.current == null) {
      hatchAt.current = now;
      setTimeout(() => setHop((h) => h + 1), 450);
      setTimeout(() => setHop((h) => h + 1), 1200);
    }
    const since = now - tapAt.current;
    const amp = Math.max(0, 1 - since / 0.8) * (0.25 + taps * 0.08) + 0.03 * (1 + taps);
    if (egg.current && hatchAt.current == null) {
      egg.current.rotation.z = Math.sin(now * (14 + taps * 4)) * amp;
      egg.current.position.y = since < 0.3 ? Math.sin((since / 0.3) * Math.PI) * 0.06 : 0;
    }
    const h = hatchAt.current == null ? -1 : now - hatchAt.current;
    if (h >= 0) {
      if (egg.current) egg.current.rotation.z *= 0.85;
      if (top.current) {
        top.current.position.set(-h * 0.5, 0.05 + h * 1.6 - h * h * 1.5, h * 0.3);
        top.current.rotation.z = h * 4;
        top.current.visible = h < 1.4;
      }
      if (bottom.current) bottom.current.scale.setScalar(Math.max(0.001, 1 - Math.max(0, h - 0.6) * 1.2));
      if (pet.current) pet.current.scale.setScalar(Math.min(1, Math.max(0.001, (h - 0.15) * 3)));
      if (sparks.current) {
        sparks.current.visible = h < 1.6;
        sparks.current.children.forEach((s, i) => {
          const d = dirs[i];
          s.position.set(d.x * h, 0.45 + d.y * h - 1.2 * h * h, d.z * h);
          s.scale.setScalar(Math.max(0.001, 1 - h / 1.6));
        });
      }
    }
  });

  const spot = (p: [number, number, number], r: number, c: string) => (
    <mesh position={p}>
      <sphereGeometry args={[r, 12, 10]} />
      <meshStandardMaterial color={c} roughness={0.5} />
    </mesh>
  );
  return (
    <>
      <hemisphereLight args={['#ffffff', '#3a3040', 1.4]} />
      <directionalLight position={[2, 4, 3]} intensity={2.2} />
      <pointLight position={[0, 0.6, 0.8]} intensity={hatched ? 8 : 3} color="#ffd36b" />
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[0.65, 0.72, 0.1, 6]} />
        <meshStandardMaterial color="#3a3f52" flatShading />
      </mesh>
      {/* Гнездо из соломы. */}
      <mesh position={[0, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.32, 0.08, 8, 20]} />
        <meshStandardMaterial color="#c99a55" roughness={0.9} />
      </mesh>
      <group ref={egg}>
        <group ref={bottom} position={[0, 0.05, 0]}>
          <mesh scale={[1, 1.3, 1]} position={[0, 0.32, 0]}>
            <sphereGeometry args={[0.27, 24, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
            <meshStandardMaterial color="#fff6e6" roughness={0.45} side={THREE.DoubleSide} />
          </mesh>
          {spot(onShell(2.1, 0.6), 0.045, '#5fd39a')}
          {spot(onShell(2.3, 2.6), 0.035, '#ffd36b')}
          {spot(onShell(2.5, 1.4), 0.03, '#5fd39a')}
          {cracks.slice(0, Math.min(14, taps * 5)).map((c, i) => (
            <mesh key={i} position={c.p} quaternion={c.q}>
              <boxGeometry args={[0.014, c.len, 0.014]} />
              <meshBasicMaterial color="#5a3a24" />
            </mesh>
          ))}
        </group>
        <group ref={top} position={[0, 0.05, 0]}>
          <mesh scale={[1, 1.3, 1]} position={[0, 0.32, 0]}>
            <sphereGeometry args={[0.27, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#fff6e6" roughness={0.45} side={THREE.DoubleSide} />
          </mesh>
          {spot(onShell(0.7, 2.2), 0.045, '#5fd39a')}
          {spot(onShell(1.1, 0.9), 0.035, '#ffd36b')}
          {spot(onShell(0.35, -1.2), 0.03, '#5fd39a')}
        </group>
      </group>
      {hatched && (
        <>
          <group ref={pet} scale={0.001}>
            <Suspense fallback={null}>
              <Pet id="dragon" stage={0} hop={hop} lively position={[0, 0.06, 0.05]} scale={1.3} />
            </Suspense>
          </group>
          <group ref={sparks}>
            {dirs.map((_, i) => (
              <mesh key={i}>
                <sphereGeometry args={[0.025, 8, 6]} />
                <meshBasicMaterial color={i % 3 ? '#ffd36b' : '#7dffb0'} />
              </mesh>
            ))}
          </group>
        </>
      )}
    </>
  );
}

/** Мастер Гром дарит яйцо: разговор, три стука по скорлупе, дракончик и выбор клички. */
export function PetHatch({ onDone, onLater }: { onDone: (name: string) => void; onLater: () => void }) {
  // Пока вылупляется яйцо, плашка «Игра обновилась» ждёт: окна не встают друг на друга.
  useBusy(true);
  const [step, setStep] = useState<'talk' | 'egg' | 'name'>('talk');
  const [taps, setTaps] = useState(0);
  const [name, setName] = useState(petById('dragon')!.name);
  const lines = useMemo(
    () => [
      say('grom', 'Погоди, ученик. Пока ты сражался, под старым дубом я нашёл вот это. Яйцо тёплое и шевелится.'),
      say('grom', 'Драконы вылупляются, только когда рядом кто-то тренируется. Похоже, оно выбрало тебя. Постучи по скорлупе.'),
    ],
    [],
  );
  const hatched = taps >= EGG_TAPS;
  const tap = () => {
    if (hatched) return;
    const n = taps + 1;
    setTaps(n);
    sfx(n >= EGG_TAPS ? 'chest' : 'hit');
    if (n >= EGG_TAPS) setTimeout(() => setStep('name'), 1500);
  };
  return (
    <div className="pet-hatch">
      {step === 'talk' ? (
        <>
          <div className="pet-hatch-title">Подарок Мастера Грома</div>
          <div className="pet-hatch-scene dim">
            <Canvas3D camera={{ position: [0, 1.0, 3.1], fov: 30 }} onCreated={({ camera }) => camera.lookAt(0, 0.35, 0)}>
              <EggScene taps={0} hatched={false} />
            </Canvas3D>
          </div>
          <Dialog lines={lines} onDone={() => setStep('egg')} />
        </>
      ) : (
        <>
          <div className="pet-hatch-title">{hatched ? 'Это дракончик!' : 'Постучи по яйцу'}</div>
          <div className="pet-hatch-scene" onClick={tap}>
            <Canvas3D camera={{ position: [0, 1.0, 3.1], fov: 30 }} onCreated={({ camera }) => camera.lookAt(0, 0.35, 0)}>
              <EggScene taps={taps} hatched={hatched} />
            </Canvas3D>
            {!hatched && (
              <div className="pet-taps">
                {Array.from({ length: EGG_TAPS }, (_, i) => (
                  <span key={i} className={i < taps ? 'on' : ''} />
                ))}
              </div>
            )}
          </div>
          {step === 'name' ? (
            <div className="pet-hatch-card">
              <Remark line={say('grom', 'Корми его тренировками: каждый твой повтор — опыт ему, а первая тренировка дня — лакомство. Как назовёшь малыша?')} />
              <input className="pet-name-input" value={name} maxLength={14} onChange={(e) => setName(e.target.value)} />
              {badName(name) && <div className="muted warn">{BAD_NAME}</div>}
              <div className="muted">Бонус дракончика: {bonusText(petBonusAt(petById('dragon')!, 1))}, к 20-му уровню до {bonusText(petBonusAt(petById('dragon')!, 20))}.</div>
              <button className="primary" disabled={badName(name)} onClick={() => onDone(name)}>
                Забрать домой
              </button>
            </div>
          ) : (
            <div className="pet-hatch-card">
              <div className="muted">{hatched ? 'Скорлупа разлетелась!' : `Ещё ${EGG_TAPS - taps} ${EGG_TAPS - taps === 1 ? 'стук' : 'стука'}`}</div>
              {!hatched && (
                <button className="link" onClick={onLater}>
                  Позже
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
