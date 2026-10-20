import { lazy, ReactNode, Suspense, useEffect, useRef, useState } from 'react';
import { track } from '../telemetry';
import { amountText, EXERCISE_LABELS, Exercise } from '../repCounter';
import { Portrait } from './Dialog';
import { GearFace, HeroHome, ShopTab } from './HeroHome';
import { GEAR, gearById, gearText, ITEMS, itemById, POTIONS, Rarity, RARITY_COLORS, RARITY_NAMES, RARITY_ORDER, RARITY_SHORT } from './items';
import { LANDS, WORLD_NAMES, WORLDS } from './lands';
import { LEVEL_COUNT, LEVELS, LevelDef, targetReps, WORLD_SIZE } from './levels';
import { Stars } from './Stars';
import { NPCS } from './npcs';
import { dailyTask } from './daily';
import { startCloud, usePro } from '../cloud';
import { recordEventHit } from './event';
import { Calendar, RepsChart } from './Stats';
import { AchievementsSheet } from './Achievements';
import { newAchievements } from './achievements';
import { canHatch, hatchEgg, petLevel, petLook, petName, petXp } from './pets';
import { plankDailyWorkout } from './ProgramsEntry';
import type { QuickWorkout } from './Programs';
import {
  buy,
  buyGear,
  buyPotion,
  equipGear,
  resetProgress,
  usePotion,
  claimChest,
  claimDaily,
  claimAchievement,
  markAchSeen,
  setTitle,
  finishOnboarding,
  dailyProgress,
  claimHeroLevels,
  currentLevel,
  dayKey,
  equip,
  isUnlocked,
  livesNow,
  loadProgress,
  Progress,
  addClanPending,
  recordActivity,
  recordLoss,
  recordWin,
  spendMight,
  REST_PER_WEEK,
  spendLife,
  spendSwaps,
  streak,
  swapsLeft,
  saveProgress,
} from './progress';
import { Coin, Flask, Heart, Lock, Swords } from '../icons';
import { heroHands, heroPower } from './power';
import { sfx, useMusic } from '../audio';
import { missionTheme, worldTheme } from '../music';

// Тяжёлые экраны (3D, камера, клан) грузятся, только когда их открыли: первый экран появляется быстрее.
const MissionPlay = lazy(() => import('./MissionPlay').then((m) => ({ default: m.MissionPlay })));
const EventScreen = lazy(() => import('./EventScreen').then((m) => ({ default: m.EventScreen })));
const ProgramsScreen = lazy(() => import('./Programs').then((m) => ({ default: m.ProgramsScreen })));
const GymScreen = lazy(() => import('../gym/GymScreen').then((m) => ({ default: m.GymScreen })));
const ClanScreen = lazy(() => import('../clan/ClanScreen').then((m) => ({ default: m.ClanScreen })));
const PassScreen = lazy(() => import('./PassScreen').then((m) => ({ default: m.PassScreen })));
const PetScreen = lazy(() => import('./PetScreen').then((m) => ({ default: m.PetScreen })));
const DungeonScreen = lazy(() => import('./match3/DungeonScreen').then((m) => ({ default: m.DungeonScreen })));
const PetHatch = lazy(() => import('./PetScreen').then((m) => ({ default: m.PetHatch })));
const Onboarding = lazy(() => import('./Onboarding').then((m) => ({ default: m.Onboarding })));
const SettingsSheet = lazy(() => import('../SettingsSheet').then((m) => ({ default: m.SettingsSheet })));
const WorldMap3D = lazy(() => import('./WorldMap3D').then((m) => ({ default: m.WorldMap3D })));
const VillageScreen = lazy(() => import('../village/VillageScreen').then((m) => ({ default: m.VillageScreen })));

/** Пока экран докачивается. */
const Loading = () => <div className="lazy-loading muted">Загружаем…</div>;
const Screen = ({ children }: { children: ReactNode }) => <Suspense fallback={<Loading />}>{children}</Suspense>;

