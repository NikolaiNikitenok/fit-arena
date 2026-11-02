import { useEffect, useRef, useState } from 'react';
import { track, trackFirstRep } from '../telemetry';
import { EXERCISE_LABELS, Exercise, RepExercise } from '../repCounter';
import { CameraGuide } from '../CameraGuide';
import { Heart, Swords } from '../icons';
import { getSettings, useSettings } from '../settings';
import { useRepCamera } from '../useRepCamera';
import { reportAdventure } from '../family';
import { useMissionSounds } from '../gameSounds';
import { needsCalibration } from '../calibration';
import { CalibrationOverlay } from '../CalibrationOverlay';
import { unlockVoice, useVoiceCoach } from '../voice';
import { gearIcon, gearText, itemById, potionById } from './items';
import { outfitSkin } from './outfitSkin';
import { LANDS, WORLD_NAMES } from './lands';
import { LevelDef } from './levels';
import { Mission, MissionView } from './mission';
import { heroHands, heroPower } from './power';
import { petLook } from './pets';
import { MissionScene3D } from './MissionScene3D';
import { SportStage } from '../sport/SportStage';
import { SPORT_NAMES } from '../sport/names';
import { Stars } from './Stars';
import { bossCard, makeShareCard, ShareVictory } from './ShareCard';
import { WinPost } from '../social/WinPost';
import { ChannelOffer, channelAfterWinDue } from '../social/ChannelOffer';
import { HomeShortcutOffer } from '../HomeShortcut';
import { Dialog, Remark } from './Dialog';
import { dayKey, freeAttempt, Progress, SWAPS_PER_DAY, WinReward } from './progress';
import { afterLine, bossDefeat, restLine } from './story';
import { type Combo, comboLive, comboShout, comboTier, nextCombo, NO_COMBO } from './combo';
import { sfx } from '../audio';
import { locale, t } from '../i18n';
import { InviteOffer, inviteOfferDue } from '../friends/InviteOffer';
import { markWarmup, withWarmup } from '../warmup/warmup';
import { RestBreak, StartGate } from '../StartGate';

const PREP_S = 5;
// Без камеры: отсчёт короче (телефон уже в руке), и не чаще повтора в 0,6 с — быстрее никто не приседает.
const MANUAL_PREP_S = 3;
// После калибровки игрок уже в позиции: отсчёт короче.
const CALIB_PREP_S = 3;
const MANUAL_MIN_GAP_MS = 600;
// Тряска сцены при ударе — не для тех, кто просил телефон меньше двигать картинку.
const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;


type Status = 'story' | 'ready' | 'loading' | 'running' | 'won' | 'lost' | 'error';

const TYPE_NAMES: Record<LevelDef['type'], string> = {
  trial: t('Испытание'),
  build: t('Строитель'),
  chase: t('Погоня'),
  climb: t('Подъём'),
  defend: t('Оборона'),
  rescue: t('Спасение'),
  boss: t('Босс'),
};
// Стиль «Спорт»: без сказочных названий — обычный подход, контрольный подход, тест силы.

// Звёзды уровня: в отдельном модуле, чтобы карта не тянула за собой экран миссии.
export { Stars };

interface Props {
  level: LevelDef;
  progress: Progress;
  onExit: () => void;
  onWin: (stars: number, record?: number) => WinReward;
  // Поражение стоит жизнь; победа бесплатна.
  onLose: () => void;
  // manual — повторы посчитаны самим игроком без камеры: клану и в топ они не идут.
  onActivity: (exercise: Exercise | null, reps: number, manual?: boolean) => void;
  // С первого экрана: брифинг и калибровку пропускаем, камера включается сама.
  autoStart?: boolean;
  lives: { lives: number; max: number; nextMs: number };
  // Замены упражнений на сегодня; onSwap списывает их при старте и говорит, хватило ли.
  swaps: { left: number; paid: number };
  onSwap: (count: number) => boolean;
  // Попытка началась: тратится выпитый эликсир силы.
  onStart: () => void;
  onNext?: () => void;
}

