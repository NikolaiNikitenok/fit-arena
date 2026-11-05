import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  accrued,
  Bld,
  build,
  BUILD_ERRORS,
  BUILDING_TYPES,
  BUILDINGS,
  BuildingType,
  buildersAt,
  busyBuilders,
  canPlace,
  capacity,
  CATEGORY_LABELS,
  Category,
  collect,
  costOf,
  countOf,
  finishNow,
  freeSpot,
  GRID,
  levelCap,
  maxCount,
  move,
  Res,
  RES_KEYS,
  sizeOf,
  speedUpCharge,
  thFor,
  thLevel,
  timeOf,
  Town,
  upgrade,
  upgradeBlock,
  villageBonus,
  affordable,
  isTrap,
  lootAvailable,
} from '../../shared/village';
import { armyCap, BattleArmy, BattleResult, barracksLevel, Deploy, housingOf, train, TRAIN_ERRORS, TROOP_IDS, TROOPS, TroopId, untrain } from '../../shared/villageBattle';
import { campBase, CAMP_REPEAT_SHARE, CAMPS, Camp } from '../../shared/villageCamps';
import { sfx, useMusic } from '../audio';
import { Check, Cross, Lock, Shield, Swords, Timer } from '../icons';
import { Dialog, Portrait } from '../game/Dialog';
import type { Line } from '../game/levels';
import { NPCS } from '../game/npcs';
import { heroLevel, heroXp, Progress, saveProgress } from '../game/progress';
import { spendCharge, villageOf } from '../game/resources';
import { BattleScreen, ResIcon, ResRow } from './BattleScreen';
import { Bolt, Dungeon, Hammer, Move, RES_COLORS, Scroll, Star, Trophy } from './icons';
import { emitFx } from './Particles';
import { pulse } from '../three/pulse';
import { DecorThumb, Preview } from './Preview';
import { newPartsAt } from './looks';
import { clearPending, defenseLog, fetchInbox, fetchTop, findTarget, isOnline, isTransient, loadPending, NO_SERVER, OFFLINE, type PendingAttack, pingServer, PvpError, revengeTarget, savePending, setPvpNotify, submitWithRetry, TargetView } from './pvpApi';
import type { AttackOutcome } from '../../shared/villagePvp';
import { applyInbox, applyMe, applyWin, canRevenge, markRevenged } from './pvp';
import { type PvpTopRow, SCOUT_SECONDS, VILLAGE_LEAGUES, villageLeague } from '../../shared/villagePvp';
import { cloudState } from '../cloud';
import { dueRaid, markRaidsSeen, troopCount, unseenRaids } from './raids';
import { fmtNum, fmtTime, foundTown, hasTown, tickTown, townOf, unpackBase, withTown } from './state';
import { claimTask, openTasks, taskDone, taskProgress, TASKS } from './tasks';
import type { DefenseEntry } from './types';
import { focusOn, type Ctl, type ViewBld } from './Village3D';
import { adviceCount, builderAdvice, upgradeNow } from './advice';
import { Curtain, type CurtainPhase } from './Curtain';
import { useViewSlot, ViewHost } from './Viewport';
import { TroopSheet, TroopThumb } from './TroopInfoSheet';
import { LabSheet } from './LabSheet';
import { canPlaceDecor, claimTheme, DECOR, DECOR_ERRORS, DECOR_GROUPS, DECOR_KINDS, decorAt, decorCtx, decorLock, decorOf, type DecorKind, freeDecorSpot, inSeason, moveDecor, occupied, ownedThemes, placeDecor, removeDecor, setTheme, THEME_IDS, THEMES, type ThemeId } from './decor';
import { cancelResearch, finishResearchNow, labLevel, RESEARCH_ERRORS, startResearch, troopLevel, troopLevels } from '../../shared/villageLab';
import { preloadTroops, type HeroLook } from './troops3d';
import { itemById } from '../game/items';
import { heroLook as outfitLook } from '../game/outfitSkin';
import { heroHands } from '../game/power';
import './village.css';
import { Sheet } from '../Sheet';
import { BarKey, FlyApi, FlyLayer, ResBar } from './Hud';
import { getSettings, useSettings } from '../settings';
import { nowSky, skyAt } from './sky';
import { CHARGE_MAX } from '../game/resources';
import { t, locale } from '../i18n';

// Пролёт над деревней уже был в этом запуске приложения.
let flownIn = false;

interface Props {
  progress: Progress;
  setProgress: (p: Progress) => void;
  // Во время боя нижнее меню прячется.
  onPlaying: (playing: boolean) => void;
  // В подземелье «три в ряд» за ресурсами.
  onDungeon?: () => void;
}

type Sheet = 'build' | 'army' | 'lab' | 'attack' | 'tasks' | 'log' | 'top' | 'advice' | null;
type Battle =
  | { kind: 'camp'; camp: Camp }
  | { kind: 'pvp'; target: TargetView; revengeOf?: string }
  | { kind: 'replay'; entry: DefenseEntry };
interface Placing {
  t: BuildingType;
  x: number;
  y: number;
  // Переносим уже стоящую постройку.
  id?: number;
  // Ставим украшение (t тогда — 'wall', клетка 1×1); did — переносим стоящее украшение.
  decor?: DecorKind;
  did?: number;
}

const say = (npc: keyof typeof NPCS, text: string): Line => ({ who: NPCS[npc].name, text, face: npc, color: NPCS[npc].color });
const CATS: (Category | 'decor')[] = ['economy', 'army', 'defense', 'village', 'decor'];