// Три мира по 100 уровней и финал. Вкладка «Замок» открывается после третьего мира.
const TABS = [...WORLDS, 'castle'] as const;
// На вкладках карты короткие названия, чтобы все четыре мира помещались в строку.
const SHORT_WORLD: Record<(typeof TABS)[number], string> = { fantasy: 'Королевство', space: 'Космос', zombie: 'Зомби', castle: 'Замок' };
const levelsOf = (w: number) => (w === 3 ? LEVELS.slice(WORLD_SIZE * 3) : LEVELS.slice(w * WORLD_SIZE, (w + 1) * WORLD_SIZE));

const EXERCISES: Exercise[] = ['squat', 'pushup', 'situp', 'plank'];
const fmtMin = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

export type AdventureTab = 'hero' | 'map' | 'clan' | 'village';

interface Props {
  tab: AdventureTab;
  onTab: (tab: AdventureTab) => void;
  // Во время миссии нижнее меню прячется.
  onPlaying: (playing: boolean) => void;
  // Друзья с главного экрана: они живут во вкладке дуэли.
  onFriends: () => void;
}

export function Adventure({ tab, onTab, onPlaying, onFriends }: Props) {
  const [progress, setProgressState] = useState(loadProgress);
  // Последний прогресс: победа и запись подхода приходят подряд в одном кадре.
  const latest = useRef(progress);
  const setProgress = (p: Progress) => {
    latest.current = p;
    setProgressState(p);
  };
  const update = (fn: (p: Progress) => Progress) => setProgress(fn(latest.current));
  const now = Date.now();
  const lives = livesNow(progress, now);
  const [strength, setStrength] = useState(false);
  const daily = dailyTask(dayKey(now), progress.baseline);
  // Прогресс с сервера: на новом телефоне герой подтягивается сам.
  useEffect(() => {
    void startCloud((p) => setProgress(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const current = currentLevel(progress, LEVEL_COUNT);
  const currentDef = LEVELS[current - 1];
  const [world, setWorld] = useState(currentDef.world);
  const [playing, setPlayingState] = useState<LevelDef | null>(null);
  const setPlaying = (l: LevelDef | null) => {
    setPlayingState(l);
    onPlaying(!!l);
  };
  const [selected, setSelected] = useState<LevelDef | null>(null);
  const [shop, setShop] = useState<ShopTab | null>(null);
  const [settings, setSettings] = useState(false);
  const [replayOnb, setReplayOnb] = useState(false);
  const [achOpen, setAchOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const [eventOpen, setEventOpenState] = useState(false);
  const [petsOpen, setPetsOpen] = useState(false);
  // «Позже» на яйце: спросим снова при следующем запуске.
  const [eggLater, setEggLater] = useState(false);
  const setEventOpen = (open: boolean) => {
    setEventOpenState(open);
    onPlaying(open);
  };
  // Программы тренировок: экран на весь экран, как событие; quick — разовая тренировка (планка, задание дня).
  const [programs, setProgramsState] = useState<{ quick?: QuickWorkout } | null>(null);
  const setPrograms = (v: { quick?: QuickWorkout } | null) => {
    setProgramsState(v);
    onPlaying(!!v);
  };
  // Дневник зала: на весь экран, без нижнего меню.
  const [gym, setGymState] = useState(false);
  const setGym = (open: boolean) => {
    setGymState(open);
    onPlaying(open);
  };
  // Подземелье «три в ряд»: на весь экран, без нижнего меню.
  const [dungeon, setDungeonState] = useState(false);
  const setDungeon = (open: boolean) => {
    setDungeonState(open);
    onPlaying(open);
  };
  // Задание дня: с главного экрана и из подземелья, когда кончился заряд.
  const startDaily = () => {
    const left = Math.max(5, daily.target - dailyProgress(progress, daily));
    // Планка — на время: не миссия, а подходы с отдыхом.
    if (daily.exercise === 'plank') return setPrograms({ quick: plankDailyWorkout(Math.max(10, left), progress.baseline.plank ?? 30, daily.ask) });
    // Миссия на месте текущего уровня: та же земля и декорации, но цель — остаток задания.
    setPlaying({ ...currentDef, daily: true, type: 'build', title: `Задание: ${NPCS[daily.npc].name}`, exercises: [daily.exercise], load: left / progress.baseline[daily.exercise], seconds: Math.max(120, left * 5), rest: false, story: [], coins: 0 });
  };
  const pro = usePro();
  const [achToast, setAchToast] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const levels = levelsOf(world);
  const startIndex = () => Math.max(0, levels.findIndex((l) => l.id === current));
  const focus = useRef(startIndex());
  const [focusLand, setFocusLand] = useState(levels[startIndex()].land);
  const drag = useRef<{ y: number; moved: number } | null>(null);
  const item = itemById(progress.equipped);
  useMusic(playing ? missionTheme(playing.world, playing.type === 'boss') : tab === 'map' ? worldTheme(world) : 'calm');

  const showToast = (text: string) => {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), 2600);
  };

  // Новый уровень героя: монеты и сообщение, как только миссия закончилась.
  const [levelUp, setLevelUp] = useState<string | null>(null);
  useEffect(() => {
    if (playing || programs) return;
    const r = claimHeroLevels(latest.current);
    if (!r) return;
    setProgress(r.progress);
    sfx('levelup');
    setLevelUp(`Новый уровень героя: ${r.levels[r.levels.length - 1]}! +${r.coins} монет`);
    setTimeout(() => setLevelUp(null), 3500);
  }, [playing, programs, progress.days]);

  // Питомец подрос: сообщение после тренировки.
  const petLvl = progress.pets?.active ? petLevel(petXp(progress, progress.pets.active)).level : 0;
  const petSeen = useRef(petLvl);
  useEffect(() => {
    if (playing) return;
    const id = latest.current.pets?.active;
    if (id && petSeen.current && petLvl > petSeen.current) showToast(`${petName(latest.current, id)} подрос: уровень ${petLvl}!`);
    petSeen.current = petLvl;
  }, [playing, petLvl]);

  // Новое достижение: короткое сообщение после миссии, награда ждёт в «Достижениях».
  useEffect(() => {
    if (playing || programs || dungeon) return;
    const fresh = newAchievements(latest.current, Date.now());
    if (!fresh.length) return;
    setProgress(markAchSeen(latest.current, fresh.map((a) => a.id)));
    setAchToast(fresh.length > 1 ? `Новые достижения: ${fresh.map((a) => a.title).join(', ')}` : `Новое достижение: ${fresh[0].title}! Забери награду`);
    setTimeout(() => setAchToast(null), 4000);
  }, [playing, programs, dungeon, progress.days, progress.dailyCount, progress.raidClaimed?.length, progress.programs?.done.length, progress.dungeon?.wins]);

  const switchWorld = (w: number) => {
    setWorld(w);
    setSelected(null);
    const ls = levelsOf(w);
    const i = Math.max(0, ls.findIndex((l) => l.id === current));
    focus.current = i;
    setFocusLand(ls[i].land);
  };

  if (playing)
    return (
      <Screen>
        <MissionPlay
          key={playing.daily ? 'daily' : playing.id}
          level={playing}
          progress={progress}
          onExit={() => setPlaying(null)}
          onWin={(stars, record) => {
            track('mission_win', playing.daily ? 'daily' : playing.id);
            if (playing.daily) return { coins: 0, firstTime: false };
            const r = recordWin(latest.current, playing, stars, record);
            setProgress(r.progress);
            return r.reward;
          }}
          onLose={() => {
            track('mission_lose', playing.daily ? 'daily' : playing.id);
            if (!playing.daily) update((p) => recordLoss(spendLife(p, Date.now()), playing));
          }}
          onStart={() => {
            track('mission_start', playing.daily ? 'daily' : playing.id);
            update(spendMight);
          }}
          onActivity={(ex, reps) => update((p) => addClanPending(recordActivity(p, ex, reps, Date.now()), reps, Date.now()))}
          lives={lives}
          swaps={playing.daily ? { left: 0, paid: 0 } : swapsLeft(progress, playing.id, Date.now())}
          onSwap={(count) => {
            const next = spendSwaps(latest.current, playing.id, count, Date.now());
            if (next) update(() => next);
            return next != null;
          }}
          onNext={!playing.daily && playing.id < LEVEL_COUNT ? () => setPlaying(LEVELS[playing.id]) : undefined}
        />
      </Screen>
    );

  if (eventOpen)
    return (
      <Screen>
        <EventScreen
          progress={progress}
          onStart={() => {
            track('event_start');
            update(spendMight);
          }}
          onFinish={(dealt, reps, ex) => {
            const now = Date.now();
            update((p) => addClanPending(recordActivity(p, ex, reps, now), reps, now));
            const r = recordEventHit(latest.current, dealt, now);
            if (!r) return null;
            setProgress(r.progress);
            if (r.killed) sfx('chest');
            return r;
          }}
          onClose={() => setEventOpen(false)}
        />
      </Screen>
    );

  if (dungeon)
    return (
      <Screen>
        <DungeonScreen
          progress={progress}
          setProgress={setProgress}
          onClose={() => setDungeon(false)}
          onTrain={() => {
            setDungeonState(false);
            setPlaying(currentDef);
          }}
          onDaily={() => {
            setDungeonState(false);
            startDaily();
          }}
          onPrograms={() => {
            setDungeonState(false);
            setPrograms({});
          }}
        />
      </Screen>
    );

  if (gym) return <Screen><GymScreen progress={progress} update={update} onClose={() => setGym(false)} /></Screen>;

  if (programs) return <Screen><ProgramsScreen progress={progress} update={update} model={item.hero} quick={programs.quick} onClose={() => setPrograms(null)} /></Screen>;

  const newcomer = !progress.onboarded && !Object.keys(progress.stars).length && !Object.keys(progress.days).length;
  // Листы докачиваются тихо, поверх уже видного экрана.
  const sheets = (
    <Suspense fallback={null}>
      {(newcomer || replayOnb) && (
        <Onboarding
          replay={replayOnb}
          onDone={(start) => {
            // Повтор из настроек только показывает знакомство: испытание уже пройдено.
            if (replayOnb) return setReplayOnb(false);
            setProgress(finishOnboarding(latest.current));
            if (start) setPlaying(LEVELS[0]);
          }}
        />
      )}
      {achOpen && (
        <AchievementsSheet
          progress={progress}
          now={now}
          onClaim={(a) => {
            const next = claimAchievement(latest.current, a.id, a.coins);
            if (next) setProgress(next);
          }}
          onTitle={(id) => setProgress(setTitle(latest.current, id))}
          onClose={() => setAchOpen(false)}
        />
      )}
      {achToast && (
        <button className="toast global ach-toast" onClick={() => setAchOpen(true)}>
          {achToast}
        </button>
      )}
      {passOpen && <PassScreen progress={progress} setProgress={setProgress} pro={pro} land={currentDef.land} onClose={() => setPassOpen(false)} />}
      {petsOpen && <PetScreen progress={progress} setProgress={setProgress} onClose={() => setPetsOpen(false)} />}
      {tab === 'hero' && !newcomer && !eggLater && canHatch(progress) && (
        <PetHatch
          onDone={(name) => {
            setProgress(saveProgress(hatchEgg(latest.current, name)));
            setPetsOpen(true);
          }}
          onLater={() => setEggLater(true)}
        />
      )}
      {strength && <StrengthSheet progress={progress} now={now} onClose={() => setStrength(false)} />}
      {shop && <Shop progress={progress} setProgress={setProgress} tab={shop} setTab={setShop} reachedLand={currentDef.land} onClose={() => setShop(null)} />}
      {settings && <SettingsSheet
          progress={progress}
          onReset={() => setProgress(resetProgress())}
          onIntro={() => {
            setSettings(false);
            setReplayOnb(true);
          }}
          onClose={() => setSettings(false)}
        />}
      {levelUp && <div className="toast global">{levelUp}</div>}
      {toast && tab === 'hero' && <div className="toast global">{toast}</div>}
    </Suspense>
  );

  if (tab === 'clan')
    return (
      <>
        <Screen>
          <ClanScreen progress={progress} setProgress={setProgress} onPlaying={onPlaying} landNow={currentDef.land} onSpendMight={() => update(spendMight)} />
        </Screen>
        {sheets}
      </>
    );

  if (tab === 'village')
    return (
      <>
        <Screen>
          <VillageScreen progress={progress} setProgress={setProgress} onPlaying={onPlaying} onDungeon={() => setDungeon(true)} />
        </Screen>
        {sheets}
      </>
    );

  if (tab === 'hero')
    return (
      <>
        <HeroHome
          progress={progress}
          lives={<LivesPill progress={progress} />}
          current={currentDef}
          onTrain={() => setPlaying(currentDef)}
          daily={daily}
          dailyDone={dailyProgress(progress, daily)}
          onDaily={startDaily}
          onClaimDaily={() => {
            const next = claimDaily(progress, daily);
            if (!next) return;
            setProgress(next);
            sfx('coin');
            showToast(`Задание выполнено! +${daily.coins} монет${daily.potion ? ' и зелье' : ''}`);
          }}
          onFriends={onFriends}
          onShop={(t) => setShop(t ?? 'weapon')}
          onStrength={() => setStrength(true)}
          onEquip={(id) => setProgress(equip(progress, id))}
          onEquipGear={(id) => setProgress(equipGear(progress, id))}
          onPotion={(id) => {
            const next = usePotion(progress, id, Date.now());
            if (!next) return showToast(id === 'vigor' ? 'Жизни и так полные.' : 'Сейчас не нужно.');
            setProgress(next);
            showToast(id === 'vigor' ? '+1 жизнь!' : id === 'might' ? 'Эликсир выпит: +30% урона в следующем бою.' : 'Ещё одна замена упражнения на сегодня.');
          }}
          onSettings={() => setSettings(true)}
          onAchievements={() => setAchOpen(true)}
          pro={pro}
          onPass={() => setPassOpen(true)}
          onEvent={() => setEventOpen(true)}
          onPets={() => setPetsOpen(true)}
          onPrograms={() => setPrograms({})}
          onGym={() => setGym(true)}
          onDungeon={() => setDungeon(true)}
        />
        {sheets}
      </>
    );

  // Тап по объекту на карте не должен срабатывать после перетаскивания.
  const tap = (fn: () => void) => () => {
    if ((drag.current?.moved ?? 0) < 8) fn();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, moved: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || e.buttons === 0) return;
    const dy = e.clientY - drag.current.y;
    drag.current.y = e.clientY;
    drag.current.moved += Math.abs(dy);
    focus.current = Math.max(0, Math.min(levels.length - 1, focus.current + dy / 45));
    const land = levels[Math.round(focus.current)].land;
    if (land !== focusLand) setFocusLand(land);
  };

  const L = LANDS[focusLand];
  const worldOpen = (w: number) => isUnlocked(progress, levelsOf(w)[0].id);
  const series = streak(progress.days, now);

  // Карта на весь экран: листается только сама сцена, страница и Telegram не двигаются.
  return (
    <>
      <div className="map-screen">
        <div className="arena map3d" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => setTimeout(() => (drag.current = null))}>
          <Suspense fallback={null}>
            <WorldMap3D
              levels={levels}
              stars={progress.stars}
              currentId={current}
              hero={item.hero}
              heroTint={item.tint}
              heroGlow={item.glow}
              heroHands={heroHands(progress)}
              pet={petLook(progress, now)}
              focus={focus}
              focusLand={focusLand}
              openedChests={progress.chests}
              onSelect={(l) => tap(() => setSelected(l))()}
              onMerchant={tap(() => setShop('weapon'))}
              onChest={(land) =>
                tap(() => {
                  const r = claimChest(progress, land);
                  if (!r) return showToast('Этот сундук уже пуст.');
                  setProgress(r.progress);
                  sfx('chest');
                  showToast(r.itemName ? `В сундуке: ${r.itemName}!` : `В сундуке ${r.coins} монет.`);
                })()
              }
            />
          </Suspense>
          <div className="map-top">
            <div className="world-tabs">
              {TABS.map((w, i) => (
                <button key={w} className={world === i ? 'active' : ''} disabled={!worldOpen(i)} onClick={() => switchWorld(i)}>
                  {!worldOpen(i) && <Lock size={12} />}
                  {SHORT_WORLD[w]}
                </button>
              ))}
            </div>
            <div className="map-hud">
              <div className="map-title">
                <div className="map-land">{L.name}</div>
                <div className="map-sub">{L.world === 'castle' ? 'Финал' : `Хранитель: ${L.boss.name}`}</div>
              </div>
              <div className="stats">
                <LivesPill progress={progress} />
                <span className="pill">
                  <Coin className="coin" /> {progress.coins}
                </span>
              </div>
            </div>
          </div>
          {toast && <div className="toast">{toast}</div>}

          <div className="map-bottom">
            {selected ? (
              <div className="level-card">
                <button className="close-x" onClick={() => setSelected(null)} aria-label="Закрыть">
                  ×
                </button>
                <div className="level-tag">
                  {WORLD_NAMES[LANDS[selected.land].world]} · уровень {selected.num}
                </div>
                <div className="level-title">{selected.title}</div>
                <div className="muted">
                  {selected.exercises.map((e) => EXERCISE_LABELS[e]).join(' → ')}
                  {selected.type !== 'trial' && ` · цель ${targetReps(selected, progress.baseline)}`} · {selected.coins} монет
                </div>
                <Stars n={progress.stars[selected.id] ?? 0} />
                {isUnlocked(progress, selected.id) ? (
                  <button className="primary" onClick={() => setPlaying(selected)}>
                    {progress.stars[selected.id] ? 'Пройти ещё раз' : 'В путь'}
                  </button>
                ) : (
                  <div className="muted">Сначала пройди предыдущие уровни.</div>
                )}
              </div>
            ) : (
              <>
                <div className="map-help">Листай карту пальцем · нажми на камень уровня</div>
                <button className="primary daily" onClick={() => setPlaying(currentDef)}>
                  {series.today ? `Уровень ${currentDef.num}: ${currentDef.title}` : 'Тренировка дня'}
                  <small>{series.today ? `Сегодня уже ${progress.days[dayKey(now)]} повторов · серия ${series.days}` : `Уровень ${currentDef.num}: ${currentDef.title}`}</small>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {/* Листы вне карты: иначе нижнее меню перекрывает их низ вместе с кнопкой «Закрыть». */}
      {sheets}
    </>
  );
}

/** Лавка купца Фёдора: облики, оружие, щиты и зелья. Новое оружие появляется по мере продвижения. */
function Shop({ progress, setProgress, tab, setTab, reachedLand, onClose }: { progress: Progress; setProgress: (p: Progress) => void; tab: ShopTab; setTab: (t: ShopTab) => void; reachedLand: number; onClose: () => void }) {
  const price = (cost: number, buyIt: () => Progress | null) => (
    <button
      className="small-btn"
      disabled={progress.coins < cost}
      onClick={() => {
        const next = buyIt();
        if (next) setProgress(next);
        if (next) sfx('coin');
      }}
    >
      <Coin size={14} /> {cost}
    </button>
  );
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  // Товар этой вкладки: что продаётся рядом по карте и что уже есть у героя.
  const stock = GEAR.filter((g) => g.slot === tab && (g.inShop || progress.items.includes(g.id)));
  const near = stock.filter((g) => progress.items.includes(g.id) || g.minLand <= reachedLand + 6);
  const gear = near.filter((g) => rarity === 'all' || g.rarity === rarity).sort((a, b) => a.price - b.price || RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
  // Когда купец привезёт вещи выбранной редкости, которых пока не видно.
  const later = stock.filter((g) => !near.includes(g) && (rarity === 'all' || g.rarity === rarity)).sort((a, b) => a.minLand - b.minLand)[0];
  const damageNow = heroPower(progress).damage;
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
        <div className="remark">
          <Portrait line={{ face: 'fedor', color: NPCS.fedor.color, who: NPCS.fedor.name }} size={52} />
          <div>
            <div className="level-title">Купец Фёдор</div>
            <div className="muted">«Оружие бьёт сильнее, щит бережёт сердца в бою с боссом. Лучшее привожу, когда ты уходишь дальше.»</div>
          </div>
        </div>
        <div className="shop-head">
          <div className="coins">
            <Coin className="coin" /> {progress.coins}
          </div>
          <div className="muted">
            <Swords size={13} /> урон {heroPower(progress).damage}
          </div>
        </div>
        <div className="tabs">
          {SHOP_TABS.map((t) => (
            <button key={t.tab} className={tab === t.tab ? 'active' : ''} onClick={() => setTab(t.tab)}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'potion' &&
          POTIONS.map((pt) => (
            <div key={pt.id} className="shop-item">
              <Flask color={pt.color} scroll={pt.id === 'swap'} />
              <div className="shop-name">
                <div>
                  {pt.name} <span className="potion-count">×{progress.potions?.[pt.id] ?? 0}</span>
                </div>
                <div className="shop-meta muted">{pt.text}</div>
              </div>
              {price(pt.price, () => buyPotion(progress, pt.id))}
            </div>
          ))}
        {(tab === 'weapon' || tab === 'offhand') && (
          <div className="rarity-chips">
            {(['all', ...RARITY_ORDER] as const).map((r) => {
              const n = r === 'all' ? near.length : near.filter((g) => g.rarity === r).length;
              return (
                <button
                  key={r}
                  className={`rarity-chip ${rarity === r ? 'on' : ''}`}
                  style={r !== 'all' ? { ['--rc' as string]: RARITY_COLORS[r] } : undefined}
                  onClick={(e) => {
                    setRarity(r);
                    e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
                  }}
                >
                  {r !== 'all' && <i />}
                  {r === 'all' ? 'Все' : RARITY_SHORT[r]} <small>{n}</small>
                </button>
              );
            })}
          </div>
        )}
        {(tab === 'weapon' || tab === 'offhand') &&
          gear.map((g) => {
            const owned = progress.items.includes(g.id);
            const on = progress.weapon === g.id || progress.offhand === g.id;
            const locked = !owned && g.minLand > reachedLand;
            const damage = heroPower({ ...progress, [g.slot]: g.id }).damage;
            const blocked = g.slot === 'offhand' && !!gearById(progress.weapon)?.twoHanded;
            return (
              <div key={g.id} className={`shop-item gear-row ${locked ? 'locked' : ''}`} style={{ ['--rc' as string]: RARITY_COLORS[g.rarity] }}>
                <GearFace g={g} size={44} />
                <div className="shop-name">
                  <div>{g.name}</div>
                  <div className="shop-meta" style={{ color: RARITY_COLORS[g.rarity] }}>
                    {RARITY_NAMES[g.rarity]} · {gearText(g)}
                  </div>
                  {!on && damage > damageNow && (
                    <div className="shop-delta up">
                      <Swords size={11} /> урон {damageNow} → {damage}
                    </div>
                  )}
                  {!on && blocked && <div className="shop-delta">не действует с двуручным оружием</div>}
                </div>
                {owned ? (
                  <button className="small-btn" disabled={on && g.slot === 'weapon'} onClick={() => setProgress(equipGear(progress, g.id))}>
                    {on ? (g.slot === 'weapon' ? 'Надето' : 'Снять') : 'Надеть'}
                  </button>
                ) : locked ? (
                  <span className="shop-lock">
                    <Lock size={12} /> с {LANDS[g.minLand].name}
                  </span>
                ) : (
                  price(g.price, () => buyGear(progress, g.id))
                )}
              </div>
            );
          })}
        {(tab === 'weapon' || tab === 'offhand') && later && (
          <div className="shop-later muted">
            <Lock size={12} /> {gear.length ? 'Ещё товар' : 'Такого пока нет'}: Фёдор привезёт его с земли «{LANDS[later.minLand].name}».
          </div>
        )}
        {tab === 'outfit' &&
          ITEMS.filter((i) => i.inShop || progress.items.includes(i.id)).map((i) => {
            const owned = progress.items.includes(i.id);
            return (
              <div key={i.id} className="shop-item">
                <span className="swatch" style={{ background: i.color, boxShadow: i.glow ? `0 0 10px ${i.glow}` : undefined }} />
                <div className="shop-name">
                  <div>{i.name}</div>
                  <div className="shop-meta" style={{ color: RARITY_COLORS[i.rarity] }}>
                    {RARITY_NAMES[i.rarity]}
                    {i.coinBonus > 0 && ` · +${Math.round(i.coinBonus * 100)}% монет`}
                  </div>
                </div>
                {owned ? (
                  <button className="small-btn" disabled={progress.equipped === i.id} onClick={() => setProgress(equip(progress, i.id))}>
                    {progress.equipped === i.id ? 'Надето' : 'Надеть'}
                  </button>
                ) : (
                  price(i.price, () => buy(progress, i.id))
                )}
              </div>
            );
          })}
        <button className="link" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

const SHOP_TABS: { tab: ShopTab; label: string }[] = [
  { tab: 'weapon', label: 'Оружие' },
  { tab: 'offhand', label: 'Щиты' },
  { tab: 'outfit', label: 'Облик' },
  { tab: 'potion', label: 'Зелья' },
];

const WEEKDAY = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** «Твоя сила»: рост по упражнениям, серия и повторы за две недели. */
function StrengthSheet({ progress, now, onClose }: { progress: Progress; now: number; onClose: () => void }) {
  const series = streak(progress.days, now);
  const [view, setView] = useState<'week' | 'month' | 'chart'>('week');
  const last = Array.from({ length: 14 }, (_, i) => {
    const t = now - (13 - i) * 86400000;
    return { day: WEEKDAY[new Date(t).getDay()], reps: progress.days[dayKey(t)] ?? 0 };
  });
  const max = Math.max(10, ...last.map((d) => d.reps));
  const total = last.reduce((s, d) => s + d.reps, 0);
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
        <div className="remark">
          <Portrait line={{ face: 'grom', color: NPCS.grom.color, who: NPCS.grom.name }} size={52} />
          <div>
            <div className="level-title">Твоя сила</div>
            <div className="muted">
              {series.days > 0
                ? `Серия ${series.days} ${series.days === 1 ? 'день' : series.days < 5 ? 'дня' : 'дней'}. Отдыхать можно ${REST_PER_WEEK} дня в неделю, серия не сгорит.`
                : 'Начни серию сегодня: одна тренировка в день, отдыхать можно два дня в неделю.'}
            </div>
          </div>
        </div>
        {EXERCISES.map((ex) => {
          const best = progress.best[ex];
          const first = progress.first[ex];
          const up = best && first && best.reps > first.reps ? best.reps - first.reps : 0;
          return (
            <div key={ex} className="strength-row">
              <div className="strength-ex">
                {EXERCISE_LABELS[ex]}
                <div className="strength-was">{first ? `первый подход: ${amountText(ex, first.reps)}` : 'ещё не делал'}</div>
              </div>
              {up > 0 && <span className="strength-up">+{amountText(ex, up)}</span>}
              <span className="strength-val">{best ? amountText(ex, best.reps) : '—'}</span>
            </div>
          );
        })}
        <div className="muted">Лучший подход за одну миссию. За 2 недели: {total} повторов.</div>
        <div className="tabs">
          <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>
            2 недели
          </button>
          <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>
            Календарь
          </button>
          <button className={view === 'chart' ? 'active' : ''} onClick={() => setView('chart')}>
            График
          </button>
        </div>
        {view === 'week' && (
          <>
            <div className="week-bars">
              {last.map((d, i) => (
                <div key={i} className={d.reps ? '' : 'rest'} style={{ height: `${(d.reps / max) * 100}%` }} title={`${d.reps}`} />
              ))}
            </div>
            <div className="week-days">
              {last.map((d, i) => (
                <span key={i}>{d.day}</span>
              ))}
            </div>
          </>
        )}
        {view === 'month' && <Calendar progress={progress} now={now} />}
        {view === 'chart' && <RepsChart progress={progress} now={now} />}
        <button className="link" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

/** Жизни с таймером до следующей: тикает сама, чтобы не перерисовывать карту каждую секунду. */
function LivesPill({ progress }: { progress: Progress }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const lives = livesNow(progress, now);
  return (
    <span className={`pill ${lives.lives ? '' : 'empty'}`}>
      <Heart className="heart" /> {lives.lives}/{lives.max}
      {lives.nextMs > 0 && <small>{fmtMin(lives.nextMs)}</small>}
    </span>
  );
}