const ALL: RepExercise[] = ['squat', 'pushup', 'situp'];

export function MissionPlay({ level: original, progress, onExit, onWin, onLose, onActivity, autoStart, lives, swaps, onSwap, onStart, onNext }: Props) {
  const camera = useRepCamera();
  // Упражнения уровня с учётом замен игрока.
  const [exercises, setExercises] = useState<RepExercise[]>(original.exercises);
  const [picking, setPicking] = useState<number | null>(null);
  const level: LevelDef = exercises === original.exercises ? original : { ...original, exercises };
  // Попытка бесплатна (задание дня, первое прохождение испытания силы); решаем по началу боя, а не по ходу.
  const [free] = useState(() => freeAttempt(progress, original));
  // После яркой победы — одно предложение: позвать друзей за легендарный облик (или ярлык на экран).
  const [invite, setInvite] = useState(false);
  const [channelOffer, setChannelOffer] = useState(false);
  const swapCount = exercises.filter((e, i) => e !== original.exercises[i]).length;
  const canSwap = original.type !== 'trial' && !original.daily;
  const land = LANDS[level.land];
  const item = itemById(progress.equipped);
  // Сила героя на этот бой: уровень, оружие, щит и эликсир.
  const power = heroPower(progress, progress.might);
  const combat = { damage: power.damage, hearts: power.hearts };
  const make = () => new Mission(level, progress.baseline, combat);
  const mission = useRef<Mission>(make());
  const settings = useSettings();
  const [status, setStatus] = useState<Status>(original.story.length && getSettings().story && getSettings().style !== 'sport' && !autoStart ? 'story' : 'ready');
  // «Считаю сам»: камеры нет или не дали доступ — игрок жмёт кнопку после каждого повтора.
  const [manual, setManual] = useState(false);
  const manualRef = useRef(false);
  const manualTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Камера грузится дольше 8 секунд (слабый телефон, медленная сеть): предлагаем считать самому.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (status !== 'loading') return setSlow(false);
    const tm = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(tm);
  }, [status]);
  const lastTap = useRef(0);
  const stopManual = () => {
    if (manualTimer.current) clearInterval(manualTimer.current);
    manualTimer.current = null;
  };
  useEffect(() => stopManual, []);
  const [attempt, setAttempt] = useState(0);
  const [epilogue, setEpilogue] = useState(false);
  const [view, setView] = useState<MissionView>(() => mission.current.view(0));
  const [elapsedShare, setElapsedShare] = useState(0);
  const [result, setResult] = useState<{ stars: number; reward: WinReward } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exercise = useRef<RepExercise>(level.exercises[0]);
  const [countdown, setCountdown] = useState(0);
  // Повторы с калибровки: засчитываются в бой, как только он начнётся.
  const credit = useRef(0);
  // Перерыв между упражнениями босса: с какого момента отдыхаем и когда (после «Продолжить») снова в бой.
  const phaseRef = useRef(0);
  const restRef = useRef<{ from: number; resumeAt: number; done: RepExercise; step: number } | null>(null);
  const [rest, setRest] = useState<{ done: RepExercise; step: number; going: boolean } | null>(null);
  const [restS, setRestS] = useState(0);
  // Засчитанные повторы по упражнениям — для семейного сайта.
  const repsBy = useRef<Partial<Record<Exercise, number>>>({});
  // Комбо: повторы без пауз. Вспышка, тряска, выкрики и огонь на кулаках — только ощущения, урон не меняется.
  const comboRef = useRef<Combo>(NO_COMBO);
  const [combo, setCombo] = useState<Combo>(NO_COMBO);
  const [hit, setHit] = useState(0);
  const [shout, setShout] = useState<{ text: string; key: number } | null>(null);
  const arenaRef = useRef<HTMLDivElement>(null);
  const onHit = (now: number) => {
    const c = nextCombo(comboRef.current, now);
    comboRef.current = c;
    setCombo(c);
    setHit((h) => h + 1);
    const tier = comboTier(c.n);
    camera.setFlame(tier);
    const text = comboShout(c.n);
    if (text) {
      setShout({ text, key: now });
      sfx('combo');
    }
    if (!calm()) {
      const a = 2 + tier * 2;
      arenaRef.current?.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${-a}px,${a / 2}px)` }, { transform: `translate(${a}px,${-a / 2}px)` }, { transform: 'translate(0,0)' }], { duration: 160 + tier * 30, easing: 'ease-out' });
    }
  };
  useMissionSounds(status, countdown, view, level.type === 'boss');
  const calibrating = status === 'running' && camera.calib != null;
  const waiting = status === 'running' && camera.waiting;
  useVoiceCoach(status === 'running' && countdown <= 0 && !calibrating && !waiting && !rest, view.reps, Math.ceil(view.leftMs / 1000), camera.hint, level.seconds, level.type === 'trial' ? undefined : mission.current.target);

  const finish = (m: Mission, now: number) => {
    camera.stop();
    stopManual();
    const v = m.view(now);
    setView(v);
    // Повторы без камеры на семейный сайт не уходят: там считают проверенные камерой.
    if (!manualRef.current) reportAdventure(repsBy.current);
    onActivity(level.exercises.length === 1 ? level.exercises[0] : null, v.reps, manualRef.current);
    if (v.outcome === 'won') {
      const stars = m.stars(now);
      // Без камеры рекорд испытания не меняет силу врагов: самоотчёт может быть любым.
      const inviteNow = inviteOfferDue(progress, stars, level.type === 'boss', dayKey(Date.now()));
      setInvite(inviteNow);
      // Канал игры — один раз, начиная со второй победы, и не вместе с приглашением друзей.
      setChannelOffer(!inviteNow && channelAfterWinDue());
      setResult({ stars, reward: onWin(stars, manualRef.current ? undefined : v.record) });
      setEpilogue(level.type === 'boss' && getSettings().style !== 'sport');
      setStatus('won');
    } else {
      onLose();
      setStatus('lost');
    }
  };

  const choose = (slot: number, ex: RepExercise) => {
    const next = exercises.map((e, i) => (i === slot ? ex : e));
    setExercises(next);
    setPicking(null);
    const m = new Mission({ ...original, exercises: next }, progress.baseline, combat);
    mission.current = m;
    setView(m.view(0));
  };

  /** Общее начало попытки (с камерой и без): жизнь, замены, сброс сцены. null — начать нельзя. */
  const begin = (): Mission | null => {
    // Задание дня и испытания силы жизней не требуют: новичок не должен упереться в «жди 20 минут».
    if (lives.lives <= 0 && !free) return null;
    if (swapCount > 0 && !onSwap(swapCount)) return null;
    // Прямо из нажатия: иначе iOS в Telegram не даст Грому говорить.
    unlockVoice();
    setAttempt((a) => a + 1);
    setError(null);
    onStart();
    const m = make();
    mission.current = m;
    exercise.current = level.exercises[0];
    credit.current = 0;
    phaseRef.current = 0;
    restRef.current = null;
    setRest(null);
    repsBy.current = {};
    comboRef.current = NO_COMBO;
    setCombo(NO_COMBO);
    setHit(0);
    setShout(null);
    camera.setFlame(0);
    setView(m.view(0));
    return m;
  };

  /** Засчитать повтор: от камеры или от кнопки «считаю сам». */
  const countRep = (m: Mission, now: number) => {
    const before = m.view(now).reps;
    m.rep(now);
    if (m.view(now).reps > before) {
      repsBy.current[exercise.current] = (repsBy.current[exercise.current] ?? 0) + 1;
      onHit(now);
      trackFirstRep();
    }
  };

  /** Кадр боя: отсчёт на позицию, время, смена упражнения, итог. false — бой закончен. */
  const frame = (m: Mission, now: number, prepUntil: number, paint: { last: number }): boolean => {
    if (!m.started) {
      const left = Math.ceil((prepUntil - now) / 1000);
      setCountdown(left);
      if (left > 0) return true;
      m.start(now);
      // Медленные повторы калибровки — уже часть боя.
      const n = credit.current;
      credit.current = 0;
      for (let k = 0; k < n; k++) countRep(m, now);
      if (n > 0) setShout({ text: t('+{0} за калибровку', { 0: n }), key: now });
    }
    const r = restRef.current;
    if (r) {
      if (!r.resumeAt) {
        setRestS(Math.floor((now - r.from) / 1000));
        return true;
      }
      const left = Math.ceil((r.resumeAt - now) / 1000);
      setCountdown(left);
      if (left > 0) return true;
      // Перерыв кончился: часы боя идут дальше, счёт нового упражнения с нуля.
      restRef.current = null;
      setRest(null);
      m.resume(now);
      exercise.current = m.exercise;
      if (!manualRef.current) camera.switchExercise(m.exercise);
    }
    m.tick(now);
    // Пауза затянулась — серия кончилась, огонь гаснет.
    if (comboRef.current.n && !comboLive(comboRef.current, now)) {
      comboRef.current = { ...comboRef.current, n: 0 };
      setCombo(comboRef.current);
      camera.setFlame(0);
    }
    const v = m.view(now);
    // Упражнение босса сделано, а бой идёт дальше: перерыв до «Продолжить».
    if (v.outcome === 'running' && m.phaseIndex > phaseRef.current) {
      const done = level.exercises[phaseRef.current];
      phaseRef.current = m.phaseIndex;
      m.pause(now);
      restRef.current = { from: now, resumeAt: 0, done, step: m.phaseIndex };
      setRest({ done, step: m.phaseIndex, going: false });
      setRestS(0);
      setView(m.view(now));
      // Серия обрывается на перерыве: огонь гаснет, комбо с нуля.
      comboRef.current = { ...comboRef.current, n: 0 };
      setCombo(comboRef.current);
      setShout(null);
      camera.setFlame(0);
      sfx('coin');
      return true;
    }
    if (v.exercise !== exercise.current) {
      exercise.current = v.exercise;
      if (!manualRef.current) camera.switchExercise(v.exercise);
    }
    if (v.outcome !== 'running') {
      finish(m, now);
      return false;
    }
    // Сцену перерисовываем не чаще 8 раз в секунду, кроме моментов повтора.
    if (now - paint.last > 125) {
      paint.last = now;
      setView(v);
      setElapsedShare(1 - v.leftMs / (level.seconds * 1000));
    }
    return true;
  };

  /** Без камеры: игрок жмёт кнопку после каждого повтора. */
  const startManual = () => {
    // Камера ещё грузится: эту попытку отменяем, жизнь за неё уже списана при старте — новую не берём.
    const loading = status === 'loading';
    if (loading) camera.stop();
    const m = loading ? mission.current : begin();
    if (!m) return;
    camera.stop();
    track('manual_start', level.id);
    manualRef.current = true;
    setManual(true);
    lastTap.current = 0;
    const prepUntil = performance.now() + MANUAL_PREP_S * 1000;
    const paint = { last: 0 };
    setCountdown(MANUAL_PREP_S);
    setStatus('running');
    stopManual();
    manualTimer.current = setInterval(() => {
      if (!frame(m, performance.now(), prepUntil, paint)) stopManual();
    }, 100);
  };

  const tap = () => {
    const now = performance.now();
    if (!manualRef.current || !mission.current.started || now - lastTap.current < MANUAL_MIN_GAP_MS) return;
    lastTap.current = now;
    countRep(mission.current, now);
    setView(mission.current.view(now));
  };

  const start = async () => {
    const m = begin();
    if (!m) return;
    manualRef.current = false;
    setManual(false);
    setStatus('loading');
    const paint = { last: 0 };
    let firstFrame = 0;
    let calibrated = false;
    setCountdown(PREP_S);
    try {
      await camera.start(
        level.exercises[0],
        () => {
          if (manualRef.current) return;
          countRep(m, performance.now());
          paint.last = 0;
        },
        () => {
          // Пока камера грузилась, игрок перешёл на «считаю сам»: камера больше не нужна.
          if (manualRef.current) return false;
          const now = performance.now();
          // Несколько секунд на то, чтобы встать в позицию: время и повторы ещё не идут.
          firstFrame ||= now;
          return frame(m, now, firstFrame + (calibrated ? CALIB_PREP_S : PREP_S) * 1000, paint);
        },
        // Перед первым подходом упражнения подстраиваем счёт под амплитуду игрока.
        // С первого экрана — без калибровки: первый повтор должен засчитаться как можно скорее.
        // Перед стартом — кнопка «Начать»: игрок видит себя и встаёт, когда готов (с первого экрана — сразу).
        {
          calibrate: needsCalibration(level.exercises[0]) && !autoStart,
          gate: !autoStart,
          onCalibrated: (n) => {
            calibrated = true;
            credit.current = n;
          },
        },
      );
      if (manualRef.current) return camera.stop();
      setStatus('running');
    } catch (e) {
      camera.stop();
      if (manualRef.current) return;
      setError(e instanceof Error ? e.message : t('не загрузилась модель распознавания'));
      setStatus('error');
    }
  };

  // С первого экрана камера включается сама: игрок уже видел, как поставить телефон.
  // Один раз: в режиме разработки React вызывает эффект дважды, и второй запуск камеры обрывал первый.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    // Первый бой новичка — без разминки, и в этот день её уже не предлагаем: сначала пусть втянется.
    markWarmup();
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** «Продолжить» после перерыва: 5 секунд, чтобы встать в позицию, потом часы боя идут. */
  const resumeRest = () => {
    const r = restRef.current;
    if (!r || r.resumeAt) return;
    r.resumeAt = performance.now() + (manualRef.current ? MANUAL_PREP_S : PREP_S) * 1000;
    setCountdown(manualRef.current ? MANUAL_PREP_S : PREP_S);
    setRest((x) => (x ? { ...x, going: true } : x));
  };

  const surrender = () => {
    camera.stop();
    stopManual();
    const m = mission.current;
    // Сдался до старта отсчёта — попытка не считается.
    if (!m.started) return setStatus('ready');
    const v = m.view(performance.now());
    onActivity(level.exercises.length === 1 ? level.exercises[0] : null, v.reps, manualRef.current);
    onLose();
    setStatus('lost');
  };
  // Задание дня жизнь не тратит и доступно всегда.
  const noLives = lives.lives <= 0 && !free;
  const waitMin = Math.max(1, Math.ceil(lives.nextMs / 60000));

  const busy = status === 'loading' || status === 'running';
  const sport = settings.style === 'sport';
  const tag = sport ? t('Уровень {0}', { 0: level.id }) : level.world === 3 ? t('Финал') : t('{0} · {1} · уровень {2}', { 0: WORLD_NAMES[land.world], 1: land.name, 2: level.num });

  return (
    <>
      <div className="arena mission" ref={arenaRef}>
        {sport ? (
          <SportStage
            exercise={view.exercise}
            reps={view.reps}
            target={mission.current.target}
            share={view.progress}
            leftMs={view.leftMs}
            totalMs={level.seconds * 1000}
            live={status === 'running'}
            steps={view.steps}
            calm={settings.lowPower}
          />
        ) : (
        <MissionScene3D
          level={level}
          land={land}
          view={view}
          live={status === 'running'}
          elapsedShare={elapsedShare}
          hero={item.hero}
          heroTint={item.tint}
          heroGlow={item.glow}
          heroSkin={outfitSkin(item)}
          heroHands={heroHands(progress)}
          pet={petLook(progress, Date.now())}
        />
        )}
        <div className={`mhud ${busy && !sport && !waiting ? '' : 'hidden'}`}>
          <div className="mhud-row">
            <span className="mhud-ex">{EXERCISE_LABELS[view.exercise]}</span>
            {level.type === 'boss' && (
              <span className="hearts">
                {Array.from({ length: combat.hearts }, (_, k) => k + 1).map((i) => (
                  <span key={i} className={i <= (view.hearts ?? 3) ? 'on' : ''}>
                    ♥
                  </span>
                ))}
              </span>
            )}
            <span className="timer">{Math.ceil(view.leftMs / 1000)}</span>
          </div>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${Math.min(1, level.type === 'boss' ? 1 - view.progress : view.progress) * 100}%`, background: level.type === 'boss' ? land.boss.color : land.accent }} />
          </div>
          <div className="mhud-label">
            {level.type === 'boss' ? `${land.boss.name} · ${view.hp} HP · ${view.label}` : level.type === 'chase' ? t('{0} · отрыв {1}%', { 0: view.label, 1: Math.round((view.gap ?? 1) * 100) }) : view.label}
          </div>
        </div>
        {/* Удар: вспышка по краям экрана, ярче с ростом комбо. */}
        {status === 'running' && hit > 0 && <div key={`hit${hit}`} className={`hit-flash t${comboTier(combo.n)}`} />}
        {status === 'running' && combo.n >= 3 && (
          <div key={`c${combo.n}`} className={`combo-badge t${comboTier(combo.n)}`}>
            ×{combo.n}
            <small>{t('комбо')}</small>
          </div>
        )}
        {status === 'running' && shout && (
          <div key={shout.key} className="combo-shout">
            {shout.text}
          </div>
        )}
        {/* Урон каждого повтора всплывает над сценой. */}
        {status === 'running' && view.reps > 0 && view.damage > 0 && (
          <div key={view.reps} className="dmg-pop">
            −{view.damage}
          </div>
        )}

        {waiting && (
          <StartGate
            title={`${sport ? SPORT_NAMES[level.type] : level.title} · ${level.exercises.map((e) => EXERCISE_LABELS[e]).join(' → ')}`}
            hint={camera.hint}
            onGo={camera.go}
          />
        )}
        {status === 'running' && rest && !rest.going && (
          <RestBreak
            done={EXERCISE_LABELS[rest.done]}
            next={EXERCISE_LABELS[level.exercises[rest.step]]}
            nextGoal={mission.current.phaseTarget(rest.step)}
            step={rest.step}
            steps={level.exercises.length}
            seconds={restS}
            onGo={resumeRest}
          />
        )}
        {calibrating && <CalibrationOverlay exercise={level.exercises[0]} view={camera.calib!} onSkip={camera.skipCalib} />}
        {status === 'running' && countdown > 0 && !calibrating && !waiting && !(rest && !rest.going) && (
          <div className="countdown">
            <div className="countdown-num">{countdown}</div>
            <div>{rest ? t('Дальше: {0}', { 0: EXERCISE_LABELS[level.exercises[rest.step]] }) : t('Займи позицию')}</div>
          </div>
        )}
        {status === 'story' && <Dialog lines={level.story} onDone={() => setStatus('ready')} />}
        {status === 'won' && epilogue && <Dialog lines={bossDefeat(level.land)} onDone={() => setEpilogue(false)} />}
        {status === 'ready' && (
          <div className="result">
            <div className="level-tag">{tag}</div>
            <div className="result-title small">{sport ? SPORT_NAMES[level.type] : level.title}</div>
            <div className="muted light">
              {!sport && <>{TYPE_NAMES[level.type]} · </>} {level.exercises.map((e) => EXERCISE_LABELS[e]).join(' → ')}
              {level.type !== 'trial' && t(' · цель {0}', { 0: mission.current.target })}
              {level.rest && t(' · лёгкий день')}
            </div>
            {level.type !== 'trial' && !sport && (
              <div className="power-line">
                <span>
                  <Swords size={14} /> {t('урон {0}', { 0: view.damage })}
                </span>
                <span>
                  <Heart size={13} className="heart" /> {level.type === 'boss' ? `${land.boss.name}: ` : t('враги: ')}
                  {view.hpMax} HP
                </span>
                {progress.might && <span className="might">{t('эликсир силы +30%')}</span>}
                {power.pet > 0 && <span>{t('питомец +{0}%', { 0: (Math.round(power.pet * 1000) / 10).toLocaleString(locale()) })}</span>}
              </div>
            )}
            {canSwap && !noLives && (
              <SwapRow
                original={original.exercises}
                exercises={exercises}
                picking={picking}
                // Сколько ещё замен можно сделать на этом уровне сверх уже выбранных.
                free={swaps.left + swaps.paid - swapCount}
                onPick={setPicking}
                onChoose={choose}
              />
            )}
            {noLives ? <Remark line={restLine(waitMin)} /> : settings.guide && <CameraGuide exercise={level.exercises[0]} model={item.hero} />}
          </div>
        )}
        {status === 'won' && result && !epilogue && (
          <div className="result">
            <div className="result-title">{t('Победа!')}</div>
            <Stars n={result.stars} />
            <div className="muted light">
              {t('{0} повторов · +{1} монет', { 0: view.reps, 1: result.reward.coins })}
              {view.record != null && t(' · рекорд {0}', { 0: view.record })}
              {combo.best >= 3 && t(' · лучшее комбо ×{0}', { 0: combo.best })}
            </div>
            {result.reward.petFind && (
              <div className="muted light">
                {t('{0} нашёл сундучок: +{1} монет', { 0: petLook(progress, Date.now())?.name ?? t('Питомец'), 1: result.reward.petFind.coins })}
                {result.reward.petFind.potion && t(' и {0}', { 0: potionById(result.reward.petFind.potion).name.toLowerCase() })}
              </div>
            )}
            {result.reward.drop && (
              <div className="drop">
                <img src={gearIcon(result.reward.drop.id)} alt="" />
                <div>
                  <div className="drop-title">{t('Трофей: {0}', { 0: result.reward.drop.name })}</div>
                  <div className="muted">{t('{0} · уже в инвентаре', { 0: gearText(result.reward.drop) })}</div>
                </div>
              </div>
            )}
            {!sport && <Remark line={afterLine(level.world, true, level.id + attempt)} />}
          </div>
        )}
        {status === 'lost' && (
          <div className="result">
            <div className="result-title">{t('Не вышло')}</div>
            <div className="muted light">{level.type === 'chase' ? t('Чудище догнало. Держи темп ровнее!') : t('Не хватило совсем чуть-чуть.')}</div>
            {!free && (
              <div className="life-lost">
                {t('−1 ♥ · осталось {0} из {1}', { 0: lives.lives, 1: lives.max })}
              </div>
            )}
            {(!sport || noLives) && <Remark line={noLives ? restLine(waitMin) : afterLine(level.world, false, level.id + attempt)} />}
          </div>
        )}

        {status === 'running' && manual && !rest && (
          <button className="manual-tap" onPointerDown={tap} disabled={countdown > 0 || !!rest}>
            <b>+1</b>
            <small>{t('жми после каждого повтора')}</small>
          </button>
        )}
        <div className={`pip ${camera.active ? '' : 'hidden'} ${waiting ? 'big' : ''}`}>
          <video ref={camera.videoRef} playsInline muted />
          <canvas ref={camera.canvasRef} />
          <div className="pip-count">{view.reps}</div>
          {camera.angle != null && (
            <div className="pip-angle">
              {camera.angle}°{camera.limits && ` · ${camera.limits.down}/${camera.limits.up}`}
            </div>
          )}
        </div>
      </div>

      <div className="hint-line">
        {status === 'running' && manual && !rest && t('Без камеры: сделал повтор — нажми кнопку. Честно — себе же на пользу.')}
        {status === 'running' && rest && (sport ? t('Перерыв: время подхода стоит') : t('Перерыв: время боя стоит, босс ждёт'))}
        {status === 'running' && !rest && waiting && t('Нажми «Начать», когда будешь готов')}
        {status === 'running' && !manual && !rest && !waiting && (camera.hint ?? (calibrating ? t('Медленно и на всю амплитуду, как можешь') : t('Отлично, продолжай!')))}
        {status === 'ready' && level.exercises.length > 1 && t('Упражнения меняются по фазам: поставь телефон так, чтобы было видно всё тело.')}
        {status === 'error' && t('Не удалось запустить камеру: {0}. Можно считать повторы самому.', { 0: error })}
      </div>
      {status === 'running' && (
        <button className="secondary" onClick={surrender}>
          {t('Остановиться')}
        </button>
      )}
      {status === 'won' && result && !epilogue && !level.daily && (
        <WinPost
          title={sport ? SPORT_NAMES[level.type] : level.title}
          levelNum={level.id}
          reps={view.reps}
          starsN={result.stars}
          boss={level.type === 'boss' && !sport ? { name: LANDS[level.land].boss.name, card: () => makeShareCard(bossCard(level, progress, view.reps, result.stars)) } : undefined}
        />
      )}
      {status === 'won' && result && !epilogue && level.type === 'boss' && !sport && <ShareVictory card={() => bossCard(level, progress, view.reps, result.stars)} />}
      {status === 'won' && result && !epilogue && (invite ? <InviteOffer progress={progress} today={dayKey(Date.now())} /> : channelOffer ? <ChannelOffer place="win" /> : <HomeShortcutOffer />)}
      {status === 'won' && onNext && (
        <button className="primary" onClick={onNext}>
          {t('Дальше')}
        </button>
      )}
      {(status === 'ready' || status === 'lost' || status === 'error') &&
        (noLives ? (
          <button className="primary" disabled>
            <Heart /> {t('через {0} мин', { 0: waitMin })}
          </button>
        ) : (
          <button className="primary" onClick={() => withWarmup(manual && status === 'lost' ? startManual : () => void start())}>
            {status === 'ready' ? t('Начать') : t('Ещё раз')}
            {!free && (
              <span className="btn-cost">
                <Heart size={14} /> {lives.lives}
              </span>
            )}
          </button>
        ))}
      {status === 'error' && !noLives && (
        <button className="secondary" onClick={startManual}>
          {t('Считать самому')}
        </button>
      )}
      {status === 'loading' && slow && (
        <button className="secondary" onClick={startManual}>
          {t('Долго грузится? Считать самому')}
        </button>
      )}
      {status === 'lost' && !manual && !noLives && (
        <button className="link" onClick={startManual}>
          {t('Камера сбивается? Считать самому')}
        </button>
      )}
      {status === 'ready' && !noLives && (
        <button className="link" onClick={startManual}>
          {t('Нет камеры или неудобно? Считать самому')}
        </button>
      )}
      {status === 'loading' && (
        <button className="primary" disabled>
          {t('Загружаю камеру…')}
        </button>
      )}
      {!busy && (
        <button className="link" onClick={onExit}>
          {sport ? t('К уровням') : t('К карте')}
        </button>
      )}
    </>
  );
}

