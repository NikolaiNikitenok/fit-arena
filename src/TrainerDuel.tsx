import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { track } from './telemetry';
import { useBusy } from './updates/busy';
import { ArenaStage } from './ArenaStage';
import { type Battle, MAX_HP, newBattle, type Side, strike, winner } from '../shared/battle';
import type { FighterView } from '../shared/protocol';
import { CameraGuide } from './CameraGuide';
import { EXERCISE_LABELS, RepExercise } from './repCounter';
import { userName } from './telegram';
import { useRepCamera } from './useRepCamera';
import { useMusic } from './audio';
import { useDuelSounds } from './gameSounds';
import { loadProgress, recordOutsideReps, recordTrainerDuel } from './game/progress';
import { Dialog, Portrait, Remark } from './game/Dialog';
import { NPCS } from './game/npcs';
import { nextTrainer, pickLine, type Trainer, type TrainerId, trainerLine, trainerRate, trainerSchedule, TRAINERS } from './game/trainer';
import { Check } from './icons';
import { t } from './i18n';
import { withWarmup } from './warmup/warmup';

// Бой с тренером: та же минута и те же правила урона, что в живой дуэли, но соперник — бот на этом устройстве.
// Кубки и рейтинг не меняются, повторы идут в серию, задание дня и клан.

type Phase = 'pick' | 'talk' | 'countdown' | 'fight' | 'over';

const FIGHT_MS = 60_000;
const COUNTDOWN_MS = 3000;
// Как на сервере живых дуэлей: чаще повторы не засчитываются.
const MIN_REP_INTERVAL_MS = 400;
// Бой засчитывается в пропуск, если игрок правда тренировался.
const MIN_REPS_FOR_PASS = 3;
const KNYAZ_RAGE = 0.35;

const RESULT_TEXT = { win: t('Победа!'), lose: t('Поражение'), draw: t('Ничья') };
const LEVEL_COLOR: Record<TrainerId, string> = { lisa: 'var(--mint)', grom: 'var(--gold)', knyaz: 'var(--rose)' };

