import { Suspense, useEffect, useRef, useState } from 'react';
import { EXERCISE_LABELS, Exercise } from '../repCounter';
import { getSettings } from '../settings';
import { Character, CharacterProps } from '../three/Character';
import { useRepCamera } from '../useRepCamera';
import { useMusic } from '../audio';
import { useRaidSounds } from '../gameSounds';
import { Chest, Coin, Heart, Swords } from '../icons';
import { Dialog, Remark } from './Dialog';
import { gearText, itemById, RARITY_COLORS, RARITY_NAMES } from './items';
import { heroHands, heroPower } from './power';
import type { Progress } from './progress';
import { portraitUrl } from './npcs';
import { say } from './story';
import { Canvas3D } from '../three/Canvas3D';
import {
  EVENT_ATTEMPT_S,
  EVENT_COINS,
  EVENT_EXERCISES,
  EVENT_IDLE_MS,
  EVENT_PREP_S,
  EVENT_TRIES_PER_DAY,
  EventBoss,
  eventBoss,
  eventBossSay,
  eventHpLeft,
  eventIntro,
  eventOf,
  eventOutfit,
  EventReward,
  eventWindow,
  daysUntil,
  fmtDays,
  fmtLeft,
  fmtWeekend,
  triesLeft,
} from './event';
import { locale, t } from '../i18n';

// Экран события выходных: рассказ жителя, общий запас здоровья босса, попытки на сегодня и награда.

/** Арена босса события: своё небо, земля и свечение у каждого месяца. */
function EventScene({ boss, hit = 0, hero, pulse = 0, dead, angry }: { boss: EventBoss; hit?: number; hero?: CharacterProps; pulse?: number; dead?: boolean; angry?: boolean }) {
  return (
    <Canvas3D camera={{ position: [1.2, 2.4, 8.2], fov: 42 }} onCreated={({ camera }) => camera.lookAt(0, 1.6, 0)}>
      <color attach="background" args={[boss.sky]} />
      <fog attach="fog" args={[boss.sky, 9, 20]} />
      <hemisphereLight args={['#ffffff', boss.ground, 1.25]} />
      <directionalLight position={[3, 6, 4]} intensity={2} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[0, 2.5, -2]} intensity={16} color={angry ? '#ff1744' : boss.glow} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[7, 40]} />
        <meshStandardMaterial color={boss.ground} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -1.4]}>
        <ringGeometry args={[1.6, 1.78, 40]} />
        <meshBasicMaterial color={boss.glow} transparent opacity={0.75} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, -1.4]}>
        <ringGeometry args={[2.3, 2.36, 40]} />
        <meshBasicMaterial color={boss.accent} transparent opacity={0.45} />
      </mesh>
      <Suspense fallback={null}>
        <Character model={boss.model} tint={boss.tint} glow={angry ? '#ff1744' : boss.glow} anim={dead ? 'dead' : hit ? 'idle' : 'taunt'} hit={hit} scale={1.75} position={[0, 0, -1.4]} />
        {hero && <Character {...hero} pulse={pulse} pulseAnim="attack" position={[-1.15, 0, 1.6]} rotation={Math.PI - 0.4} scale={0.6} />}
      </Suspense>
    </Canvas3D>
  );
}

/** Облик-награда: портрет той же модели в цветах облика. */
const FACE: Record<string, string> = { Knight: 'hero', Rogue: 'lisa', Mage: 'fedor', Barbarian: 'grom' };
export const OutfitFace = ({ id, size = 46 }: { id: string; size?: number }) => {
  const i = itemById(id);
  return (
    <span className="inv-face" style={{ width: size, height: size, background: `radial-gradient(circle at 50% 35%, ${i.color}, #1b1d26 80%)`, boxShadow: i.glow ? `0 0 14px ${i.glow}` : undefined }}>
      <img src={portraitUrl(FACE[i.hero] ?? 'hero')} alt="" draggable={false} />
    </span>
  );
};