function SwapRow({ original, exercises, picking, free, onPick, onChoose }: { original: RepExercise[]; exercises: RepExercise[]; picking: number | null; free: number; onPick: (slot: number | null) => void; onChoose: (slot: number, ex: RepExercise) => void }) {
  return (
    <div className="swap">
      <div className="swap-row">
        {exercises.map((ex, i) => {
          const changed = ex !== original[i];
          const locked = !changed && free <= 0;
          return (
            <button key={i} className={`swap-chip ${changed ? 'changed' : ''} ${picking === i ? 'on' : ''}`} disabled={locked} onClick={() => onPick(picking === i ? null : i)}>
              {EXERCISE_LABELS[ex]} ⇄
            </button>
          );
        })}
      </div>
      {picking != null && (
        <div className="swap-pick">
          <span>{t('Заменить на')}</span>
          {ALL.filter((e) => e !== exercises[picking]).map((e) => (
            <button key={e} className="swap-chip" onClick={() => onChoose(picking, e)}>
              {e === original[picking] ? t('{0} (как было)', { 0: EXERCISE_LABELS[e] }) : EXERCISE_LABELS[e]}
            </button>
          ))}
        </div>
      )}
      <div className="swap-note">
        {free > 0 ? t('Негде сделать? Замени упражнение · осталось {0} из {1} на сегодня', { 0: free, 1: SWAPS_PER_DAY }) : t('Замены на сегодня закончились, завтра будет ещё {0}', { 0: SWAPS_PER_DAY })}
      </div>
    </div>
  );
}
