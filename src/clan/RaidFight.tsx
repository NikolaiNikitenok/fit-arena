import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { RaidView } from '../../shared/clan';
import { RAID_ATTACK_S, RAID_MAX_DAMAGE, RAID_PREP_S, raidBoss } from '../../shared/raid';
import { itemById } from '../game/items';
import { raidCard, ShareVictory } from '../game/ShareCard';
import { heroHands, heroPower } from '../game/power';
import { Progress } from '../game/progress';
import { Heart, Swords } from '../icons';
import { EXERCISE_LABELS, Exercise } from '../repCounter';
import { canvasProps, getSettings } from '../settings';
import { Character, CharacterProps } from '../three/Character';
import { useRepCamera } from '../useRepCamera';
import { useMusic } from '../audio';
import { useRaidSounds } from '../gameSounds';

/** Огромный босс рейда; рядом может стоять герой игрока. */
export function RaidScene({ raidKey, hit = 0, hero, pulse = 0, dead }: { raidKey: string; hit?: number; hero?: CharacterProps; pulse?: number; dead?: boolean }) {
  const boss = raidBoss(raidKey);
  return (
    <Canvas {...canvasProps(getSettings())} camera={{ position: [1.2, 2.4, 8.2], fov: 42 }} onCreated={({ camera }) => camera.lookAt(0, 1.6, 0)}>
      <color attach="background" args={['#191326']} />
      <fog attach="fog" args={['#191326', 8, 18]} />
      <hemisphereLight args={['#d9ccff', '#2a2035', 1.2]} />
      <directionalLight position={[3, 6, 4]} intensity={2} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[0, 2.5, -2]} intensity={14} color={boss.glow} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[7, 40]} />
        <meshStandardMaterial color="#2a2338" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -1.4]}>
        <ringGeometry args={[1.6, 1.75, 40]} />
        <meshBasicMaterial color={boss.glow} transparent opacity={0.6} />
      </mesh>
      <Suspense fallback={null}>
        <Character model={boss.model} tint={boss.tint} glow={boss.glow} anim={dead ? 'dead' : hit ? 'idle' : 'taunt'} hit={hit} scale={1.75} position={[0, 0, -1.4]} />
        {hero && <Character {...hero} pulse={pulse} pulseAnim="attack" position={[-1.15, 0, 1.6]} rotation={Math.PI - 0.4} scale={0.6} />}
      </Suspense>
    </Canvas>
  );
}

interface Props {
  raid: RaidView;
  attack: { attackId: string; endsAt: number };
  exercise: Exercise;
  progress: Progress;
  // Надбавка уровня клана к урону в рейде, доля.
  bonus: number;
  onHit: (damage: number) => void;
  onDone: (dealt: number) => void;
}

/** Атака на босса: минута повторов, каждый повтор — удар по общему здоровью. */
export function RaidFight({ raid, attack, exercise, progress, bonus, onHit, onDone }: Props) {
  const camera = useRepCamera();
  const hero = heroPower(progress, progress.might);
  const power = { ...hero, damage: Math.min(RAID_MAX_DAMAGE, Math.round(hero.damage * (1 + bonus))) };
  const item = itemById(progress.equipped);
  const [phase, setPhase] = useState<'loading' | 'prep' | 'fight' | 'done' | 'error'>('loading');
  const [reps, setReps] = useState(0);
  const [left, setLeft] = useState(RAID_ATTACK_S);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(0);
  const repsRef = useRef(0);
  const fighting = useRef(false);
  // Здоровье босса меняется от ударов всего клана: читаем свежее в цикле камеры.
  const hpRef = useRef(raid.hp);
  hpRef.current = raid.hp;

  useEffect(() => {
    let first = 0;
    camera
      .start(
        exercise,
        () => {
          if (!fighting.current) return;
          repsRef.current += 1;
          setReps(repsRef.current);
          onHit(power.damage);
        },
        () => {
          const now = performance.now();
          first ||= now;
          const prep = RAID_PREP_S - (now - first) / 1000;
          if (prep > 0) {
            setLeft(Math.ceil(prep));
            return true;
          }
          if (!fighting.current) {
            fighting.current = true;
            startedAt.current = now;
            setPhase('fight');
          }
          const l = RAID_ATTACK_S - (now - startedAt.current) / 1000;
          setLeft(Math.max(0, Math.ceil(l)));
          if (l <= 0 || hpRef.current <= 0 || Date.now() > attack.endsAt) {
            fighting.current = false;
            setPhase('done');
            return false;
          }
          return true;
        },
      )
      .then(() => setPhase((p) => (p === 'loading' ? 'prep' : p)))
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'не загрузилась модель распознавания');
        setPhase('error');
      });
    return () => camera.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const boss = raidBoss(raid.key);
  const dealt = reps * power.damage;
  useMusic('castle', 1);
  useRaidSounds(phase, left, reps, raid.hp <= 0);

  return (
    <>
      <div className="arena mission">
        <RaidScene raidKey={raid.key} hit={reps} pulse={reps} dead={raid.hp <= 0} hero={{ model: item.hero, tint: item.tint, glow: item.glow, hands: heroHands(progress) }} />
        <div className="mhud">
          <div className="mhud-row">
            <span className="mhud-ex">{boss.name}</span>
            <span className="timer">{phase === 'fight' ? left : RAID_ATTACK_S}</span>
          </div>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${(raid.hp / raid.hpMax) * 100}%`, background: boss.glow }} />
          </div>
          <div className="mhud-label">
            {raid.hp.toLocaleString('ru')} / {raid.hpMax.toLocaleString('ru')} HP · {EXERCISE_LABELS[exercise]} · твой урон {dealt}
          </div>
        </div>
        {phase === 'fight' && reps > 0 && (
          <div key={reps} className="dmg-pop">
            −{power.damage}
          </div>
        )}
        {(phase === 'prep' || phase === 'loading') && (
          <div className="countdown">
            <div className="countdown-num">{phase === 'loading' ? '…' : left}</div>
            <div>{phase === 'loading' ? 'Включаю камеру' : 'Займи позицию'}</div>
          </div>
        )}
        {(phase === 'done' || phase === 'error') && (
          <div className="result">
            <div className="result-title">{phase === 'error' ? 'Камера не включилась' : raid.hp <= 0 ? 'Босс повержен!' : 'Атака окончена'}</div>
            <div className="muted light">{phase === 'error' ? error : `${reps} повторов · ${dealt} урона по боссу`}</div>
          </div>
        )}
        <div className={`pip ${camera.active ? '' : 'hidden'}`}>
          <video ref={camera.videoRef} playsInline muted />
          <canvas ref={camera.canvasRef} />
          <div className="pip-count">{reps}</div>
        </div>
      </div>
      <div className="hint-line">
        {phase === 'fight' ? (camera.hint ?? 'Каждый повтор — удар по боссу!') : (
          <>
            <Swords size={13} /> урон за повтор {power.damage} · <Heart size={12} className="heart" /> босса видят все в клане
          </>
        )}
      </div>
      {phase === 'fight' ? (
        <button
          className="secondary"
          onClick={() => {
            fighting.current = false;
            camera.stop();
            setPhase('done');
          }}
        >
          Закончить атаку
        </button>
      ) : (
        (phase === 'done' || phase === 'error') && (
          <>
            {phase === 'done' && raid.hp <= 0 && reps > 0 && <ShareVictory card={() => raidCard(raid.key, progress, reps, dealt)} />}
            <button className="primary" onClick={() => onDone(dealt)}>
              Вернуться в клан
            </button>
          </>
        )
      )}
    </>
  );
}