export function VillageScreen({ progress, setProgress, onPlaying, onDungeon }: Props) {
  const latest = useRef(progress);
  latest.current = progress;
  const commit = (p: Progress) => {
    latest.current = saveProgress(p);
    setProgress(latest.current);
  };
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState<number | null>(null);
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [cat, setCat] = useState<Category | 'decor'>('economy');
  const [selDecor, setSelDecor] = useState<number | null>(null);
  const [battle, setBattleState] = useState<Battle | null>(null);
  // Холст деревни и боя один и тот же: набег открывается без нового WebGL.
  const viewSlot = useViewSlot();
  const inBattle = (el: ReactNode) => (
    <div className="vil-screen battle">
      <BattleMusic />
      <Curtain phase={curtain.phase} text={curtain.text} />
      <ViewHost slot={viewSlot}>{el}</ViewHost>
    </div>
  );
  const [toast, setToast] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Line[] | null>(null);
  const [searching, setSearching] = useState(false);
  // Облака между деревнями: съехались → работа (поиск, смена экрана) → разошлись.
  const [curtain, setCurtain] = useState<{ phase: CurtainPhase; text?: string }>({ phase: 'off' });
  const cover = async (text: string, work: () => Promise<void> | void) => {
    setCurtain({ phase: 'in', text });
    sfx('whoosh');
    await new Promise((r) => setTimeout(r, 560));
    setCurtain({ phase: 'shut', text });
    try {
      await work();
    } finally {
      // Кадр-другой на то, чтобы новая сцена встала за облаками.
      await new Promise((r) => setTimeout(r, 250));
      setCurtain({ phase: 'out' });
      setTimeout(() => setCurtain((c) => (c.phase === 'out' ? { phase: 'off' } : c)), 700);
    }
  };
  // Набеги на игроков: есть ли сеть, что сказал сервер о последнем набеге, топ, «бот пишет о нападениях».
  const [online, setOnline] = useState(isOnline);
  const [pvpNote, setPvpNote] = useState<ReactNode>(null);
  const [top, setTop] = useState<PvpTopRow[] | null>(null);
  const [topErr, setTopErr] = useState<string | null>(null);
  const [notify, setNotify] = useState<boolean | null>(null);
  // Персонажи отрядов грузятся заранее, пока игрок в деревне: бой и казармы открываются уже с ними.
  useEffect(() => {
    const tm = setTimeout(preloadTroops, 1500);
    return () => clearTimeout(tm);
  }, []);
  useEffect(() => {
    const on = () => setOnline(isOnline());
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);
  // Набеги на деревню с сервера: при входе и раз в минуту. Каждый применяется один раз (по номеру).
  useEffect(() => {
    let alive = true;
    const pull = () =>
      fetchInbox()
        .then((inbox) => {
          if (!alive) return;
          setNotify(inbox.me.notify);
          const next = applyInbox(latest.current, inbox, Date.now());
          if (next !== latest.current) commit(next);
        })
        .catch(() => null);
    void pull();
    const id = window.setInterval(pull, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (sheet !== 'top') return;
    let alive = true;
    setTopErr(null);
    fetchTop()
      .then((r) => {
        if (!alive) return;
        setTop(r.top);
        if (r.me) commit(applyMe(latest.current, r.me, Date.now()));
      })
      .catch((e) => alive && setTopErr(e instanceof PvpError ? e.message : OFFLINE));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);
  // Пролёт над деревней — при первом входе за запуск приложения.
  const ctl = useRef<Ctl>(null as unknown as Ctl);
  if (!ctl.current) {
    ctl.current = { tx: 0, tz: 0, zoom: 0, intro: !flownIn && getSettings().flyIn };
    flownIn = true;
  }
  const barEls = useRef<Partial<Record<BarKey, HTMLDivElement | null>>>({});
  const flyRef = useRef<FlyApi>(null);
  // Журнал обороны: набеги Князя с телефона и (когда появится сервер) набеги игроков.
  const [log, setLog] = useState<DefenseEntry[]>([]);
  useEffect(() => {
    if (sheet !== 'log') return;
    let alive = true;
    void defenseLog(villageOf(latest.current).log ?? []).then((l) => alive && setLog(l));
    return () => {
      alive = false;
    };
  }, [sheet]);

  const setBattle = (b: Battle | null) => {
    setBattleState(b);
    onPlaying(!!b);
  };
  // Ушли из деревни посреди боя — нижнее меню не должно остаться спрятанным.
  const inFight = useRef(false);
  inFight.current = !!battle;
  useEffect(() => () => void (inFight.current && onPlaying(false)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const flash = (text: string) => {
    setToast(text);
    setTimeout(() => setToast((tm) => (tm === text ? null : tm)), 2400);
  };

  // Раз в секунду: таймеры, конец стройки и обучения. При входе — набег Князя, если подошёл срок.
  useEffect(() => {
    const raid = dueRaid(latest.current, Date.now());
    if (raid) commit(raid);
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const next = tickTown(latest.current, now);
    if (next !== latest.current) {
      commit(next);
      sfx('levelup');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);
  const fresh = unseenRaids(progress);
  useEffect(() => {
    if (!fresh.length || dialog) return;
    const e = fresh[0];
    const lost = RES_KEYS.filter((k) => e.loot[k] > 0).map((k) => `${fmtNum(e.loot[k])} ${k === 'wood' ? t('дерева') : k === 'stone' ? t('камня') : t('золота')}`);
    if (e.id) {
      const cups = e.trophies ? t(' Кубки: {0}{1}.', { 0: e.trophies > 0 ? '+' : '−', 1: Math.abs(e.trophies) }) : '';
      setDialog([
        say('boris', e.stars ? t('На нас напал {0}! {1}★, {2}.{3}', { 0: e.who, 1: e.stars, 2: lost.length ? t('унёс {0}', { 0: lost.join(', ') }) : t('но унести ничего не смог'), 3: cups }) : t('{0} пытался взять деревню, но оборона выстояла!{1}', { 0: e.who, 1: cups })),
        say('vega', canRevenge(e, Date.now()) ? t('Повтор боя — в журнале обороны. Там же можно отомстить: один раз, в течение суток.') : t('Повтор боя — в журнале обороны.')),
      ]);
      return;
    }
    setDialog([
      say('knyaz', e.stars ? t('Ха-ха! Мои лентяи заглянули к тебе в гости. {0}', { 0: lost.length ? t('Унесли {0}.', { 0: lost.join(', ') }) : t('Унести, правда, ничего не смогли.') }) : t('Мои лентяи вернулись ни с чем… Ну ничего, я ещё вернусь!')),
      say('vega', e.stars ? t('Строй башни и стены, а склады спрячут запасы. Повтор набега — в журнале обороны.') : t('Отличная оборона! Повтор набега — в журнале.')),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh.length]);

  const town = townOf(progress);
  const v = villageOf(progress);
  const th = thLevel(town);
  const cap = capacity(town);
  const charge = v.charge;

  const act = (fn: (tm: Town) => Town | string, ok?: string) => {
    const r = fn(townOf(latest.current));
    if (typeof r === 'string') return flash(r), false;
    commit(withTown(latest.current, r));
    if (ok) flash(ok);
    return true;
  };

  // Итог набега с сервера: добыча, кубки, месть. Возвращает, сколько кубков дали.
  const applyOutcome = (out: AttackOutcome, revengeOf?: string): number => {
    let p = out.win ? applyWin(latest.current, out.win) : latest.current;
    if (out.me) p = applyMe(p, out.me, Date.now());
    if (revengeOf) p = markRevenged(p, revengeOf);
    commit(p);
    clearPending();
    setPendingAttack(null);
    return out.win?.trophies ?? 0;
  };
  // Не отправленный из-за связи набег: повторяем при входе в деревню, при появлении сети и по кнопке.
  const [pendingAttack, setPendingAttack] = useState<PendingAttack | null>(() => loadPending());
  const retrying = useRef(false);
  const retryPending = async () => {
    const a = loadPending();
    if (!a || retrying.current) return;
    retrying.current = true;
    try {
      const out = await submitWithRetry(a, undefined, 2);
      const cups = applyOutcome(out, a.revengeOf);
      const text = t('Набег засчитан: {0}{1} кубков{2}.', { 0: cups >= 0 ? '+' : '−', 1: Math.abs(cups), 2: out.win ? t(', добыча в хранилище') : '' });
      flash(text);
      setPvpNote((n) => (n ? text : n));
    } catch (e) {
      if (!isTransient(e)) {
        // Сервер отказал окончательно: если бой всё же засчитан, победа придёт с журналом набегов.
        clearPending();
        setPendingAttack(null);
        flash(e instanceof PvpError ? e.message : t('Набег не засчитан.'));
      } else flash(t('{0}. Попробуем ещё раз позже.', { 0: NO_SERVER }));
    } finally {
      retrying.current = false;
    }
  };
  useEffect(() => {
    if (pendingAttack) void retryPending();
    const on = () => loadPending() && void retryPending();
    window.addEventListener('online', on);
    const id = window.setInterval(on, 30_000);
    return () => {
      window.removeEventListener('online', on);
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Связь с сервером — проверяем, когда открыт выбор набега: чтобы знать до боя, засчитается ли он.
  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const checkServer = () => {
    setServerOk(null);
    void pingServer().then(setServerOk);
  };
  useEffect(() => {
    if (sheet === 'attack') checkServer();
  }, [sheet, online]);

  // Набег на игрока: поиск (или месть), бронь цели и бой. Без сети — только лагеря Князя.
  const startPvp = async (revengeOf?: string) => {
    if (!isOnline()) return flash(OFFLINE);
    if (searching) return;
    setSearching(true);
    let error: string | null = null;
    await cover(t('Ищем соперника'), async () => {
      try {
        const target = revengeOf ? await revengeTarget(revengeOf) : await findTarget();
        setSheet(null);
        setPvpNote(null);
        setBattle({ kind: 'pvp', target, revengeOf });
      } catch (e) {
        error = e instanceof PvpError ? e.message : t('Соперник не нашёлся. Попробуй позже.');
      }
    });
    setSearching(false);
    if (error) flash(error);
  };
  // Домой из боя — тоже через облака.
  const leaveBattle = () => void cover(t('Возвращаемся домой'), () => setBattle(null));
  const pvp = v.pvp ?? {};
  const trophies = pvp.trophies ?? 0;
  const league = villageLeague(trophies);
  const shieldLeft = Math.max(0, (pvp.shieldUntil ?? 0) - now);

  const views = useMemo<ViewBld[]>(() => town.b.map((b) => ({ i: b.i, t: b.t, x: b.x, y: b.y, l: b.l, state: b.l === 0 ? 'new' : b.u != null ? 'up' : 'ok' })), [town.b]);
  // Без useMemo при переносе постройки сцена собиралась бы заново каждую секунду (тикает таймер).
  const movingId = placing?.id;
  const shown = useMemo(() => (movingId != null ? views.filter((b) => b.i !== movingId) : views), [views, movingId]);
  // Украшения: переносимое прячем, пока его двигают (его рисует призрак).
  const decorAll = v.decor;
  const movingDecor = placing?.did;
  const decorShown = useMemo(() => (decorAll ?? []).filter((d) => d.i !== movingDecor), [decorAll, movingDecor]);
  const theme = v.theme ?? 'classic';
  const statueHero = itemById(progress.equipped).hero;
  const bubbles = town.b
    .filter((b) => BUILDINGS[b.t].collector && b.l >= 1 && accrued(b, now) >= Math.max(5, BUILDINGS[b.t].collector!.perHour[b.l - 1] * 0.5))
    .map((b) => ({ i: b.i, res: BUILDINGS[b.t].collector!.res }));
  const labels = town.b.filter((b) => b.u != null).map((b) => ({ i: b.i, text: fmtTime((b.u! - now) / 1000), color: '#ffd27a' }));
  const sel = selected != null ? town.b.find((b) => b.i === selected) : undefined;

  if (!hasTown(progress))
    return (
      <div className="vil-found">
        <div className="vil-found-card">
          <Portrait line={say('boris', '')} size={84} />
          <h1>{t('Своя деревня')}</h1>
          <p className="muted">
            {t('Тренировка даёт заряд, в подземелье он превращается в дерево, камень и золото — а здесь из них растёт деревня. Ратуша, лесопилки, кузница и')}
            {t('таверна помогают герою в походах, а башни и стены защищают от лентяев Князя Дивана.')}
          </p>
          <button className="primary" onClick={() => commit(foundTown(latest.current, Date.now()))}>
            <House16 /> {t('Основать деревню')}
          </button>
          <small className="muted">{t('Старт: +300 дерева, +300 камня, +150 золота')}</small>
        </div>
      </div>
    );

  if (battle) {
    const heroLvl = heroLevel(heroXp(progress)).level;
    const item = itemById(progress.equipped);
    const heroLook: HeroLook = { ...outfitLook(item), hands: heroHands(progress) };
    const army: BattleArmy =
      battle.kind === 'replay'
        ? battle.entry.army
        : { troops: town.army, level: Math.max(1, barracksLevel(town)), lv: troopLevels(town), hero: battle.kind === 'pvp' ? Math.min(heroLvl, battle.target.heroMax ?? heroLvl) : heroLvl };
    const finish = async (r: BattleResult, deploys: Deploy[], endTick?: number) => {
      if (battle.kind === 'replay') return;
      if (battle.kind === 'pvp') {
        // Добыча и кубки — только по ответу сервера: он сам считает этот же бой.
        const tm = battle.target;
        const sub: PendingAttack = { targetId: tm.id, token: tm.token, seed: tm.seed, army, deploys, endTick, at: Date.now(), revengeOf: battle.revengeOf };
        setPvpNote(t('Сервер проверяет набег…'));
        try {
          const out = await submitWithRetry(sub, (k) => setPvpNote(t('Связь с сервером прерывается — отправляем ещё раз ({0}/4)…', { 0: k + 1 })));
          const same = RES_KEYS.every((k) => out.result.loot[k] === r.loot[k]);
          const cups = applyOutcome(out, battle.revengeOf);
          setPvpNote(
            <>
              <span className={cups >= 0 ? 'ok' : 'bad'}>
                {cups >= 0 ? '+' : '−'}
                {Math.abs(cups)} <Trophy size={14} />
              </span>{' '}
              · {t('сервер подтвердил')}{!same && <> {t('· добыча:')} <ResRow res={out.result.loot} plus /></>}
            </>,
          );
        } catch (e) {
          if (isTransient(e)) {
            // Бой сохранён на телефоне: отправим, как только связь вернётся (сервер ждёт ещё 15 минут).
            savePending(sub);
            setPendingAttack(sub);
            setPvpNote(
              <span className="bad">
                {t('{0}. Итог боя сохранён на телефоне — засчитаем добычу и кубки, как только связь вернётся.', { 0: NO_SERVER })}{' '}
                <button className="small-btn accent" onClick={() => void retryPending()}>
                  {t('Отправить ещё раз')}
                </button>
              </span>,
            );
          } else setPvpNote(<span className="bad">{t('{0} Добыча не засчитана, войско цело.', { 0: e instanceof PvpError ? e.message : t('Набег не засчитан.') })}</span>);
        }
        return;
      }
      const res = r;
      const tm = townOf(latest.current);
      const left = { ...tm.army };
      for (const id of TROOP_IDS) left[id] = Math.max(0, (left[id] ?? 0) - (res.used[id] ?? 0));
      let p = withTown(latest.current, { ...tm, army: left, res: addRes(tm.res, res.loot) });
      if (battle.kind === 'camp') {
        const vv = villageOf(p);
        p = { ...p, village: { ...vv, camps: { ...vv.camps, [battle.camp.id]: Math.max(vv.camps?.[battle.camp.id] ?? 0, res.stars) } } };
      }
      commit(p);
    };
    if (battle.kind === 'camp') {
      const c = battle.camp;
      const repeat = (v.camps?.[c.id] ?? 0) > 0;
      const loot = repeat ? scaleRes(c.loot, CAMP_REPEAT_SHARE) : c.loot;
      return inBattle(<BattleScreen heroLook={heroLook} title={c.name} base={campBase(c)} loot={loot} seed={c.id * 7919 + (v.camps?.[c.id] ?? 0)} army={army} mode="attack" enemy onFinish={finish} onClose={leaveBattle} />);
    }
    if (battle.kind === 'pvp') {
      const tm = battle.target;
      const offer = tm.offer;
      return inBattle(
        <BattleScreen
          key={tm.token ?? tm.id}
          heroLook={heroLook}
          title={t('{0}, ратуша {1}', { 0: tm.name, 1: tm.level })}
          note={
            <>
              {!online && <span className="bad">{t('Нет сети — итог отправим, когда она вернётся ·')} </span>}
              {tm.revenge ? t('Месть · ') : tm.bot ? t('Деревня-бот · ') : ''}
              <Trophy size={12} /> {tm.trophies ?? 0}
              {offer && (
                <>
                  {' '}
                  {t('· победа +{0}, без звёзд −{1}', { 0: offer.win, 1: offer.loss })}
                </>
              )}
            </>
          }
          resultNote={pvpNote}
          base={tm.layout}
          loot={tm.lootAvailable}
          seed={tm.seed}
          army={army}
          mode="attack"
          enemy
          scout={tm.token ? SCOUT_SECONDS : undefined}
          onSkip={battle.revengeOf ? undefined : () => void startPvp()}
          skipBusy={searching}
          onFinish={finish}
          onClose={leaveBattle}
        />,
      );
    }
    const e = battle.entry;
    return inBattle(<BattleScreen heroLook={heroLook} title={e.who} base={{ ...unpackBase(e.base ?? []), hero: e.hero }} loot={lootOf(e)} seed={e.seed} army={e.army} mode="replay" deploys={e.deploys} endTick={e.endTick} enemy={false} onClose={leaveBattle} />);
  }

  const tap = (x: number, y: number) => {
    if (placing) {
      const s = sizeOf(placing.t);
      return setPlacing({ ...placing, x: clampCell(Math.floor(x - s / 2 + 0.5), s), y: clampCell(Math.floor(y - s / 2 + 0.5), s) });
    }
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const b = town.b.find((v) => cx >= v.x && cx < v.x + sizeOf(v.t) && cy >= v.y && cy < v.y + sizeOf(v.t));
    if (!b) {
      setSelected(null);
      const d = decorAt(decorShown, cx, cy);
      setSelDecor(d ? d.i : null);
      if (d) sfx('tap');
      return;
    }
    sfx('tap');
    pick(b);
  };
  // Открыть карточку постройки и подвести к ней камеру.
  const pick = (b: Bld) => {
    setSelDecor(null);
    setSelected(b.i);
    const s = sizeOf(b.t);
    // Отклик: постройка пружинит, по земле расходится кольцо.
    pulse(b.i, 'tap');
    if (getSettings().villageFx) emitFx('tap', b.x + s / 2 - GRID / 2, b.y + s / 2 - GRID / 2, s, '#ffe6b0');
    focusOn(ctl.current, b.x + s / 2 - GRID / 2, b.y + s / 2 - GRID / 2, window.innerHeight);
  };

  // Урожай собирается тапом по пузырю над постройкой; тап по самой постройке открывает её карточку.
  const harvest = (i: number, x?: number, y?: number) => {
    const r = collect(townOf(latest.current), i, Date.now());
    if (r.got > 0) {
      commit(withTown(latest.current, r.town));
      sfx('coin');
      const b = townOf(latest.current).b.find((v) => v.i === i);
      if (b) {
        const s = sizeOf(b.t);
        pulse(i, 'collect');
        if (getSettings().villageFx && r.res) emitFx('coins', b.x + s / 2 - GRID / 2, b.y + s / 2 - GRID / 2, s, RES_COLORS[r.res]);
      }
      if (r.res && x != null && y != null && getSettings().villageFx) flyRef.current?.fly(r.res, x, y, r.got);
      else flash(`+${r.got} ${r.res === 'wood' ? t('дерева') : r.res === 'stone' ? t('камня') : t('золота')}`);
    } else flash(t('Склады полны: построй или улучши склад.'));
  };

  // Постройки не встают на украшения: украшение для сетки — занятая клетка.
  const occ = occupied(town, decorAll ?? []);
  const startPlacing = (tm: BuildingType) => {
    const near = { x: GRID / 2 + ctl.current.tx, y: GRID / 2 + ctl.current.tz };
    const spot = freeSpot(occ, tm, near) ?? { x: 0, y: 0 };
    setSheet(null);
    setSelected(null);
    setSelDecor(null);
    setPlacing({ t: tm, ...spot });
  };
  const startDecor = (k: DecorKind, did?: number) => {
    const d = did != null ? decorAll?.find((x) => x.i === did) : undefined;
    const near = { x: GRID / 2 + ctl.current.tx, y: GRID / 2 + ctl.current.tz };
    const spot = d ? { x: d.x, y: d.y } : (freeDecorSpot(town, decorAll ?? [], near) ?? { x: 0, y: 0 });
    setSheet(null);
    setSelected(null);
    setSelDecor(null);
    setPlacing({ t: 'wall', decor: k, did, ...spot });
  };
  const placeOk = placing ? (placing.decor ? canPlaceDecor(town, decorAll ?? [], placing.x, placing.y, placing.did) : canPlace(occ, placing.t, placing.x, placing.y, placing.id)) : false;
  const confirmPlace = () => {
    if (!placing) return;
    if (placing.decor) {
      if (placing.did != null) {
        const r = moveDecor(latest.current, placing.did, placing.x, placing.y);
        if (!r) return flash(DECOR_ERRORS.place);
        commit(r);
        return setPlacing(null);
      }
      const r = placeDecor(latest.current, placing.decor, placing.x, placing.y, decorCtx(latest.current, Date.now()));
      if (typeof r === 'string') return flash(DECOR_ERRORS[r]);
      commit(r);
      sfx('coin');
      // Дорожки и кусты удобно ставить подряд: следующая клетка сразу рядом.
      const k = placing.decor;
      const left = decorOf(r).filter((d) => d.k === k).length < DECOR[k].max(th);
      if (left && (k === 'path' || k === 'bush' || k === 'flowers')) {
        const t2 = townOf(r);
        const list = decorOf(r);
        const nx = { x: placing.x + 1, y: placing.y };
        setPlacing({ ...placing, ...(canPlaceDecor(t2, list, nx.x, nx.y) ? nx : (freeDecorSpot(t2, list, placing) ?? { x: 0, y: 0 })) });
      } else setPlacing(null);
      return;
    }
    if (placing.id != null) {
      const r = move(townOf(latest.current), placing.id, placing.x, placing.y);
      if (!r) return flash(BUILD_ERRORS.place);
      commit(withTown(latest.current, r));
      return setPlacing(null);
    }
    if (act((tm) => build(tm, placing.t, placing.x, placing.y, Date.now()))) {
      sfx('coin');
      // Стены удобно ставить подряд: следующая секция сразу рядом.
      if (placing.t === 'wall' && countOf(townOf(latest.current), 'wall') < maxCount('wall', th)) {
        const t2 = townOf(latest.current);
        const nx = [placing.x + 1, placing.y];
        const o2 = occupied(t2, decorOf(latest.current));
        setPlacing(canPlace(o2, 'wall', nx[0], nx[1]) ? { t: 'wall', x: nx[0], y: nx[1] } : { t: 'wall', ...(freeSpot(o2, 'wall', { x: placing.x, y: placing.y }) ?? { x: 0, y: 0 }) });
      } else setPlacing(null);
    }
  };

  const tasks = openTasks(progress);
  const tasksReady = tasks.filter((tm) => taskDone(progress, tm)).length;
  const builders = buildersAt(th);
  const busy = busyBuilders(town);
  // Советы строителя и стрелки над тем, что можно улучшить сейчас.
  const advice = builderAdvice(town);
  const adviceOk = adviceCount(advice);
  const ups = upgradeNow(advice);
  const bonus = villageBonus(town.b);
  const queue = town.q;

  return (
    <div className="vil-screen">
      <ViewHost
        slot={viewSlot}
        props={{ ctl, buildings: shown, selected: selected ?? undefined, ghost: placing ? { t: placing.t, x: placing.x, y: placing.y, ok: placeOk, id: placing.id, decor: placing.decor } : null, decor: decorShown, theme, clanFlag: v.clanFlag, statueHero, grid: !!placing, bubbles: placing ? [] : bubbles, ups: placing ? [] : ups, labels: placing ? [] : labels, onTap: tap, onBubble: harvest, onGhost: (x, y) => placing && setPlacing({ ...placing, x: clampCell(x, sizeOf(placing.t)), y: clampCell(y, sizeOf(placing.t)) }) }}
      />

      <div className="vil-top vil-hud">
        <div className="hud-left">
          <div className="hud-th">
            <span className="hud-th-emblem">
              <svg viewBox="0 0 40 44" aria-hidden="true">
                <path d="M20 2l16 5v13c0 10-7 18-16 22C11 38 4 30 4 20V7z" fill="#2b3350" stroke="#8f98b0" strokeWidth="2.5" />
                <path d="M20 7l11 3.5v9.5c0 7-4.8 12.8-11 15.6-6.2-2.8-11-8.6-11-15.6v-9.5z" fill="#ff8a5c" opacity=".9" />
              </svg>
              <b>{th}</b>
            </span>
            <span className="hud-th-text">
              <b>{t('Ратуша')}</b>
              <small>{t('деревня героя')}</small>
            </span>
          </div>
          <div className="hud-chips">
            <button className="hud-chip" onClick={() => setSheet('top')} aria-label={t('Топ деревень')}>
              <span style={{ color: league.color, display: 'inline-flex' }}>
                <Trophy size={15} />
              </span>
              {trophies}
              <small>{league.name}</small>
            </button>
            <button className={`hud-chip ${busy >= builders ? 'empty' : ''}`} onClick={() => setSheet('advice')} aria-label={t('Советы строителя')}>
              <Hammer />
              {builders - busy}/{builders}
              {adviceOk > 0 && busy < builders && <span className="hud-badge">{adviceOk > 9 ? '9+' : adviceOk}</span>}
            </button>
            {shieldLeft > 0 && (
              <span className="hud-chip mint" title={t('Щит: на деревню нельзя напасть')}>
                <Shield size={14} />
                {fmtTime(shieldLeft / 1000)}
              </span>
            )}
          </div>
        </div>
        <div className="hud-right">
          {RES_KEYS.map((k) => (
            <ResBar key={k} k={k} value={town.res[k]} cap={cap} ref={(el) => void (barEls.current[k] = el)} />
          ))}
          <ResBar k="charge" value={charge} cap={CHARGE_MAX} ref={(el) => void (barEls.current.charge = el)} />
        </div>
      </div>

      <div className="vil-side vil-hud">
        <button className="vil-round" onClick={() => setSheet('tasks')} aria-label={t('Задания')}>
          <Scroll />
          {tasksReady > 0 && <i className="vil-badge">{tasksReady}</i>}
        </button>
        <button className="vil-round" onClick={() => setSheet('log')} aria-label={t('Журнал обороны')}>
          <Shield />
        </button>
        {onDungeon && (
          <button className="vil-round accent" onClick={onDungeon} aria-label={t('В подземелье')}>
            <Dungeon />
          </button>
        )}
      </div>
      <FlyLayer ref={flyRef} bars={barEls} />
      <VillageMusic tavern={town.b.some((b) => b.t === 'tavern' && b.l >= 1)} />
      <Curtain phase={curtain.phase} text={curtain.text} />

      {toast && <div className="toast vil-warn">{toast}</div>}

      {placing ? (
        <div className="vil-bottom">
          <div className="vil-card compact">
            <div className="vil-card-head">
              <b>{placing.decor ? `${placing.did != null ? t('Перенос') : t('Украшение')}: ${DECOR[placing.decor].name}` : `${placing.id != null ? t('Перенос') : t('Новая постройка')}: ${BUILDINGS[placing.t].name}`}</b>
              <span className={placeOk ? 'ok' : 'bad'}>{placeOk ? t('место свободно') : t('место занято')}</span>
            </div>
            <div className="muted">
              {t('Двигай {0} пальцем или коснись земли.', { 0: placing.decor ? t('украшение') : t('постройку') })}
              {placing.decor ? placing.did == null && RES_KEYS.some((k) => (DECOR[placing.decor!].cost[k] ?? 0) > 0) && <> {t('Цена:')} <ResRow res={DECOR[placing.decor].cost} /></> : placing.id == null && <> {t('Цена:')} <ResRow res={costOf(placing.t, 1)} /></>}
            </div>
            <div className="vil-actions">
              <button className="secondary" onClick={() => setPlacing(null)}>
                {t('Отмена')}
              </button>
              <button className="primary" disabled={!placeOk} onClick={confirmPlace}>
                <Check /> {placing.id != null || placing.did != null ? t('Сюда') : placing.decor ? t('Поставить') : t('Построить')}
              </button>
            </div>
          </div>
        </div>
      ) : selDecor != null && decorShown.some((d) => d.i === selDecor) ? (
        <div className="vil-bottom">
          {(() => {
            const d = decorShown.find((x) => x.i === selDecor)!;
            const def = DECOR[d.k];
            return (
              <div className="vil-card compact">
                <div className="vil-card-head">
                  <b>{def.name}</b>
                  <span className="level-tag">{t('украшение')}</span>
                  <button className="link" onClick={() => setSelDecor(null)} aria-label={t('Закрыть')}>
                    <Cross />
                  </button>
                </div>
                <div className="muted">{def.desc}</div>
                <div className="vil-actions">
                  <button className="secondary icon-btn" onClick={() => startDecor(d.k, d.i)} aria-label={t('Переместить')}>
                    <Move />
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      commit(removeDecor(latest.current, d.i));
                      setSelDecor(null);
                      flash(RES_KEYS.some((k) => (def.cost[k] ?? 0) > 0) ? t('Убрали. Ресурсы вернулись в запасы.') : t('Убрали.'));
                    }}
                  >
                    {t('Убрать')}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      ) : sel ? (
        <div className="vil-bottom">
          <BuildingCard
            b={sel}
            town={town}
            now={now}
            charge={charge}
            onClose={() => setSelected(null)}
            onUpgrade={() => act((tm) => upgrade(tm, sel.i, Date.now()), sel.t === 'wall' ? t('Стена укреплена!') : isTrap(sel.t) ? t('Ловушка стала сильнее!') : t('Строители взялись за дело!')) && sfx('coin')}
            onSpeed={() => {
              const n = speedUpCharge(sel, Date.now());
              const p = spendCharge(latest.current, n);
              if (!p) return flash(t('Не хватает заряда — потренируйся!'));
              commit(withTown(p, finishNow(townOf(p), sel.i, Date.now())));
              sfx('levelup');
            }}
            onMove={() => setPlacing({ t: sel.t, x: sel.x, y: sel.y, id: sel.i })}
            onCollect={() => {
              const r = collect(townOf(latest.current), sel.i, Date.now());
              if (r.got <= 0) return flash(accrued(sel, now) > 0 ? t('Склады полны: построй или улучши склад.') : t('Пока пусто.'));
              commit(withTown(latest.current, r.town));
              sfx('coin');
              const s = sizeOf(sel.t);
              pulse(sel.i, 'collect');
              if (getSettings().villageFx && r.res) emitFx('coins', sel.x + s / 2 - GRID / 2, sel.y + s / 2 - GRID / 2, s, RES_COLORS[r.res]);
            }}
            onArmy={() => setSheet('army')}
            onLab={() => setSheet('lab')}
            onAttack={() => setSheet('attack')}
          />
        </div>
      ) : (
        <div className="vil-bottom">
          <div className="vil-dock">
            <button className="vil-dock-btn" onClick={() => setSheet('build')}>
              <Hammer size={22} />
              {t('Строить')}
            </button>
            <button className="vil-dock-btn" onClick={() => setSheet('army')}>
              <span className="vil-army-n">{troopCount(town.army)}</span>
              {t('Войско')}{queue.length ? <small>+{queue.length}</small> : null}
            </button>
            <button className="vil-dock-btn accent" onClick={() => setSheet('attack')}>
              <Swords />
              {t('Набег')}
            </button>
          </div>
          {(bonus.damage > 0 || bonus.lives > 0 || bonus.coins > 0) && (
            <div className="vil-bonus muted">
              {t('Деревня помогает герою:')} {[bonus.damage && t('+{0}% урона', { 0: Math.round(bonus.damage * 100) }), bonus.lives && t('+{0} {1}', { 0: bonus.lives, 1: bonus.lives > 1 ? t('жизни') : t('жизнь') }), bonus.coins && t('+{0}% монет', { 0: Math.round(bonus.coins * 100) })].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      )}

      {sheet === 'advice' && (
        <Sheet onClose={() => setSheet(null)}>
          <div className="section-title">
            {t('Советы строителя')}
            <span className="muted">
              {t('свободно {0} из {1}', { 0: builders - busy, 1: builders })}
            </span>
          </div>
          <div className="vil-advice-say">
            <Portrait line={say('boris', '')} size={48} />
            <span>{advice.length === 0 ? t('Всё построено и улучшено, что позволяет ратуша. Копи на следующую!') : busy >= builders ? t('Все мои ребята заняты. Вот что сделаем, как освободятся:') : advice.some((a) => a.ok) ? t('Вот что можно сделать прямо сейчас — зелёным:') : t('Пока не хватает запасов. Вот что ближе всего:')}</span>
          </div>
          {advice.slice(0, 10).map((a) => (
            <button
              key={a.kind === 'up' ? `u${a.id}` : `b${a.t}`}
              className={`vil-shop vil-advice ${a.ok ? 'ok' : ''}`}
              onClick={() => {
                if (a.kind === 'build') {
                  if (!a.ok) return flash(BUILD_ERRORS[a.why ?? 'cost']);
                  return startPlacing(a.t);
                }
                const b = town.b.find((x) => x.i === a.id);
                setSheet(null);
                if (b) pick(b);
              }}
            >
              <span className="vil-shop-pic">
                <Preview t={a.t} l={a.kind === 'up' ? a.l : 1} size={56} />
              </span>
              <span className="vil-shop-info">
                <b>{a.kind === 'build' ? t('Построить: {0}', { 0: BUILDINGS[a.t].name }) : t('Улучшить: {0}', { 0: BUILDINGS[a.t].name })}</b>
                <span className="muted">{a.kind === 'build' ? t('есть {0} из {1}', { 0: a.have, 1: a.max }) : t('уровень {0} → {1}', { 0: a.l, 1: a.l + 1 })}{a.why && a.why !== 'cost' ? ` · ${BUILD_ERRORS[a.why].toLowerCase().replace(/\.$/, '')}` : ''}</span>
                <span className="vil-shop-meta">
                  <ResRow res={a.cost} />
                </span>
              </span>
              <span className="vil-advice-go">{a.ok ? (a.kind === 'up' ? '↑' : '+') : ''}</span>
            </button>
          ))}
        </Sheet>
      )}

      {sheet === 'build' && (
        <Sheet onClose={() => setSheet(null)}>
          <div className="section-title">
            {t('Строительство')}
            <span className="muted">
              {t('строители {0}/{1}', { 0: builders - busy, 1: builders })}
            </span>
          </div>
          <div className="tabs small vil-cats">
            {CATS.map((c) => (
              <button key={c} className={c === cat ? 'active' : ''} onClick={(e) => (setCat(c), e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }))}>
                {c === 'decor' ? t('Украшения') : CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
          {cat === 'decor' && (
            <DecorShop
              progress={progress}
              town={town}
              now={now}
              onPick={(k) => startDecor(k)}
              onTheme={(id) => {
                const owned = ownedThemes(latest.current).includes(id);
                if (owned) return commit(setTheme(latest.current, id));
                const r = claimTheme(latest.current, id, Date.now());
                if (r === 'cost') return flash(t('Не хватает золота.'));
                if (r === 'owned') return;
                commit(r);
                sfx('chest');
                flash(t('Тема «{0}» — твоя!', { 0: THEMES[id].name }));
              }}
            />
          )}
          {BUILDING_TYPES.filter((tm) => BUILDINGS[tm].category === cat && tm !== 'townhall').map((tm) => {
            const d = BUILDINGS[tm];
            const have = countOf(town, tm);
            const max = maxCount(tm, th);
            const cost = costOf(tm, 1);
            const locked = max === 0;
            const full = have >= max;
            const can = !locked && !full && affordable(town.res, cost) && (timeOf(tm, 1) === 0 || busy < builders);
            return (
              <button key={tm} className={`vil-shop ${locked ? 'locked' : ''}`} disabled={locked || full} onClick={() => (can ? startPlacing(tm) : flash(!affordable(town.res, cost) ? BUILD_ERRORS.cost : BUILD_ERRORS.builders))}>
                <span className="vil-shop-pic">{sheet === 'build' && <Preview t={tm} l={1} size={64} />}</span>
                <span className="vil-shop-info">
                  <b>{d.name}</b>
                  <span className="muted">{d.desc}</span>
                  <span className="vil-shop-meta">
                    {locked ? (
                      <>
                        <Lock /> {t('ратуша {0}', { 0: thFor(tm, 1) })}
                      </>
                    ) : (
                      <>
                        <ResRow res={cost} />
                        {timeOf(tm, 1) > 0 && (
                          <span>
                            <Timer size={13} /> {fmtTime(timeOf(tm, 1))}
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </span>
                <span className="vil-shop-count">
                  {have}/{max}
                </span>
              </button>
            );
          })}
        </Sheet>
      )}

      {sheet === 'army' && (
        <ArmySheet
          town={town}
          now={now}
          charge={charge}
          onTrain={(id) => act((tm) => {
            const r = train(tm, id, Date.now());
            return typeof r === 'string' ? TRAIN_ERRORS[r] : r;
          })}
          onUntrain={(id) => act((tm) => untrain(tm, id))}
          onSpeed={(n) => {
            const p = spendCharge(latest.current, n);
            if (!p) return flash(t('Не хватает заряда — потренируйся!'));
            const tm = townOf(p);
            commit(withTown(p, { ...tm, q: tm.q.map((q) => ({ ...q, end: Date.now() })) }));
            setNow(Date.now());
          }}
          onClose={() => setSheet(null)}
          onBuild={() => setSheet('build')}
          onLab={() => setSheet('lab')}
        />
      )}

      {sheet === 'lab' && (
        <LabSheet
          town={town}
          now={now}
          charge={charge}
          onResearch={(id) => act((tm) => {
            const r = startResearch(tm, id, Date.now());
            return typeof r === 'string' ? RESEARCH_ERRORS[r] : r;
          }, t('Учёные взялись за дело!')) && sfx('coin')}
          onCancel={() => act((tm) => cancelResearch(tm), t('Исследование отменено, ресурсы вернулись.'))}
          onSpeed={(n) => {
            const p = spendCharge(latest.current, n);
            if (!p) return flash(t('Не хватает заряда — потренируйся!'));
            commit(withTown(p, finishResearchNow(townOf(p), Date.now())));
            setNow(Date.now());
            sfx('levelup');
          }}
          onClose={() => setSheet(null)}
          onBuild={() => setSheet('build')}
        />
      )}

      {sheet === 'attack' && (
        <Sheet onClose={() => setSheet(null)}>
          <div className="section-title">
            {t('Набег')}
            <span className="muted">
              {t('войско {0}/{1}', { 0: housingOf(town.army), 1: armyCap(town) })}
            </span>
          </div>
          {troopCount(town.army) === 0 && <div className="vil-note">{t('Сначала обучи войско в казармах — герой пойдёт с ним.')}</div>}
          <div className={`vil-link ${serverOk === false ? 'bad' : serverOk ? 'ok' : ''}`}>
            <span className="vil-link-dot" />
            <span>
              {serverOk === null ? t('Проверяем связь с сервером…') : serverOk ? t('Сервер на связи: добыча и кубки засчитаются') : t('{0}: набег на игрока сейчас не засчитается', { 0: NO_SERVER })}
            </span>
            {serverOk === false && (
              <button className="small-btn accent" onClick={checkServer}>
                {t('Переподключиться')}
              </button>
            )}
          </div>
          {pendingAttack && (
            <div className="vil-note">
              {t('Прошлый набег ещё не засчитан — нет связи.{0}', { 0: ' ' })}
              <button className="small-btn accent" onClick={() => void retryPending()}>
                {t('Отправить')}
              </button>
            </div>
          )}
          <button className="vil-pvp" disabled={searching || !online || serverOk === false || troopCount(town.army) === 0} onClick={() => void startPvp()}>
            <span className="vil-pvp-icon">
              <Swords size={30} />
            </span>
            <span className="vil-pvp-text">
              <b>{!online ? OFFLINE : searching ? t('Ищем соперника…') : t('Найти соперника')}</b>
              <span>
                {online ? (
                  <>
                    {t('Деревня игрока твоего уровня')} · <Trophy size={12} /> {trophies} {league.name}
                    {shieldLeft > 0 && t(' · набег снимет щит')}
                  </>
                ) : (
                  t('Лагеря Князя Дивана работают и без сети')
                )}
              </span>
            </span>
          </button>
          <div className="section-title">{t('Лагеря Князя Дивана')}</div>
          {CAMPS.map((c, k) => {
            const stars = v.camps?.[c.id] ?? 0;
            const open = th >= c.th && (k === 0 || (v.camps?.[CAMPS[k - 1].id] ?? 0) > 0);
            return (
              <button
                key={c.id}
                className={`vil-camp ${open ? '' : 'locked'}`}
                disabled={!open || troopCount(town.army) === 0}
                onClick={() => {
                  setSheet(null);
                  void cover(t('Идём к лагерю'), () => setBattle({ kind: 'camp', camp: c }));
                }}
              >
                <span className="vil-camp-num">{c.id}</span>
                <span className="vil-shop-info">
                  <b>{c.name}</b>
                  <span className="muted">{open ? c.hint : th < c.th ? t('Нужна ратуша {0}', { 0: c.th }) : t('Сначала разгроми предыдущий лагерь')}</span>
                  <span className="vil-camp-loot">
                    <span>{t('Добыча')}</span> <ResRow res={stars ? scaleRes(c.loot, CAMP_REPEAT_SHARE) : c.loot} />
                  </span>
                </span>
                <span className="vil-stars">
                  {[0, 1, 2].map((s) => (
                    <Star key={s} size={14} className={s < stars ? 'on' : ''} />
                  ))}
                </span>
              </button>
            );
          })}
        </Sheet>
      )}

      {sheet === 'tasks' && (
        <Sheet onClose={() => setSheet(null)}>
          <div className="section-title">
            {t('Просьбы жителей')}
            <span className="muted">
              {(v.tasks ?? []).length}/{TASKS.length}
            </span>
          </div>
          {tasks.length === 0 && <div className="muted">{t('Все просьбы выполнены. Жители счастливы!')}</div>}
          {tasks.map((tm) => {
            const [a, b] = taskProgress(progress, tm);
            const done = a >= b;
            return (
              <div key={tm.id} className="vil-task">
                <Portrait line={say(tm.npc, '')} size={46} />
                <div className="vil-shop-info">
                  <b style={{ color: NPCS[tm.npc].color }}>{NPCS[tm.npc].name}</b>
                  <span>{tm.text}</span>
                  <span className="vil-shop-meta">
                    <ResRow res={tm.reward} plus /> <span className="muted">{a}/{b}</span>
                  </span>
                </div>
                <button
                  className="small-btn"
                  disabled={!done}
                  onClick={() => {
                    const p = claimTask(latest.current, tm.id);
                    if (!p) return;
                    commit(p);
                    sfx('chest');
                    flash(t('Спасибо! Награда в запасах.'));
                  }}
                >
                  {done ? t('Забрать') : <Lock />}
                </button>
              </div>
            );
          })}
        </Sheet>
      )}

      {sheet === 'log' && (
        <Sheet onClose={() => setSheet(null)}>
          <div className="section-title">{t('Журнал обороны')}</div>
          <div className="muted">
            {t('Защищено от набегов: {0} каждого ресурса. Сейчас можно унести:', { 0: fmtNum(Math.floor(cap * 0.25)) })} <ResRow res={lootAvailable(town, now)} />
          </div>
          {!log.length && <div className="vil-note">{t('Набегов пока не было. Князь Диван присматривается…')}</div>}
          {log.map((e) => (
            <div key={e.id ?? e.at} className="vil-task vil-log">
              {e.id ? (
                <span className="vil-foe">
                  <Swords size={22} />
                </span>
              ) : (
                <Portrait line={say('knyaz', '')} size={42} />
              )}
              <div className="vil-shop-info">
                <b>{e.who}</b>
                <span className="muted">
                  {new Date(e.at).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {t('разрушено {0}%', { 0: e.pct })}
                  {e.trophies ? (
                    <span className={e.trophies > 0 ? 'ok' : 'bad'}>
                      {' '}
                      · {e.trophies > 0 ? '+' : '−'}
                      {Math.abs(e.trophies)} <Trophy size={11} />
                    </span>
                  ) : null}
                </span>
                <span className="vil-shop-meta">
                  {RES_KEYS.some((k) => e.loot[k] > 0) ? (
                    <>
                      {t('унесли')} <ResRow res={e.loot} />
                    </>
                  ) : (
                    t('ничего не унесли')
                  )}
                </span>
              </div>
              <span className="vil-stars">
                {[0, 1, 2].map((s) => (
                  <Star key={s} size={13} className={s < e.stars ? 'on bad' : ''} />
                ))}
              </span>
              {((e.deploys && e.base) || canRevenge(e, now)) && (
                <div className="vil-log-actions">
                  {e.deploys && e.base && (
                    <button
                      className="small-btn ghost"
                      onClick={() => {
                        setSheet(null);
                        setBattle({ kind: 'replay', entry: e });
                      }}
                    >
                      {t('Смотреть')}
                    </button>
                  )}
                  {canRevenge(e, now) && (
                    <button className="small-btn accent" disabled={searching || !online || troopCount(town.army) === 0} onClick={() => void startPvp(e.id)}>
                      <Swords size={15} /> {t('Отомстить · {0}', { 0: fmtTime(((e.revengeUntil ?? 0) - now) / 1000) })}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          <label className="toggle-row">
            <div>
              <div className="toggle-title">{t('Бот пишет о нападениях на деревню')}</div>
              <div className="muted">{t('Кто напал, сколько унёс и кнопка «Отомстить». Ночью (22–09 по Москве) не будим — сообщение придёт утром.')}</div>
            </div>
            <input
              type="checkbox"
              className="switch"
              checked={notify ?? true}
              disabled={notify === null || !online || !cloudState()?.telegram}
              onChange={(ev) => {
                const on = ev.target.checked;
                setNotify(on);
                setPvpNotify(on)
                  .then((me) => setNotify(me.notify))
                  .catch(() => setNotify(!on));
              }}
            />
          </label>
        </Sheet>
      )}

      {sheet === 'top' && (
        <Sheet onClose={() => setSheet(null)}>
          <div className="section-title">
            {t('Лучшие деревни')}
            <span className="muted">
              <Trophy size={13} /> {trophies} · {league.name}
            </span>
          </div>
          <div className="vil-leagues">
            {VILLAGE_LEAGUES.map((l) => (
              <span key={l.name} className={l.name === league.name ? 'on' : ''} style={{ color: l.color }}>
                {l.name}
                <small>{l.from}+</small>
              </span>
            ))}
          </div>
          {topErr && <div className="vil-note">{topErr}</div>}
          {!top && !topErr && <div className="muted">{t('Загружаем…')}</div>}
          {top && !top.length && <div className="vil-note">{t('Пока никто не взял ни одного кубка. Будь первым!')}</div>}
          {top?.map((r, k) => (
            <div key={k} className={`vil-top-row ${r.me ? 'me' : ''}`}>
              <span className="vil-top-n">{k + 1}</span>
              <span className="vil-shop-info">
                <b>{r.name}</b>
                <span className="muted">
                  {t('ратуша {0}', { 0: r.th })} · <span style={{ color: villageLeague(r.trophies).color }}>{r.league}</span>
                </span>
              </span>
              <b className="vil-top-cups">
                <Trophy size={14} /> {r.trophies}
              </b>
            </div>
          ))}
        </Sheet>
      )}

      {dialog && (
        <div className="vil-dialog">
          <Dialog
            lines={dialog}
            onDone={() => {
              setDialog(null);
              commit(markRaidsSeen(latest.current, Date.now()));
            }}
          />
        </div>
      )}
    </div>
  );
}

const House16 = () => (
  <svg className="icon" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 11L12 4l8.5 7M5.5 9.5V20h13V9.5M10 20v-5h4v5" />
  </svg>
);

const clampCell = (v: number, s: number) => Math.max(0, Math.min(GRID - s, v));
const addRes = (a: Res, b: Res): Res => ({ wood: a.wood + b.wood, stone: a.stone + b.stone, gold: a.gold + b.gold });
const scaleRes = (r: Res, k: number): Res => ({ wood: Math.floor(r.wood * k), stone: Math.floor(r.stone * k), gold: Math.floor(r.gold * k) });
// Повтор набега считается с той же доступной добычей, что и сам набег.
const lootOf = (e: DefenseEntry): Res => e.avail ?? e.loot;

function BuildingCard({ b, town, now, charge, onClose, onUpgrade, onSpeed, onMove, onCollect, onArmy, onLab, onAttack }: { b: Bld; town: Town; now: number; charge: number; onClose: () => void; onUpgrade: () => void; onSpeed: () => void; onMove: () => void; onCollect: () => void; onArmy: () => void; onLab: () => void; onAttack: () => void }) {
  const d = BUILDINGS[b.t];
  const th = thLevel(town);
  const next = b.l + 1;
  const block = upgradeBlock(town, b.i);
  const maxed = block === 'max';
  const cost = !maxed ? costOf(b.t, next) : null;
  const sp = speedUpCharge(b, now);
  const col = d.collector;
  const lvl = Math.max(1, b.l);
  return (
    <div className="vil-card">
      <div className="vil-card-head">
        <b>{d.name}</b>
        <span className="level-tag">{b.l === 0 ? t('строится') : t('уровень {0}', { 0: b.l })}</span>
        <button className="link" onClick={onClose} aria-label={t('Закрыть')}>
          <Cross />
        </button>
      </div>
      <div className="vil-evo">
        {/* Обе мини-модели в одной рамке — по следующему уровню: видно, как постройка вырастет. */}
        {b.l >= 1 && <Preview t={b.t} l={b.l} size={72} frameL={maxed ? b.l : next} />}
        {!maxed && (
          <>
            {b.l >= 1 && <span className="vil-evo-arrow">→</span>}
            <Preview t={b.t} l={next} size={72} frameL={next} />
          </>
        )}
        <span className="muted">
          {d.desc}
          {!maxed && b.l >= 1 && newPartsAt(b.t, next) && <b className="vil-evo-note"> {t('Уровень {0}: {1}.', { 0: next, 1: newPartsAt(b.t, next) })}</b>}
        </span>
      </div>
      <div className="vil-stats">
        <span>{t('Прочность {0}', { 0: d.hp[lvl - 1] })}</span>
        {col && b.l >= 1 && (
          <span>
            <ResIcon r={col.res} /> {t('{0}/ч · накоплено {1}/{2}', { 0: col.perHour[b.l - 1], 1: accrued(b, now), 2: col.perHour[b.l - 1] * col.capHours })}
          </span>
        )}
        {d.storage && b.l >= 1 && <span>{t('Вмещает {0} каждого', { 0: fmtNum(d.storage[b.l - 1]) })}</span>}
        {d.defense && (
          <span>
            {t('Урон {0} раз в {1} с · дальность {2}', { 0: d.defense.damage[lvl - 1], 1: d.defense.every, 2: d.defense.range })}
          </span>
        )}
        {b.t === 'barracks' && b.l >= 1 && <span>{t('Мест в лагере {0}', { 0: armyCap(town) })}</span>}
        {b.t === 'lab' && b.l >= 1 && <span>{t('Отряды до {0} уровня', { 0: b.l + 1 })}{town.r ? t(' · идёт: {0}', { 0: TROOPS[town.r.t].name }) : ''}</span>}
        {b.t === 'townhall' && <span>{t('Строителей {0}', { 0: buildersAt(th) })}</span>}
      </div>
      {b.u != null ? (
        <div className="vil-actions">
          <span className="vil-timer">
            <Timer size={15} /> {fmtTime((b.u - now) / 1000)}
          </span>
          <button className="primary" disabled={charge < sp} onClick={onSpeed}>
            {t('Ускорить')} <Bolt size={15} /> {sp}
          </button>
        </div>
      ) : (
        <>
          {cost && (
            <div className="vil-next">
              {block === 'th' ? (
                <span className="muted">
                  <Lock /> {t('Уровень {0} — с ратуши {1}', { 0: next, 1: thFor(b.t, next) })}
                </span>
              ) : (
                <>
                  <span className="muted">{t('Уровень {0}:', { 0: next })}</span> <ResRow res={cost} />
                  {timeOf(b.t, next) > 0 && (
                    <span className="muted">
                      <Timer size={13} /> {fmtTime(timeOf(b.t, next))}
                    </span>
                  )}
                </>
              )}
            </div>
          )}
          {b.t === 'townhall' && !maxed && <div className="muted vil-unlocks">{t('Откроет: {0}', { 0: unlocksAt(th + 1) })}</div>}
          <div className="vil-actions">
            {b.t !== 'wall' && (
              <button className="secondary icon-btn" onClick={onMove} aria-label={t('Переместить')}>
                <Move />
              </button>
            )}
            {col && b.l >= 1 && (
              <button className="secondary" onClick={onCollect}>
                {t('Собрать')}
              </button>
            )}
            {b.t === 'barracks' && b.l >= 1 && (
              <button className="secondary" onClick={onArmy}>
                {t('Войско')}
              </button>
            )}
            {b.t === 'lab' && b.l >= 1 && (
              <button className="secondary" onClick={onLab}>
                {t('Исследования')}
              </button>
            )}
            {b.t === 'townhall' && (
              <button className="secondary" onClick={onAttack}>
                {t('Набег')}
              </button>
            )}
            {!maxed && (
              <button className="primary" disabled={!!block && block !== 'cost' && block !== 'builders'} onClick={onUpgrade}>
                <Hammer /> {t('Улучшить')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Что открывает ратуша этого уровня: новые постройки и рост лимитов. */
function unlocksAt(th: number): string {
  const out: string[] = [];
  for (const tm of BUILDING_TYPES) {
    if (tm === 'townhall') continue;
    const now = maxCount(tm, th - 1);
    const then = maxCount(tm, th);
    if (now === 0 && then > 0) out.push(BUILDINGS[tm].name.toLowerCase());
    else if (then > now) out.push(`+${then - now} ${tm === 'wall' ? t('стен') : BUILDINGS[tm].name.toLowerCase()}`);
  }
  if (buildersAt(th) > buildersAt(th - 1)) out.push(t('ещё один строитель'));
  out.push(t('уровни построек до {0}', { 0: Math.max(...BUILDING_TYPES.filter((tm) => tm !== 'townhall').map((tm) => levelCap(tm, th))) }));
  return out.join(', ');
}

function ArmySheet({ town, now, charge, onTrain, onUntrain, onSpeed, onClose, onBuild, onLab }: { town: Town; now: number; charge: number; onTrain: (id: TroopId) => void; onUntrain: (id: TroopId) => void; onSpeed: (charge: number) => void; onClose: () => void; onBuild: () => void; onLab: () => void }) {
  const bl = barracksLevel(town);
  const cap = armyCap(town);
  const used = housingOf(town.army) + town.q.reduce((s, q) => s + TROOPS[q.t].housing, 0);
  const lastEnd = town.q.length ? town.q[town.q.length - 1].end : now;
  const sp = town.q.length ? Math.max(1, Math.ceil((lastEnd - now) / 60_000 / 2)) : 0;
  // Карточка отряда поверх казарм.
  const [info, setInfo] = useState<TroopId | null>(null);
  if (info)
    return (
      <TroopSheet
        id={info}
        barracks={bl}
        level={troopLevel(town, info)}
        have={town.army[info] ?? 0}
        queued={town.q.filter((q) => q.t === info).length}
        onTrain={() => onTrain(info)}
        onClose={() => setInfo(null)}
      />
    );
  return (
    <Sheet onClose={onClose}>
      <div className="section-title">
        {t('Казармы')}{bl ? t(' · ур. {0}', { 0: bl }) : ''}
        <span className="muted">
          {t('мест {0}/{1}', { 0: used, 1: cap })}
        </span>
      </div>
      {bl === 0 ? (
        <>
          <div className="vil-note">{t('Сначала построй казармы.')}</div>
          <button className="primary" onClick={onBuild}>
            {t('Строить')}
          </button>
        </>
      ) : (
        <>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${Math.min(100, (used / cap) * 100)}%`, background: 'var(--accent-grad)' }} />
          </div>
          {town.q.length > 0 && (
            <div className="vil-actions">
              <span className="vil-timer">
                <Timer size={15} /> {t('обучение {0} · {1}', { 0: town.q.length, 1: fmtTime((lastEnd - now) / 1000) })}
              </span>
              <button className="primary" disabled={charge < sp} onClick={() => onSpeed(sp)}>
                {t('Ускорить')} <Bolt size={15} /> {sp}
              </button>
            </div>
          )}
          {TROOP_IDS.map((id) => {
            const d = TROOPS[id];
            const locked = bl < d.unlock;
            const queued = town.q.filter((q) => q.t === id).length;
            return (
              <div key={id} className={`vil-task vil-troop-card ${locked ? 'locked' : ''}`} role="button" tabIndex={0} onClick={() => setInfo(id)} aria-label={t('{0}: подробнее', { 0: d.name })}>
                <span className={`vil-troop-pic u-${id}`}>
                  <TroopThumb id={id} size={52} level={troopLevel(town, id)} />
                </span>
                <div className="vil-shop-info">
                  <b>
                    {d.name} {troopLevel(town, id) > 1 && <span className="level-tag">{t('ур. {0}', { 0: troopLevel(town, id) })}</span>} <span className="muted">×{town.army[id] ?? 0}{queued ? ` (+${queued})` : ''}</span>
                  </b>
                  <span className="muted">{locked ? t('Казармы {0} уровня', { 0: d.unlock }) : d.desc}</span>
                  <span className="vil-shop-meta">
                    <ResRow res={d.cost} />
                    <span className="muted">
                      {t('мест {0} · {1}', { 0: d.housing, 1: fmtTime(d.train) })}
                    </span>
                    <span className="vil-more">{t('подробнее ›')}</span>
                  </span>
                </div>
                {queued > 0 && (
                  <button
                    className="small-btn ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUntrain(id);
                    }}
                    aria-label={t('Убрать из очереди')}
                  >
                    −
                  </button>
                )}
                <button
                  className="small-btn"
                  disabled={locked}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTrain(id);
                  }}
                  aria-label={t('Обучить')}
                >
                  {locked ? <Lock /> : '+'}
                </button>
              </div>
            );
          })}
          <button className="vil-lab-link" onClick={onLab}>
            <span>
              <b>{t('Лаборатория')}</b>
              <span className="muted">{labLevel(town) ? (town.r ? t('Идёт исследование: {0}', { 0: TROOPS[town.r.t].name }) : t('Прокачай отряды: +15% за уровень')) : t('Прокачка отрядов — с ратуши 2')}</span>
            </span>
            <span className="vil-more">›</span>
          </button>
          <div className="muted">{t('Герой идёт в каждый набег сам — его сила растёт с твоими тренировками.')}</div>
        </>
      )}
    </Sheet>
  );
}

/** Витрина украшений: темы деревни сверху, украшения по разделам. */
function DecorShop({ progress, town, now, onPick, onTheme }: { progress: Progress; town: Town; now: number; onPick: (k: DecorKind) => void; onTheme: (id: ThemeId) => void }) {
  const ctx = decorCtx(progress, now);
  const v = villageOf(progress);
  const list = v.decor ?? [];
  const cur = v.theme ?? 'classic';
  const th = thLevel(town);
  return (
    <>
      <div className="vil-themes">
        {THEME_IDS.map((id) => {
          const d = THEMES[id];
          const owned = ctx.themes.includes(id);
          const free = inSeason(id, now);
          return (
            <button key={id} className={`vil-theme t-${id} ${cur === id ? 'on' : ''}`} onClick={() => onTheme(id)}>
              <b>{d.name}</b>
              <small>{cur === id ? t('включена') : owned ? t('включить') : free ? t('бесплатно в сезон') : <ResRow res={d.cost} />}</small>
            </button>
          );
        })}
      </div>
      <div className="muted vil-theme-note">{THEMES[cur].desc}{THEME_IDS.filter((id) => THEMES[id].season && !ctx.themes.includes(id)).map((id) => t(' «{0}» бесплатно {1}.', { 0: THEMES[id].name, 1: THEMES[id].season!.label })).join('')}</div>
      {DECOR_GROUPS.map((g) => (
        <Fragment key={g.id}>
          <div className="section-title">{g.name}</div>
          {DECOR_KINDS.filter((k) => DECOR[k].group === g.id).map((k) => {
            const d = DECOR[k];
            const lock = decorLock(k, ctx);
            const have = list.filter((x) => x.k === k).length;
            const max = d.max(th);
            const can = !lock && have < max && affordable(town.res, { wood: 0, stone: 0, gold: 0, ...d.cost });
            return (
              <button key={k} className={`vil-shop ${lock ? 'locked' : ''}`} disabled={!!lock || have >= max} onClick={() => (can ? onPick(k) : undefined)}>
                <span className="vil-shop-pic">
                  <DecorThumb k={k} theme={cur} size={64} />
                </span>
                <span className="vil-shop-info">
                  <b>{d.name}</b>
                  <span className="muted">{lock ?? d.desc}</span>
                  <span className="vil-shop-meta">{lock ? <Lock /> : RES_KEYS.some((r) => (d.cost[r] ?? 0) > 0) ? <ResRow res={d.cost} /> : <span className="ok">{t('бесплатно')}</span>}</span>
                </span>
                <span className="vil-shop-count">
                  {have}/{max}
                </span>
              </button>
            );
          })}
        </Fragment>
      ))}
    </>
  );
}

/** Днём в деревне светлый марш, а вечером и ночью из таверны (если она есть) слышна плясовая. */
function VillageMusic({ tavern }: { tavern: boolean }) {
  const s = useSettings();
  const [hour, setHour] = useState(() => nowSky().hour);
  useEffect(() => {
    const id = window.setInterval(() => setHour(nowSky().hour), 60_000);
    return () => clearInterval(id);
  }, []);
  const evening = s.dayNight && skyAt(hour).lamps > 0.5;
  useMusic(tavern && evening ? 'tavern' : 'village', 1);
  return null;
}

/** Набег, защита и повтор боя — боевая тема. */
function BattleMusic() {
  useMusic('battle', 2);
  return null;
}
