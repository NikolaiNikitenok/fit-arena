import { lazy, ReactNode, Suspense, useEffect, useRef, useState } from 'react';
import { track } from '../telemetry';
import { amountText, EXERCISE_LABELS, Exercise, repsEquivalent } from '../repCounter';
import { Portrait } from './Dialog';
import { GearFace, HeroHome, ShopTab } from './HeroHome';
import { GEAR, gearById, gearText, ITEMS, itemById, POTIONS, Rarity, RARITY_COLORS, RARITY_NAMES, RARITY_ORDER, RARITY_SHORT } from './items';
import { LANDS, WORLD_NAMES, WORLDS } from './lands';
import { LEVEL_COUNT, LEVELS, LevelDef, targetReps, WORLD_SIZE } from './levels';
import { Stars } from './Stars';
import { NPCS } from './npcs';
import { dailyTask } from './daily';
import { startCloud, usePro } from '../cloud';
import { loadBalance } from '../balanceClient';
import { recordEventHit } from './event';
import { Calendar, RepsChart } from './Stats';
import { weekKey } from '../../shared/weekly';
import { MONTHS, recapMonths } from './recap';
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
  freeAttempt,
  recordWin,
  spendMight,
  REST_PER_WEEK,
  spendLife,
  spendSwaps,
  streakOf,
  swapsLeft,
  saveProgress,
  recordManual,
  applyFreeze,
} from './progress';
import { Chest, Coin, Flask, Heart, Lock, Star, Swords } from '../icons';
import { heroHands, heroPower } from './power';
import { sfx, useMusic } from '../audio';
import { missionTheme, worldTheme } from '../music';
import { Sheet } from '../Sheet';
import { openPassInTelegram, platform, startPost, startTab } from '../telegram';
import { type FeedOpen, onOpenFeed, takeFeedRequest } from '../social/bus';
import { useCloudReady, useStarter } from '../cloud';
import { type OfferPlace, offerSeen, payStars } from '../payments';
import { claimStarter, STARTER_PACK } from './starter';
import { dueOffer, markOffer, type OfferKind } from './offers';
import { pl, t } from '../i18n';
import { type Feature, freshUnlocks, levelsToUnlock, markUnlockSeen, nextLocked, rememberUnlocks } from './unlocks';
import { linkUnlocks } from './unlockLinks';
import { lockedText, UnlockSheet } from './UnlockSheet';
import { getSettings } from '../settings';
import { MorningOffer } from '../warmup/MorningOffer';
import { isBannerOpen, unseenEntries } from '../updates/updates';
import { markMorning, morningDue, morningWorkout } from '../warmup/morning';

// Тяжёлые экраны (3D, камера, клан) грузятся, только когда их открыли: первый экран появляется быстрее.
const MissionPlay = lazy(() => import('./MissionPlay').then((m) => ({ default: m.MissionPlay })));
const EventScreen = lazy(() => import('./EventScreen').then((m) => ({ default: m.EventScreen })));
const ProgramsScreen = lazy(() => import('./Programs').then((m) => ({ default: m.ProgramsScreen })));
const FeedScreen = lazy(() => import('../social/FeedScreen').then((m) => ({ default: m.FeedScreen })));
const GymScreen = lazy(() => import('../gym/GymScreen').then((m) => ({ default: m.GymScreen })));
const ClanScreen = lazy(() => import('../clan/ClanScreen').then((m) => ({ default: m.ClanScreen })));
const PassScreen = lazy(() => import('./PassScreen').then((m) => ({ default: m.PassScreen })));
const HolidayScreen = lazy(() => import('./HolidayScreen').then((m) => ({ default: m.HolidayScreen })));
const CollectionsSheet = lazy(() => import('./CollectionsSheet').then((m) => ({ default: m.CollectionsSheet })));
const CitySheet = lazy(() => import('../city/CitySheet').then((m) => ({ default: m.CitySheet })));
const RecapScreen = lazy(() => import('./Recap').then((m) => ({ default: m.RecapScreen })));
const TitanScreen = lazy(() => import('./TitanScreen').then((m) => ({ default: m.TitanScreen })));
const PetScreen = lazy(() => import('./PetScreen').then((m) => ({ default: m.PetScreen })));
const DungeonScreen = lazy(() => import('./match3/DungeonScreen').then((m) => ({ default: m.DungeonScreen })));
const PetHatch = lazy(() => import('./PetScreen').then((m) => ({ default: m.PetHatch })));
const Onboarding = lazy(() => import('./Onboarding').then((m) => ({ default: m.Onboarding })));
const SettingsSheet = lazy(() => import('../SettingsSheet').then((m) => ({ default: m.SettingsSheet })));
const WorldMap3D = lazy(() => import('./WorldMap3D').then((m) => ({ default: m.WorldMap3D })));
const VillageScreen = lazy(() => import('../village/VillageScreen').then((m) => ({ default: m.VillageScreen })));