interface Props {
  progress: Progress;
  // Попытка закончилась: урон в копилку, повторы в серию. Вернёт награду, если босс повержен.
  onFinish: (dealt: number, reps: number, exercise: Exercise) => { killed: boolean; reward?: EventReward } | null;
  // Попытка началась: тратится выпитый эликсир силы.
  onStart: () => void;
  onClose: () => void;
}

type Phase = 'intro' | 'lobby' | 'fight' | 'done';

export function EventScreen({ progress, onFinish, onStart, onClose }: Props) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tm = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(tm);
  }, []);
  const w = eventWindow(now);
  const boss = eventBoss(w.key);
  const state = eventOf(progress, now);
  const tries = triesLeft(progress, now);
  const outfit = eventOutfit(boss);
  // Рассказ жителя — когда событие идёт, а герой ещё не бил босса.
  const [phase, setPhase] = useState<Phase>(() => (w.live && !state.dealt && !state.won && getSettings().story ? 'intro' : 'lobby'));
  const [exercise, setExercise] = useState<Exercise>('squat');
  const [last, setLast] = useState<{ dealt: number; reps: number; killed: boolean; reward?: EventReward } | null>(null);
  const [fight, setFight] = useState(0);
  const hpLeft = eventHpLeft(state);
  const power = heroPower(progress, progress.might);
  const item = itemById(progress.equipped);
  useMusic('castle', 1);

  if (phase === 'fight')
    return (
      <EventFight
        key={fight}
        boss={boss}
        progress={progress}
        exercise={exercise}
        hpLeft={hpLeft}
        hpMax={state.hpMax}
        onDone={(dealt, reps) => {
          const r = reps > 0 ? onFinish(dealt, reps, exercise) : null;
          setLast({ dealt, reps, killed: !!r?.killed, reward: r?.reward });
          setPhase('done');
        }}
      />
    );

  const won = state.won;
  const share = state.hpMax ? hpLeft / state.hpMax : 1;
  const tag = w.live ? t('Событие выходных · до конца {0}', { 0: fmtLeft(w.end - now) }) : t('Событие выходных · {0}', { 0: fmtWeekend(w) });
  const canFight = w.live && !won && tries > 0;

  return (
    <>
      <div className="arena mission event-arena" style={{ ['--eg' as string]: boss.glow }}>
        <EventScene boss={boss} dead={won} hero={{ model: item.hero, tint: item.tint, glow: item.glow, hands: heroHands(progress) }} />
        {phase === 'intro' && <Dialog lines={eventIntro(boss)} onDone={() => setPhase('lobby')} />}
        {phase !== 'intro' && (
          <div className="result event-lobby">
            <div className="level-tag" style={{ color: boss.glow }}>
              {tag}
            </div>
            <div className="result-title small">{phase === 'done' && last?.killed ? t('Босс повержен!') : boss.name}</div>
            <div className="muted light">{boss.title}</div>
            {phase === 'done' && last && (
              <div className="event-last">
                {last.reps ? t('{0} повторов · {1} урона', { 0: last.reps, 1: last.dealt.toLocaleString(locale()) }) : t('Попытка не засчитана: ни одного повтора')}
              </div>
            )}
            <div className="event-hp">
              <div className="event-hp-row">
                <span>
                  <Heart size={13} className="heart" /> {won ? t('Повержен') : `${hpLeft.toLocaleString(locale())} / ${state.hpMax.toLocaleString(locale())} HP`}
                </span>
                <span>{t('{0}% урона', { 0: Math.round((1 - share) * 100) })}</span>
              </div>
              <div className="bar">
                <div className="bar-fill" style={{ width: `${share * 100}%`, background: boss.glow }} />
              </div>
              <div className="event-hp-note">{t('Урон копится за все попытки этих выходных')}</div>
            </div>
            {phase === 'done' && last?.killed && last.reward ? (
              <EventRewardCard reward={last.reward} />
            ) : (
              <div className="event-reward">
                <OutfitFace id={outfit.id} />
                <div className="event-reward-text">
                  <div className="event-reward-name" style={{ color: RARITY_COLORS[outfit.rarity] }}>
                    {outfit.name}
                  </div>
                  <div className="muted">
                    {t('{0} облик · только из события', { 0: RARITY_NAMES[outfit.rarity] })}
                  </div>
                  <div className="event-reward-more">
                    <Coin size={13} className="coin" /> {EVENT_COINS} · <Chest size={16} /> {t('сундук')}
                  </div>
                </div>
              </div>
            )}
            {phase === 'done' && last?.killed ? (
              <Remark line={eventBossSay(boss, boss.defeat)} />
            ) : !w.live ? (
              <Remark line={say(boss.npc, t('{0} Жду тебя {1}, в выходные {2}.', { 0: boss.story[0], 1: fmtDays(daysUntil(w, now)), 2: fmtWeekend(w) }))} />
            ) : won ? (
              <Remark line={say(boss.npc, t('Ты его одолел! Облик уже в инвентаре. В следующем месяце придёт новый гость.'))} />
            ) : (
              <>
                <div className="event-tries">
                  {t('Попытки сегодня:')} <b>{tries}</b> {t('из {0} · жизни не тратятся · {1} с', { 0: EVENT_TRIES_PER_DAY, 1: EVENT_ATTEMPT_S })}
                </div>
                {tries > 0 && (
                  <div className="swap-row">
                    {EVENT_EXERCISES.map((ex) => (
                      <button key={ex} className={`swap-chip ${exercise === ex ? 'on' : ''}`} onClick={() => setExercise(ex)}>
                        {EXERCISE_LABELS[ex]}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <div className="hint-line">
        <Swords size={13} /> {t('урон за повтор {0} ·', { 0: power.damage })} <Heart size={12} className="heart" /> {t('{0} сердца: стоишь дольше {1} с — босс бьёт', { 0: power.hearts, 1: EVENT_IDLE_MS / 1000 })}
      </div>
      {canFight ? (
        <button
          className="primary"
          onClick={() => {
            onStart();
            setFight((n) => n + 1);
            setPhase('fight');
          }}
        >
          {phase === 'done' ? t('Ещё попытка') : t('В бой')}
          <span className="btn-cost">{tries}/{EVENT_TRIES_PER_DAY}</span>
        </button>
      ) : (
        <button className="primary" disabled>
          {!w.live ? t('Начнётся {0}', { 0: fmtDays(daysUntil(w, now)) }) : won ? t('Босс повержен') : t('Попытки кончились: завтра ещё три')}
        </button>
      )}
      <button className="link" onClick={onClose}>
        {t('Назад')}
      </button>
    </>
  );
}

function EventRewardCard({ reward }: { reward: EventReward }) {
  return (
    <div className="drop event-drop">
      <OutfitFace id={reward.outfit.id} size={44} />
      <div>
        <div className="drop-title">{t('Облик: {0}', { 0: reward.outfit.name })}</div>
        <div className="muted">
          {t('+{0} монет', { 0: reward.coins + reward.chestCoins })}
          {reward.gear ? t(' · в сундуке: {0} ({1})', { 0: reward.gear.name, 1: gearText(reward.gear) }) : t(' · сундук с монетами')}
        </div>
      </div>
    </div>
  );
}

/** Попытка: полторы минуты повторов, каждый — удар по общему здоровью. Отдых дольше 7 секунд стоит сердце. */
function EventFight({ boss, progress, exercise, hpLeft, hpMax, onDone }: { boss: EventBoss; progress: Progress; exercise: Exercise; hpLeft: number; hpMax: number; onDone: (dealt: number, reps: number) => void }) {
  const camera = useRepCamera();
  const power = heroPower(progress, progress.might);
  const item = itemById(progress.equipped);
  const [phase, setPhase] = useState<'loading' | 'prep' | 'fight' | 'done' | 'error'>('loading');
  const [reps, setReps] = useState(0);
  const [hearts, setHearts] = useState(power.hearts);
  const [left, setLeft] = useState(EVENT_ATTEMPT_S);
  const [error, setError] = useState<string | null>(null);
  const [angry, setAngry] = useState(false);
  const repsRef = useRef(0);
  const fighting = useRef(false);
  const finished = useRef(false);
  const dealtOf = (n: number) => Math.min(hpLeft, n * power.damage);
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    fighting.current = false;
    camera.stop();
    setPhase('done');
    onDone(dealtOf(repsRef.current), repsRef.current);
  };

  useEffect(() => {
    let first = 0;
    let startedAt = 0;
    let lastRep = 0;
    let h = power.hearts;
    camera
      .start(
        exercise,
        () => {
          if (!fighting.current) return;
          repsRef.current += 1;
          lastRep = performance.now();
          setReps(repsRef.current);
          setAngry(false);
        },
        () => {
          const now = performance.now();
          first ||= now;
          const prep = EVENT_PREP_S - (now - first) / 1000;
          if (prep > 0) {
            setLeft(Math.ceil(prep));
            setPhase('prep');
            return true;
          }
          if (!fighting.current) {
            fighting.current = true;
            startedAt = now;
            lastRep = now;
            setPhase('fight');
          }
          // Стоишь без повторов — босс бьёт: минус сердце.
          if (now - lastRep >= EVENT_IDLE_MS) {
            lastRep = now;
            h -= 1;
            setHearts(h);
            setAngry(true);
          }
          const l = EVENT_ATTEMPT_S - (now - startedAt) / 1000;
          setLeft(Math.max(0, Math.ceil(l)));
          if (l <= 0 || h <= 0 || repsRef.current * power.damage >= hpLeft) {
            finish();
            return false;
          }
          return true;
        },
      )
      .catch((e) => {
        setError(e instanceof Error ? e.message : t('не загрузилась модель распознавания'));
        setPhase('error');
      });
    return () => camera.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dealt = dealtOf(reps);
  const hpNow = hpLeft - dealt;
  useRaidSounds(phase, left, reps, hpNow <= 0);

  return (
    <>
      <div className="arena mission">
        <EventScene boss={boss} hit={reps} pulse={reps} dead={hpNow <= 0} angry={angry} hero={{ model: item.hero, tint: item.tint, glow: item.glow, hands: heroHands(progress) }} />
        <div className="mhud">
          <div className="mhud-row">
            <span className="mhud-ex">{boss.name}</span>
            <span className="hearts">
              {Array.from({ length: power.hearts }, (_, k) => k + 1).map((i) => (
                <span key={i} className={i <= hearts ? 'on' : ''}>
                  ♥
                </span>
              ))}
            </span>
            <span className="timer">{phase === 'fight' ? left : EVENT_ATTEMPT_S}</span>
          </div>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${(hpNow / hpMax) * 100}%`, background: boss.glow }} />
          </div>
          <div className="mhud-label">
            {hpNow.toLocaleString(locale())} / {hpMax.toLocaleString(locale())} HP · {EXERCISE_LABELS[exercise]} · {t('урон за попытку {0}', { 0: dealt })}
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
            <div>{phase === 'loading' ? t('Включаю камеру') : t('Займи позицию')}</div>
          </div>
        )}
        {phase === 'error' && (
          <div className="result">
            <div className="result-title">{t('Камера не включилась')}</div>
            <div className="muted light">{t('{0} · попытка не потрачена', { 0: error })}</div>
          </div>
        )}
        <div className={`pip ${camera.active ? '' : 'hidden'}`}>
          <video ref={camera.videoRef} playsInline muted />
          <canvas ref={camera.canvasRef} />
          <div className="pip-count">{reps}</div>
        </div>
      </div>
      <div className="hint-line">{phase === 'fight' ? (camera.hint ?? t('Каждый повтор — удар по боссу!')) : t('Урон за повтор {0}', { 0: power.damage })}</div>
      {phase === 'error' ? (
        <button className="primary" onClick={() => onDone(0, 0)}>
          {t('Назад')}
        </button>
      ) : (
        <button className="secondary" onClick={finish}>
          {t('Закончить попытку')}
        </button>
      )}
    </>
  );
}