const BEATEN_KEY = 'fit-arena-trainers';
function loadBeaten(): TrainerId[] {
  try {
    return JSON.parse(localStorage.getItem(BEATEN_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function saveBeaten(ids: TrainerId[]): void {
  try {
    localStorage.setItem(BEATEN_KEY, JSON.stringify(ids));
  } catch {
    // Без хранилища просто не будет отметок.
  }
}

interface Fight {
  exercise: RepExercise;
  battle: Battle;
  combo: Record<Side, boolean>;
  startAt: number;
  schedule: number[];
  next: number;
  lastRepAt: number;
  // Повторы игрока, ещё не записанные в прогресс.
  unsaved: number;
  done: boolean;
}

export function TrainerDuel({ exercise, onExit }: { exercise: RepExercise; onExit: () => void }) {
  const camera = useRepCamera();
  const [phase, setPhase] = useState<Phase>('pick');
  useBusy(phase === 'talk' || phase === 'countdown' || phase === 'fight');
  const [trainer, setTrainer] = useState<Trainer>(TRAINERS[0]);
  const [beaten, setBeaten] = useState<TrainerId[]>(loadBeaten);
  const [seed, setSeed] = useState(() => Date.now() >>> 0);
  const [, setFrame] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<{ result: 'win' | 'lose' | 'draw'; reason: 'ko' | 'time' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Реплика тренера перед боем: тап по ней убирает её.
  const [talking, setTalking] = useState(false);
  const fight = useRef<Fight | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const baseline = useMemo(() => loadProgress().baseline, [phase === 'pick']);

  // Записать сделанные повторы: в серию, задание дня и опыт клана.
  const flushReps = () => {
    const f = fight.current;
    if (f?.unsaved) recordOutsideReps(f.exercise, f.unsaved, Date.now());
    if (f) f.unsaved = 0;
  };
  useEffect(() => flushReps, []);

  const onRep = () => {
    const f = fight.current;
    const tm = Date.now();
    if (!f || phaseRef.current !== 'fight' || tm - f.lastRepAt < MIN_REP_INTERVAL_MS) return;
    f.lastRepAt = tm;
    const r = strike(f.battle, 'player', tm);
    f.battle = r.battle;
    f.combo.player = r.strike.combo;
    f.unsaved++;
    setFrame((n) => n + 1);
  };

  // DEV: повтор без камеры для проверки боя в браузере. В сборку для игроков не попадает.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __trainerRep?: () => void };
    w.__trainerRep = onRep;
    return () => void delete w.__trainerRep;
  }, []);

  const finish = (side: Side | 'draw', reason: 'ko' | 'time') => {
    const f = fight.current;
    if (!f || f.done) return;
    f.done = true;
    const res = side === 'draw' ? 'draw' : side === 'player' ? 'win' : 'lose';
    const hits = f.battle.player.hits;
    flushReps();
    if (hits >= MIN_REPS_FOR_PASS) recordTrainerDuel(Date.now());
    if (res === 'win')
      setBeaten((list) => {
        if (list.includes(trainer.id)) return list;
        const next = [...list, trainer.id];
        saveBeaten(next);
        return next;
      });
    setResult({ result: res, reason });
    setPhase('over');
    camera.stop();
  };

  // Отсчёт и бой: тренер бьёт по расписанию, время и нокаут проверяем на каждом тике.
  useEffect(() => {
    if (phase !== 'countdown' && phase !== 'fight') return;
    const id = setInterval(() => {
      const tm = Date.now();
      setNow(tm);
      const f = fight.current!;
      if (phaseRef.current === 'countdown') {
        if (tm >= f.startAt) setPhase('fight');
        return;
      }
      const elapsed = tm - f.startAt;
      let changed = false;
      while (f.next < f.schedule.length && f.schedule[f.next] <= elapsed && !winner(f.battle, false)) {
        const r = strike(f.battle, 'bot', f.startAt + f.schedule[f.next]);
        f.battle = r.battle;
        f.combo.bot = r.strike.combo;
        f.next++;
        changed = true;
      }
      if (changed) setFrame((n) => n + 1);
      const w = winner(f.battle, elapsed >= FIGHT_MS);
      if (w) finish(w, elapsed >= FIGHT_MS && f.battle.player.hp > 0 && f.battle.bot.hp > 0 ? 'time' : 'ko');
    }, 100);
    return () => clearInterval(id);
  }, [phase]);

  // Нокаут игроком — сразу, не дожидаясь тика.
  useEffect(() => {
    const f = fight.current;
    if (phase === 'fight' && f && f.battle.bot.hp === 0) finish('player', 'ko');
  });

  const choose = (tm: Trainer) => {
    setTrainer(tm);
    setResult(null);
    setError(null);
    fight.current = null;
    setSeed((s) => (s * 1103515245 + 12345) >>> 0);
    setTalking(true);
    setPhase('talk');
    // Карточки внизу списка: возвращаемся к арене, где тренер начнёт говорить.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const ready = async () => {
    setError(null);
    try {
      if (!camera.active) await camera.start(exercise, onRep);
      track('duel_start', 'trainer');
    } catch (e) {
      // В DEV можно драться и без камеры: повторы приходят из __trainerRep.
      if (!import.meta.env.DEV) {
        setError(t('Не удалось запустить камеру: {0}', { 0: e instanceof Error ? e.message : t('ошибка модели') }));
        return;
      }
    }
    const tm = Date.now();
    const fightSeed = (seed ^ tm) >>> 0;
    fight.current = {
      exercise,
      battle: newBattle(),
      combo: { player: false, bot: false },
      startAt: tm + COUNTDOWN_MS,
      schedule: trainerSchedule(trainer, loadProgress().baseline, exercise, FIGHT_MS, fightSeed),
      next: 0,
      lastRepAt: -Infinity,
      unsaved: 0,
      done: false,
    };
    setSeed(fightSeed);
    setTalking(false);
    setResult(null);
    setNow(tm);
    setPhase('countdown');
  };

  const leave = () => {
    camera.stop();
    flushReps();
    fight.current = null;
    setResult(null);
    setPhase('pick');
  };

  const npc = NPCS[trainer.npc];
  const f = fight.current;
  const view = (side: Side, name: string): FighterView => {
    const b = f?.battle[side];
    return b ? { name, hp: b.hp, maxHp: b.maxHp, hits: b.hits, combo: f!.combo[side] } : { name, hp: MAX_HP, maxHp: MAX_HP, hits: 0, combo: false };
  };
  const me = view('player', userName());
  const opponent = view('bot', npc.name);
  const endsAt = phase === 'countdown' ? (f?.startAt ?? now) : (f?.startAt ?? now) + FIGHT_MS;
  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const fighting = phase === 'talk' || phase === 'countdown' || phase === 'fight' || phase === 'over';

  useMusic(fighting ? 'arena' : 'calm');
  useDuelSounds(phase, seconds, me, opponent, result);

  const harder = nextTrainer(trainer.id);
  const easier = TRAINERS[TRAINERS.indexOf(trainer) - 1] ?? null;
  const intro = useMemo(() => [trainerLine(trainer, pickLine(trainer.intro, seed))], [trainer, seed]);

  let overlay: ReactNode = null;
  if (phase === 'countdown') overlay = <div className="result-title">{seconds || t('Бой!')}</div>;
  if (phase === 'over' && result)
    overlay = (
      <>
        <div className="result-title">{RESULT_TEXT[result.result]}</div>
        <div className="muted">
          {result.reason === 'ko' ? t('нокаутом') : t('по очкам')} · {t('{0} повторов', { 0: me.hits })}
        </div>
        <Remark
          line={trainerLine(
            trainer,
            result.result === 'win' ? pickLine(trainer.beaten, seed) : result.result === 'lose' ? pickLine(trainer.won, seed) : t('Ничья. Так даже интереснее: ещё раунд?'),
          )}
        />
      </>
    );

  return (
    <>
      <ArenaStage
        me={me}
        opponent={opponent}
        seconds={phase === 'fight' ? seconds : 60}
        camera={camera}
        overlay={overlay}
        result={phase === 'over' ? result?.result : null}
        opponentLook={trainer.look}
        opponentColor={npc.color}
        opponentScale={trainer.scale}
        enraged={trainer.id === 'knyaz' && phase === 'fight' && opponent.hp > 0 && opponent.hp <= opponent.maxHp * KNYAZ_RAGE}
      >
        {phase === 'talk' && talking && <Dialog key={`${trainer.id}-${seed}`} lines={intro} onDone={() => setTalking(false)} />}
      </ArenaStage>

      <div className="hint-line">
        {error ??
          (phase === 'pick'
            ? t('Темп тренера подстроится под твою силу. Кубки не меняются')
            : phase === 'talk'
              ? t('{0}: встань в кадр и жми «Я готов»', { 0: EXERCISE_LABELS[exercise] })
              : phase === 'fight'
                ? camera.hint ?? t('Отлично, продолжай!')
                : '')}
      </div>

      {phase === 'pick' && (
        <>
          <div className="trainer-list">
            {TRAINERS.map((tm) => {
              const n = NPCS[tm.npc];
              const won = beaten.includes(tm.id);
              return (
                <button key={tm.id} className="trainer-card" style={{ borderColor: tm.id === trainer.id ? n.color : undefined }} onClick={() => choose(tm)}>
                  <Portrait line={{ face: tm.npc, color: n.color, who: n.name }} size={52} />
                  <span className="trainer-info">
                    <span className="trainer-name" style={{ color: n.color }}>
                      {n.name}
                      {won && <Check size={15} className="trainer-won" />}
                    </span>
                    <span className="muted">{tm.about}</span>
                  </span>
                  <span className="trainer-side">
                    <span className="trainer-level" style={{ color: LEVEL_COLOR[tm.id] }}>
                      {tm.level}
                    </span>
                    <span className="trainer-pace">{t('≈{0} в мин', { 0: Math.max(1, Math.round(trainerRate(tm, baseline, exercise))) })}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <button className="link" onClick={onExit}>
            {t('К живым дуэлям')}
          </button>
        </>
      )}

      {phase === 'talk' && (
        <>
          <CameraGuide exercise={exercise} />
          <button className="primary" onClick={() => withWarmup(() => void ready())}>
            {t('Я готов')}
          </button>
          <button className="link" onClick={leave}>
            {t('Выбрать другого тренера')}
          </button>
        </>
      )}

      {(phase === 'countdown' || phase === 'fight') && (
        <button className="link" onClick={leave}>
          {t('Сдаться')}
        </button>
      )}

      {phase === 'over' && result && (
        <>
          <button className="primary" onClick={() => withWarmup(() => void ready())}>
            {t('Реванш')}
          </button>
          {result.result === 'win' && harder && (
            <button className="secondary" onClick={() => choose(harder)}>
              {t('Тренер сильнее: {0}', { 0: NPCS[harder.npc].name })}
            </button>
          )}
          {result.result !== 'win' && easier && (
            <button className="secondary" onClick={() => choose(easier)}>
              {t('Тренер полегче: {0}', { 0: NPCS[easier.npc].name })}
            </button>
          )}
          <button className="link" onClick={leave}>
            {t('Выбрать тренера')}
          </button>
        </>
      )}
    </>
  );
}