/** Пока экран докачивается. */
const Loading = () => <div className="lazy-loading muted">{t('Загружаем…')}</div>;
const Screen = ({ children }: { children: ReactNode }) => <Suspense fallback={<Loading />}>{children}</Suspense>;

// Три мира по 100 уровней и финал. Вкладка «Замок» открывается после третьего мира.
const TABS = [...WORLDS, 'castle'] as const;
// На вкладках карты короткие названия, чтобы все четыре мира помещались в строку.
const SHORT_WORLD: Record<(typeof TABS)[number], string> = { fantasy: t('Королевство'), space: t('Космос'), zombie: t('Зомби'), castle: t('Замок') };
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
  // Вкладка дуэли — из объявления Грома об открытых дуэлях.
  onDuel?: () => void;
  // Сколько уровней карты осталось до вкладок нижнего меню (0 — открыта): меню рисует замки.
  onLocks?: (locks: { village: number; clan: number; duel: number }) => void;
}

export function Adventure({ tab, onTab, onPlaying, onFriends, onDuel, onLocks }: Props) {
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
  // Ступени разделов (src/game/unlocks.ts): ссылка клана или дуэли открывает свой раздел сразу.
  const lockLeft = (f: Feature) => levelsToUnlock(progress, f, linkUnlocks());
  const locks = { village: lockLeft('village'), clan: lockLeft('clan'), duel: lockLeft('duel') };
  useEffect(() => onLocks?.(locks), [locks.village, locks.clan, locks.duel]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const next = rememberUnlocks(latest.current, linkUnlocks());
    if (next !== latest.current) setProgress(saveProgress(next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Новичок с первого экрана сразу идёт на испытание: без брифинга, камера включается сама.
  const autoStart = useRef(false);
  // Прогресс с сервера: на новом телефоне герой подтягивается сам.
  useEffect(() => {
    void startCloud((p) => setProgress(p));
    void loadBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Набор «Новичок» оплачен (здесь или на другом устройстве), а в прогрессе его ещё нет: кладём вещи.
  const starter = useStarter();
  const [starterGot, setStarterGot] = useState(false);
  useEffect(() => {
    if (!starter?.bought) return;
    const next = claimStarter(latest.current, Date.now());
    if (!next) return;
    setProgress(next);
    setStarterGot(true);
    sfx('chest');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starter?.bought]);
  const current = currentLevel(progress, LEVEL_COUNT);
  const currentDef = LEVELS[current - 1];
  const [world, setWorld] = useState(currentDef.world);
  const [playing, setPlayingState] = useState<LevelDef | null>(null);
  const setPlaying = (l: LevelDef | null, auto = false) => {
    autoStart.current = auto;
    setPlayingState(l);
    onPlaying(!!l);
  };
  const [selected, setSelected] = useState<LevelDef | null>(null);
  // Ссылка «Купить в Telegram» из Max и браузера открывает игру сразу у купца (?tab=shop).
  const [shop, setShop] = useState<ShopTab | null>(() => (startTab() === 'shop' ? 'weapon' : null));
  const [settings, setSettings] = useState(false);
  const [replayOnb, setReplayOnb] = useState(false);
  const [achOpen, setAchOpen] = useState(false);
  // Кнопка бота после оплаты Pro и ссылка «Купить в Telegram» открывают игру сразу на пропуске (?tab=pass).
  const [passOpen, setPassOpen] = useState(() => startTab() === 'pass');
  // Предложение покупки в подходящий момент (src/game/offers.ts): набор после первого босса или 3-го дня серии,
  // Pro — когда дошёл до закрытой золотой награды. Раз за всё время на каждое и не чаще раза в день.
  const [offer, setOffer] = useState<OfferKind | null>(null);
  const [eventOpen, setEventOpenState] = useState(false);
  const [petsOpen, setPetsOpen] = useState(false);
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  // Лента (src/social): с главной, из профиля («Написать пост») и по кнопке бота ?tab=feed&post=ID.
  const [feed, setFeed] = useState<FeedOpen | null>(() => takeFeedRequest() ?? (startTab() === 'feed' || startPost() ? { post: startPost() ?? undefined } : null));
  useEffect(
    () =>
      onOpenFeed(() => {
        const q = takeFeedRequest();
        if (q) setFeed(q);
      }),
    [],
  );
  const [recap, setRecap] = useState<string | null>(null);
  const [titanOpen, setTitanOpen] = useState(false);
  // Итоги открыты: точка на полосе главной гаснет.
  const openRecap = (month: string) => {
    setRecap(month);
    if (latest.current.recapSeen !== month) setProgress(saveProgress({ ...latest.current, recapSeen: month }));
  };
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
    setPlaying({ ...currentDef, daily: true, type: 'build', title: t('Задание: {0}', { 0: NPCS[daily.npc].name }), exercises: [daily.exercise], load: left / progress.baseline[daily.exercise], seconds: Math.max(120, left * 5), rest: false, story: [], coins: 0 });
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

  const showToast = (text: string, ms = 2600) => {
    setToast(text);
    setTimeout(() => setToast((tm) => (tm === text ? null : tm)), ms);
  };

  // Заморозка Pro: пропуск на этой неделе не рвёт серию (раз в 7 дней, только если серия иначе оборвётся).
  useEffect(() => {
    const now = Date.now();
    const next = applyFreeze(latest.current, pro, now);
    if (next === latest.current) return;
    setProgress(saveProgress(next));
    showToast(t('❄️ Заморозка Pro спасла серию: {0} дн. подряд', { 0: streakOf(next, now).days }), 5000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pro, progress.days]);

  // Новый уровень героя: монеты и сообщение, как только миссия закончилась.
  const [levelUp, setLevelUp] = useState<string | null>(null);
  useEffect(() => {
    if (playing || programs) return;
    const r = claimHeroLevels(latest.current);
    if (!r) return;
    setProgress(r.progress);
    sfx('levelup');
    setLevelUp(t('Новый уровень героя: {0}! +{1} монет', { 0: r.levels[r.levels.length - 1], 1: r.coins }));
    setTimeout(() => setLevelUp(null), 3500);
  }, [playing, programs, progress.days]);

  // Питомец подрос: сообщение после тренировки.
  const petLvl = progress.pets?.active ? petLevel(petXp(progress, progress.pets.active)).level : 0;
  const petSeen = useRef(petLvl);
  useEffect(() => {
    if (playing) return;
    const id = latest.current.pets?.active;
    if (id && petSeen.current && petLvl > petSeen.current) showToast(t('{0} подрос: уровень {1}!', { 0: petName(latest.current, id), 1: petLvl }));
    petSeen.current = petLvl;
  }, [playing, petLvl]);

  // Новое достижение: короткое сообщение после миссии, награда ждёт в «Достижениях».
  useEffect(() => {
    if (playing || programs || dungeon) return;
    const fresh = newAchievements(latest.current, Date.now());
    if (!fresh.length) return;
    setProgress(markAchSeen(latest.current, fresh.map((a) => a.id)));
    setAchToast(fresh.length > 1 ? t('Новые достижения: {0}', { 0: fresh.map((a) => a.title).join(', ') }) : t('Новое достижение: {0}! Забери награду', { 0: fresh[0].title }));
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

  const newcomer = !progress.onboarded && !Object.keys(progress.stars).length && !Object.keys(progress.days).length;
  // Хуки — до первых ранних return (бой, событие, подземелье…): иначе React падает при смене экрана.
  // Пора ли предложить покупку (src/game/offers.ts): только на главной, когда сервер уже ответил (знаем, есть ли Pro
  // и куплен ли набор), не посреди боя и не поверх других окон — иначе окно засчитается, а его никто не увидит.
  const cloudReady = useCloudReady();
  // Утренняя зарядка: раньше предложения покупки, и одно окно за раз.
  const [morning, setMorning] = useState(false);
  const morningRef = useRef(false);
  const busyScreen =
    !!playing || !!dungeon || gym || !!programs || !!selected || !!shop || settings || achOpen || passOpen || eventOpen || petsOpen || holidayOpen || collectionsOpen || cityOpen || titanOpen || strength || starterGot || !!levelUp || newcomer || (!eggLater && canHatch(progress)) || freshUnlocks(progress).length > 0;
  useEffect(() => {
    if (tab !== 'hero' || busyScreen || offer || morningRef.current) return;
    if (!morningDue(latest.current, Date.now(), getSettings().morning)) return;
    morningRef.current = true;
    // Открыта карточка «Игра обновилась» — ждём, пока её закроют: два окна сразу не показываем.
    const show = () => {
      if (unseenEntries().length || isBannerOpen()) return false;
      markMorning(Date.now());
      setMorning(true);
      return true;
    };
    // Первая проверка — после заставки и карточки «Что нового» (она появляется через 1,8 с).
    let shown = false;
    const id = setInterval(() => (shown = show()) && clearInterval(id), 2500);
    return () => {
      clearInterval(id);
      if (!shown) morningRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, busyScreen]);
  useEffect(() => {
    if (tab !== 'hero' || !cloudReady || busyScreen || offer || morning || morningRef.current) return;
    const now = Date.now();
    const kind = dueOffer(latest.current, { starterOpen: !!starter && !starter.bought, pro, canPay: platform === 'tg' }, now);
    if (!kind) return;
    setProgress(saveProgress(markOffer(latest.current, kind, now)));
    track('offer_popup', kind);
    setOffer(kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, cloudReady, busyScreen, pro, starter?.bought, Object.keys(progress.stars).length, progress.pass?.xp]);
  // Купил (здесь или на другом устройстве) — окно предложения больше не нужно.
  useEffect(() => {
    if ((offer === 'pro' && pro) || (offer === 'starter' && (starter?.bought || progress.starterPack))) setOffer(null);
  }, [offer, pro, starter?.bought, progress.starterPack]);
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
            // Испытания силы жизни не стоят: это замер, а не бой.
            if (!playing.daily) update((p) => recordLoss(freeAttempt(p, playing) ? p : spendLife(p, Date.now()), playing));
          }}
          onStart={() => {
            track('mission_start', playing.daily ? 'daily' : playing.id);
            update(spendMight);
          }}
          onActivity={(ex, reps, manual) => update((p) => (manual ? recordManual(recordActivity(p, ex, reps, Date.now(), { manual: true }), repsEquivalent(ex, reps), Date.now()) : addClanPending(recordActivity(p, ex, reps, Date.now()), reps, Date.now())))}
          autoStart={autoStart.current}
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

  if (feed) return <Screen><FeedScreen compose={feed.compose} focus={feed.post} onClose={() => setFeed(null)} onFriends={() => { setFeed(null); onFriends(); }} /></Screen>;

  if (gym) return <Screen><GymScreen progress={progress} update={update} onClose={() => setGym(false)} /></Screen>;

  if (programs) return <Screen><ProgramsScreen progress={progress} update={update} model={item.hero} quick={programs.quick} onClose={() => setPrograms(null)} /></Screen>;

  // Объявление Грома о разделах, открытых пройденными уровнями.
  const fresh = freshUnlocks(progress);
  const openFeature = (f: Feature) => {
    if (f === 'duel') return onDuel ? onDuel() : onFriends();
    if (f === 'village' || f === 'clan') return onTab(f);
    if (f === 'dungeon') return setDungeon(true);
    if (f === 'shop') return setShop('weapon');
    if (f === 'programs') return setPrograms({});
    if (f === 'gym') return setGym(true);
    if (f === 'pass') return setPassOpen(true);
    if (f === 'events') return setEventOpen(true);
    if (f === 'collections') return setCollectionsOpen(true);
    if (f === 'city') return setCityOpen(true);
    if (f === 'daily') return startDaily();
  };
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
            if (start) setPlaying(LEVELS[0], true);
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
      {holidayOpen && <HolidayScreen progress={progress} setProgress={setProgress} onClose={() => setHolidayOpen(false)} />}
      {collectionsOpen && <CollectionsSheet progress={progress} setProgress={setProgress} onClose={() => setCollectionsOpen(false)} />}
      {cityOpen && <CitySheet onClose={() => setCityOpen(false)} />}
      {morning && tab === 'hero' && (
        <MorningOffer
          baseline={progress.baseline}
          onCamera={() => {
            setMorning(false);
            setPrograms({ quick: morningWorkout(progress.baseline) });
          }}
          onClose={() => setMorning(false)}
        />
      )}
      {offer && tab === 'hero' && (
        <OfferSheet
          kind={offer}
          progress={progress}
          onPass={() => {
            setOffer(null);
            setPassOpen(true);
          }}
          onClose={() => setOffer(null)}
        />
      )}
      {tab === 'hero' && !newcomer && fresh.length > 0 && !(!eggLater && canHatch(progress)) && (
        <UnlockSheet
          features={fresh}
          next={(() => {
            const f = nextLocked(progress, linkUnlocks());
            return f ? { f, left: lockLeft(f) } : null;
          })()}
          onClose={() => setProgress(saveProgress(markUnlockSeen(latest.current, fresh)))}
          onOpen={(f) => {
            setProgress(saveProgress(markUnlockSeen(latest.current, fresh)));
            openFeature(f);
          }}
        />
      )}
      {tab === 'hero' && !newcomer && !eggLater && canHatch(progress) && (
        <PetHatch
          onDone={(name) => {
            setProgress(saveProgress(hatchEgg(latest.current, name)));
            setPetsOpen(true);
          }}
          onLater={() => setEggLater(true)}
        />
      )}
      {strength && (
        <StrengthSheet
          pro={pro}
          progress={progress}
          now={now}
          onClose={() => setStrength(false)}
          onRecap={(m) => {
            setStrength(false);
            openRecap(m);
          }}
        />
      )}
      {recap && <RecapScreen progress={progress} month={recap} onClose={() => setRecap(null)} />}
      {titanOpen && (
        <TitanScreen
          progress={progress}
          setProgress={setProgress}
          onTrain={() => {
            setTitanOpen(false);
            setPlaying(currentDef);
          }}
          onClose={() => setTitanOpen(false)}
        />
      )}
      {starterGot && (
        <Sheet onClose={() => setStarterGot(false)}>
          <div className="starter-got">
            <Chest size={64} />
            <div className="level-title">{t('Набор «Новичок» твой!')}</div>
            <div className="muted">{t('Облик «{0}» уже в гардеробе. Из сундука: {1} монет и {2} свитка замены.', { 0: itemById(STARTER_PACK.outfit).name, 1: STARTER_PACK.coins, 2: STARTER_PACK.swap })}</div>
            <button className="primary" onClick={() => setStarterGot(false)}>
              {t('Отлично')}
            </button>
          </div>
        </Sheet>
      )}
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
            showToast(t('Задание выполнено! +{0} монет{1}', { 0: daily.coins, 1: daily.potion ? t(' и зелье') : '' }));
          }}
          onFriends={onFriends}
          onShop={(tm) => setShop(tm ?? 'weapon')}
          onStrength={() => setStrength(true)}
          onWeekly={(open) => {
            update((p) => saveProgress({ ...p, weeklySeen: weekKey(dayKey(Date.now())) }));
            if (open) setStrength(true);
          }}
          onEquip={(id) => setProgress(equip(progress, id))}
          onEquipGear={(id) => setProgress(equipGear(progress, id))}
          onPotion={(id) => {
            const next = usePotion(progress, id, Date.now());
            if (!next) return showToast(id === 'vigor' ? t('Жизни и так полные.') : t('Сейчас не нужно.'));
            setProgress(next);
            showToast(id === 'vigor' ? t('+1 жизнь!') : id === 'might' ? t('Эликсир выпит: +30% урона в следующем бою.') : t('Ещё одна замена упражнения на сегодня.'));
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
          onHoliday={() => setHolidayOpen(true)}
          onCollections={() => setCollectionsOpen(true)}
          onCity={() => setCityOpen(true)}
          onFeed={() => setFeed({})}
          onRecap={openRecap}
          onTitan={() => setTitanOpen(true)}
          livesLeft={lives.lives}
          lockLeft={lockLeft}
          nextLock={nextLocked(progress, linkUnlocks())}
          onClan={() => onTab('clan')}
          onLocked={(f) => showToast(lockedText(f, lockLeft(f)), 3500)}
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
  const series = streakOf(progress, now);

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
              onMerchant={tap(() => (lockLeft('shop') ? showToast(lockedText('shop', lockLeft('shop')), 3500) : setShop('weapon')))}
              onChest={(land) =>
                tap(() => {
                  const r = claimChest(progress, land);
                  if (!r) return showToast(t('Этот сундук уже пуст.'));
                  setProgress(r.progress);
                  sfx('chest');
                  showToast(r.itemName ? t('В сундуке: {0}!', { 0: r.itemName }) : t('В сундуке {0} монет.', { 0: r.coins }));
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
                <div className="map-sub">{L.world === 'castle' ? t('Финал') : t('Хранитель: {0}', { 0: L.boss.name })}</div>
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
                <button className="close-x" onClick={() => setSelected(null)} aria-label={t('Закрыть')}>
                  ×
                </button>
                <div className="level-tag">
                  {t('{0} · уровень {1}', { 0: WORLD_NAMES[LANDS[selected.land].world], 1: selected.num })}
                </div>
                <div className="level-title">{selected.title}</div>
                <div className="muted">
                  {selected.exercises.map((e) => EXERCISE_LABELS[e]).join(' → ')}
                  {selected.type !== 'trial' && t(' · цель {0}', { 0: targetReps(selected, progress.baseline) })} · {t('{0} монет', { 0: selected.coins })}
                </div>
                <Stars n={progress.stars[selected.id] ?? 0} />
                {isUnlocked(progress, selected.id) ? (
                  <button className="primary" onClick={() => setPlaying(selected)}>
                    {progress.stars[selected.id] ? t('Пройти ещё раз') : t('В путь')}
                  </button>
                ) : (
                  <div className="muted">{t('Сначала пройди предыдущие уровни.')}</div>
                )}
              </div>
            ) : (
              <>
                <div className="map-help">{t('Листай карту пальцем · нажми на камень уровня')}</div>
                <button className="primary daily" onClick={() => setPlaying(currentDef)}>
                  {series.today ? t('Уровень {0}: {1}', { 0: currentDef.num, 1: currentDef.title }) : t('Тренировка дня')}
                  <small>{series.today ? t('Сегодня уже {0} повторов · серия {1}', { 0: progress.days[dayKey(now)], 1: series.days }) : t('Уровень {0}: {1}', { 0: currentDef.num, 1: currentDef.title })}</small>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {/* Листы вне карты: иначе нижнее меню перекрывает их низ. */}
      {sheets}
    </>
  );
}

/** Всплывающее предложение: набор «Новичок» от купца или Pro Pass, когда золотая награда закрыта. */
function OfferSheet({ kind, progress, onPass, onClose }: { kind: OfferKind; progress: Progress; onPass: () => void; onClose: () => void }) {
  // «Увидели» считает сама карточка покупки (набор — StarterCard, Pro — в пропуске); показ окна — offer_popup.
  return (
    <Sheet onClose={onClose}>
      <div className="offer-sheet">
        {kind === 'starter' ? (
          <>
            <Portrait line={{ face: 'fedor', color: NPCS.fedor.color, who: NPCS.fedor.name }} size={52} />
            <div className="level-title">{t('Достойно настоящего героя!')}</div>
            <div className="muted">{t('Купец Фёдор: «Вижу, ты не бросаешь тренировки. Для таких у меня есть набор искателя приключений — один раз и только для своих.»')}</div>
            <StarterCard progress={progress} place="popup" />
          </>
        ) : (
          <>
            <Portrait line={{ face: 'grom', color: NPCS.grom.color, who: NPCS.grom.name }} size={52} />
            <div className="level-title">{t('Золотая награда ждёт')}</div>
            <div className="muted">{t('Ты дошёл до ступени пропуска, где рядом с обычной наградой лежит золотая. Её открывает Pro Pass: золотая дорожка, заморозка серии и +25% опыта пропуска. Силы в дуэлях он не прибавляет.')}</div>
            <button className="primary" onClick={onPass}>
              {t('Посмотреть пропуск')}
            </button>
          </>
        )}
        <button className="link" onClick={onClose}>
          {t('Не сейчас')}
        </button>
      </div>
    </Sheet>
  );
}

/** Лавка купца Фёдора: облики, оружие, щиты и зелья. Новое оружие появляется по мере продвижения. */
/** Набор «Новичок» у купца: один раз, за звёзды Telegram. Вещи кладёт Adventure, когда сервер подтвердит оплату. */
export function StarterCard({ progress, place = 'shop' }: { progress: Progress; place?: OfferPlace }) {
  const starter = useStarter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const open = !!starter && !starter.bought && !progress.starterPack;
  useEffect(() => {
    if (open) offerSeen('starter', place);
  }, [open, place]);
  if (!open) return null;
  const outfit = itemById(STARTER_PACK.outfit);
  const buy = async () => {
    if (platform !== 'tg') return openPassInTelegram('shop');
    setBusy(true);
    setNote(null);
    const r = await payStars('starter', (s) => s.starter.bought, undefined, place);
    setBusy(false);
    if (r === 'late') setNote(t('Оплата прошла, набор придёт через минуту. Если нет — напиши боту /paysupport.'));
    else if (typeof r === 'object') setNote(r.error);
  };
  return (
    <div className="starter-card" style={{ ['--rc' as string]: outfit.glow ?? outfit.color }}>
      <div className="starter-card-art">
        <Chest size={46} />
      </div>
      <div className="starter-card-body">
        <div className="starter-card-title">{t('Набор «Новичок»')}</div>
        <div className="starter-card-text">
          {t('Облик «{0}» и сундук: {1} монет и {2} свитка замены. Только один раз.', { 0: outfit.name, 1: STARTER_PACK.coins, 2: STARTER_PACK.swap })}
        </div>
        {note && <div className="starter-card-note">{note}</div>}
      </div>
      <button className="pass-buy primary small" disabled={busy} onClick={buy}>
        {starter.price} <Star size={13} />
      </button>
    </div>
  );
}

function Shop({ progress, setProgress, tab, setTab, reachedLand, onClose }: { progress: Progress; setProgress: (p: Progress) => void; tab: ShopTab; setTab: (tm: ShopTab) => void; reachedLand: number; onClose: () => void }) {
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
    <Sheet onClose={onClose}>
      <div className="remark">
        <Portrait line={{ face: 'fedor', color: NPCS.fedor.color, who: NPCS.fedor.name }} size={52} />
        <div>
          <div className="level-title">{t('Купец Фёдор')}</div>
          <div className="muted">{t('«Оружие бьёт сильнее, щит бережёт сердца в бою с боссом. Лучшее привожу, когда ты уходишь дальше.»')}</div>
        </div>
      </div>
      <div className="shop-head">
        <div className="coins">
          <Coin className="coin" /> {progress.coins}
        </div>
        <div className="muted">
          <Swords size={13} /> {t('урон {0}', { 0: heroPower(progress).damage })}
        </div>
      </div>
      <StarterCard progress={progress} />
      <div className="tabs">
        {SHOP_TABS.map((tm) => (
          <button key={tm.tab} className={tab === tm.tab ? 'active' : ''} onClick={() => setTab(tm.tab)}>
            {tm.label}
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
                {r === 'all' ? t('Все') : RARITY_SHORT[r]} <small>{n}</small>
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
                    <Swords size={11} /> {t('урон {0} → {1}', { 0: damageNow, 1: damage })}
                  </div>
                )}
                {!on && blocked && <div className="shop-delta">{t('не действует с двуручным оружием')}</div>}
              </div>
              {owned ? (
                <button className="small-btn" disabled={on && g.slot === 'weapon'} onClick={() => setProgress(equipGear(progress, g.id))}>
                  {on ? (g.slot === 'weapon' ? t('Надето') : t('Снять')) : t('Надеть')}
                </button>
              ) : locked ? (
                <span className="shop-lock">
                  <Lock size={12} /> {t('с {0}', { 0: LANDS[g.minLand].name })}
                </span>
              ) : (
                price(g.price, () => buyGear(progress, g.id))
              )}
            </div>
          );
        })}
      {(tab === 'weapon' || tab === 'offhand') && later && (
        <div className="shop-later muted">
          <Lock size={12} /> {t('{0}: Фёдор привезёт его с земли «{1}».', { 0: gear.length ? t('Ещё товар') : t('Такого пока нет'), 1: LANDS[later.minLand].name })}
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
                  {i.coinBonus > 0 && t(' · +{0}% монет', { 0: Math.round(i.coinBonus * 100) })}
                </div>
              </div>
              {owned ? (
                <button className="small-btn" disabled={progress.equipped === i.id} onClick={() => setProgress(equip(progress, i.id))}>
                  {progress.equipped === i.id ? t('Надето') : t('Надеть')}
                </button>
              ) : (
                price(i.price, () => buy(progress, i.id))
              )}
            </div>
          );
        })}
    </Sheet>
  );
}

const SHOP_TABS: { tab: ShopTab; label: string }[] = [
  { tab: 'weapon', label: t('Оружие') },
  { tab: 'offhand', label: t('Щиты') },
  { tab: 'outfit', label: t('Облик') },
  { tab: 'potion', label: t('Зелья') },
];

const WEEKDAY = [t('вс'), t('пн'), t('вт'), t('ср'), t('чт'), t('пт'), t('сб')];

/** «Твоя сила»: рост по упражнениям, серия и повторы за две недели. */
function StrengthSheet({ pro, progress, now, onClose, onRecap }: { pro: boolean; progress: Progress; now: number; onClose: () => void; onRecap: (month: string) => void }) {
  const series = streakOf(progress, now);
  const months = recapMonths(progress, now).slice(0, 6);
  const [view, setView] = useState<'week' | 'month' | 'chart'>('week');
  const last = Array.from({ length: 14 }, (_, i) => {
    const tm = now - (13 - i) * 86400000;
    return { day: WEEKDAY[new Date(tm).getDay()], reps: progress.days[dayKey(tm)] ?? 0 };
  });
  const max = Math.max(10, ...last.map((d) => d.reps));
  const total = last.reduce((s, d) => s + d.reps, 0);
  return (
    <Sheet onClose={onClose}>
      <div className="remark">
        <Portrait line={{ face: 'grom', color: NPCS.grom.color, who: NPCS.grom.name }} size={52} />
        <div>
          <div className="level-title">{t('Твоя сила')}</div>
          <div className="muted">
            {series.days > 0
              ? t('Серия {0} {1}. Отдыхать можно {2} дня в неделю, серия не сгорит.{3}', { 0: series.days, 1: pl(series.days, ['день', 'дня', 'дней'], ['day', 'days']), 2: REST_PER_WEEK, 3: pro ? t(' С Pro — ещё заморозка раз в неделю.') : '' })
              : t('Начни серию сегодня: одна тренировка в день, отдыхать можно два дня в неделю.')}
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
              <div className="strength-was">{first ? t('первый подход: {0}', { 0: amountText(ex, first.reps) }) : t('ещё не делал')}</div>
            </div>
            {up > 0 && <span className="strength-up">+{amountText(ex, up)}</span>}
            <span className="strength-val">{best ? amountText(ex, best.reps) : '—'}</span>
          </div>
        );
      })}
      <div className="muted">{t('Лучший подход за одну миссию. За 2 недели: {0} повторов.', { 0: total })}</div>
      {months.length > 0 && (
        <>
          <div className="section-title">{t('🎉 Итоги месяца')}</div>
          <div className="recap-months">
            {months.map((m) => (
              <button key={m} onClick={() => onRecap(m)}>
                {MONTHS[Number(m.slice(5)) - 1]} {m.slice(0, 4) !== String(new Date(now).getFullYear()) ? m.slice(0, 4) : ''}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="tabs">
        <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>
          {t('2 недели')}
        </button>
        <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>
          {t('Календарь')}
        </button>
        <button className={view === 'chart' ? 'active' : ''} onClick={() => setView('chart')}>
          {t('График')}
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
    </Sheet>
  );
}

/** Жизни с таймером до следующей: тикает сама, чтобы не перерисовывать карту каждую секунду. */
function LivesPill({ progress }: { progress: Progress }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tm = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tm);
  }, []);
  const lives = livesNow(progress, now);
  return (
    <span className={`pill ${lives.lives ? '' : 'empty'}`}>
      <Heart className="heart" /> {lives.lives}/{lives.max}
      {lives.nextMs > 0 && <small>{fmtMin(lives.nextMs)}</small>}
    </span>
  );
}
