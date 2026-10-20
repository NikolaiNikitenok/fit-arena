import { useEffect, useMemo, useRef, useState } from 'react';
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
  lootAvailable,
} from '../../shared/village';
import { armyCap, BattleArmy, BattleResult, barracksLevel, Deploy, housingOf, train, TRAIN_ERRORS, TROOP_IDS, TROOPS, TroopId, untrain } from '../../shared/villageBattle';
import { campBase, CAMP_REPEAT_SHARE, CAMPS, Camp } from '../../shared/villageCamps';
import { sfx } from '../audio';
import { Check, Cross, Lock, Shield, Swords, Timer } from '../icons';
import { Dialog, Portrait } from '../game/Dialog';
import type { Line } from '../game/levels';
import { NPCS } from '../game/npcs';
import { heroLevel, heroXp, Progress, saveProgress } from '../game/progress';
import { spendCharge, villageOf } from '../game/resources';
import { BattleScreen, ResIcon, ResRow } from './BattleScreen';
import { Bolt, Dungeon, Hammer, Move, Plus, Scroll, Star } from './icons';
import { defenseLog, findTarget, submitAttack, TargetView } from './pvpApi';
import { dueRaid, markRaidsSeen, troopCount, unseenRaids } from './raids';
import { fmtNum, fmtTime, foundTown, hasTown, tickTown, townOf, unpackBase, withTown } from './state';
import { claimTask, openTasks, taskDone, taskProgress, TASKS } from './tasks';
import type { DefenseEntry } from './types';
import type { Ctl, ViewBld } from './Village3D';
import { Viewport } from './Viewport';
import './village.css';

interface Props {
  progress: Progress;
  setProgress: (p: Progress) => void;
  // Во время боя нижнее меню прячется.
  onPlaying: (playing: boolean) => void;
  // В подземелье «три в ряд» за ресурсами.
  onDungeon?: () => void;
}

type Sheet = 'build' | 'army' | 'attack' | 'tasks' | 'log' | null;
type Battle =
  | { kind: 'camp'; camp: Camp }
  | { kind: 'pvp'; target: TargetView }
  | { kind: 'replay'; entry: DefenseEntry };
interface Placing {
  t: BuildingType;
  x: number;
  y: number;
  // Переносим уже стоящую постройку.
  id?: number;
}

const say = (npc: keyof typeof NPCS, text: string): Line => ({ who: NPCS[npc].name, text, face: npc, color: NPCS[npc].color });
const CATS: Category[] = ['economy', 'army', 'defense', 'village'];

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
  const [cat, setCat] = useState<Category>('economy');
  const [battle, setBattleState] = useState<Battle | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Line[] | null>(null);
  const [searching, setSearching] = useState(false);
  const ctl = useRef<Ctl>({ tx: 0, tz: 0, zoom: 0 });
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
  const flash = (text: string) => {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), 2400);
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
    const lost = RES_KEYS.filter((k) => e.loot[k] > 0).map((k) => `${fmtNum(e.loot[k])} ${k === 'wood' ? 'дерева' : k === 'stone' ? 'камня' : 'золота'}`);
    setDialog([
      say('knyaz', e.stars ? `Ха-ха! Мои лентяи заглянули к тебе в гости. ${lost.length ? `Унесли ${lost.join(', ')}.` : 'Унести, правда, ничего не смогли.'}` : 'Мои лентяи вернулись ни с чем… Ну ничего, я ещё вернусь!'),
      say('vega', e.stars ? 'Строй башни и стены, а склады спрячут запасы. Повтор набега — в журнале обороны.' : 'Отличная оборона! Повтор набега — в журнале.'),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh.length]);

  const town = townOf(progress);
  const v = villageOf(progress);
  const th = thLevel(town);
  const cap = capacity(town);
  const charge = v.charge;

  const act = (fn: (t: Town) => Town | string, ok?: string) => {
    const r = fn(townOf(latest.current));
    if (typeof r === 'string') return flash(r), false;
    commit(withTown(latest.current, r));
    if (ok) flash(ok);
    return true;
  };

  const views = useMemo<ViewBld[]>(() => town.b.map((b) => ({ i: b.i, t: b.t, x: b.x, y: b.y, l: b.l, state: b.l === 0 ? 'new' : b.u != null ? 'up' : 'ok' })), [town.b]);
  const shown = placing?.id != null ? views.filter((b) => b.i !== placing.id) : views;
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
          <h1>Своя деревня</h1>
          <p className="muted">
            Тренировка даёт заряд, в подземелье он превращается в дерево, камень и золото — а здесь из них растёт деревня. Ратуша, лесопилки, кузница и
            таверна помогают герою в походах, а башни и стены защищают от лентяев Князя Дивана.
          </p>
          <button className="primary" onClick={() => commit(foundTown(latest.current, Date.now()))}>
            <House16 /> Основать деревню
          </button>
          <small className="muted">Старт: +300 дерева, +300 камня, +150 золота</small>
        </div>
      </div>
    );

  if (battle) {
    const heroLvl = heroLevel(heroXp(progress)).level;
    const army: BattleArmy = battle.kind === 'replay' ? battle.entry.army : { troops: town.army, level: Math.max(1, barracksLevel(town)), hero: heroLvl };
    const finish = async (r: BattleResult, deploys: Deploy[], endTick?: number) => {
      if (battle.kind === 'replay') return;
      let res = r;
      if (battle.kind === 'pvp') {
        try {
          res = (await submitAttack({ targetId: battle.target.id, seed: battle.target.seed, army, deploys, endTick })).result;
        } catch {
          flash('Набег не засчитан.');
          return;
        }
      }
      const t = townOf(latest.current);
      const left = { ...t.army };
      for (const id of TROOP_IDS) left[id] = Math.max(0, (left[id] ?? 0) - (res.used[id] ?? 0));
      let p = withTown(latest.current, { ...t, army: left, res: addRes(t.res, res.loot) });
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
      return <BattleScreen title={c.name} base={campBase(c)} loot={loot} seed={c.id * 7919 + (v.camps?.[c.id] ?? 0)} army={army} mode="attack" enemy onFinish={finish} onClose={() => setBattle(null)} />;
    }
    if (battle.kind === 'pvp') {
      const t = battle.target;
      return <BattleScreen title={`${t.name}, ратуша ${t.level}`} base={t.layout} loot={t.lootAvailable} seed={t.seed} army={army} mode="attack" enemy onFinish={finish} onClose={() => setBattle(null)} />;
    }
    const e = battle.entry;
    return <BattleScreen title={e.who} base={unpackBase(e.base ?? [])} loot={lootOf(e)} seed={e.seed} army={e.army} mode="replay" deploys={e.deploys} enemy={false} onClose={() => setBattle(null)} />;
  }

  const tap = (x: number, y: number) => {
    if (placing) {
      const s = sizeOf(placing.t);
      return setPlacing({ ...placing, x: clampCell(Math.floor(x - s / 2 + 0.5), s), y: clampCell(Math.floor(y - s / 2 + 0.5), s) });
    }
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const b = town.b.find((v) => cx >= v.x && cx < v.x + sizeOf(v.t) && cy >= v.y && cy < v.y + sizeOf(v.t));
    if (!b) return setSelected(null);
    // Урожай собирается сразу, по тапу — как в CoC.
    if (BUILDINGS[b.t].collector && b.l >= 1 && accrued(b, now) > 0 && selected !== b.i && bubbles.some((x) => x.i === b.i)) {
      const r = collect(townOf(latest.current), b.i, Date.now());
      if (r.got > 0) {
        commit(withTown(latest.current, r.town));
        sfx('coin');
        flash(`+${r.got} ${r.res === 'wood' ? 'дерева' : r.res === 'stone' ? 'камня' : 'золота'}`);
      } else flash('Склады полны: построй или улучши склад.');
      return;
    }
    sfx('tap');
    setSelected(b.i);
  };

  const startPlacing = (t: BuildingType) => {
    const near = { x: GRID / 2 + ctl.current.tx, y: GRID / 2 + ctl.current.tz };
    const spot = freeSpot(town, t, near) ?? { x: 0, y: 0 };
    setSheet(null);
    setSelected(null);
    setPlacing({ t, ...spot });
  };
  const placeOk = placing ? canPlace(town, placing.t, placing.x, placing.y, placing.id) : false;
  const confirmPlace = () => {
    if (!placing) return;
    if (placing.id != null) {
      const r = move(townOf(latest.current), placing.id, placing.x, placing.y);
      if (!r) return flash(BUILD_ERRORS.place);
      commit(withTown(latest.current, r));
      return setPlacing(null);
    }
    if (act((t) => build(t, placing.t, placing.x, placing.y, Date.now()))) {
      sfx('coin');
      // Стены удобно ставить подряд: следующая секция сразу рядом.
      if (placing.t === 'wall' && countOf(townOf(latest.current), 'wall') < maxCount('wall', th)) {
        const t2 = townOf(latest.current);
        const nx = [placing.x + 1, placing.y];
        setPlacing(canPlace(t2, 'wall', nx[0], nx[1]) ? { t: 'wall', x: nx[0], y: nx[1] } : { t: 'wall', ...(freeSpot(t2, 'wall', { x: placing.x, y: placing.y }) ?? { x: 0, y: 0 }) });
      } else setPlacing(null);
    }
  };

  const tasks = openTasks(progress);
  const tasksReady = tasks.filter((t) => taskDone(progress, t)).length;
  const builders = buildersAt(th);
  const busy = busyBuilders(town);
  const bonus = villageBonus(town.b);
  const queue = town.q;

  return (
    <div className="vil-screen">
      <Viewport ctl={ctl} buildings={shown} selected={selected ?? undefined} ghost={placing ? { t: placing.t, x: placing.x, y: placing.y, ok: placeOk } : null} grid={!!placing} bubbles={placing ? [] : bubbles} labels={placing ? [] : labels} onTap={tap} onGhost={(x, y) => placing && setPlacing({ ...placing, x: clampCell(x, sizeOf(placing.t)), y: clampCell(y, sizeOf(placing.t)) })} />

      <div className="vil-top">
        <div className="vil-res">
          {RES_KEYS.map((k) => (
            <span key={k} className={`pill ${town.res[k] >= cap ? 'full' : ''}`}>
              <ResIcon r={k} />
              {fmtNum(town.res[k])}
              <small>/{fmtNum(cap)}</small>
            </span>
          ))}
        </div>
        <div className="vil-res">
          <span className="pill">
            <span className="vil-charge">
              <Bolt />
            </span>
            {charge}
          </span>
          <span className={`pill ${busy >= builders ? 'empty' : ''}`}>
            <Hammer />
            {builders - busy}/{builders}
          </span>
          <span className="pill">
            <Shield size={15} />
            Ратуша {th}
          </span>
        </div>
      </div>

      <div className="vil-side">
        <button className="vil-round" onClick={() => setSheet('tasks')} aria-label="Задания">
          <Scroll />
          {tasksReady > 0 && <i className="vil-badge">{tasksReady}</i>}
        </button>
        <button className="vil-round" onClick={() => setSheet('log')} aria-label="Журнал обороны">
          <Shield />
        </button>
        {onDungeon && (
          <button className="vil-round accent" onClick={onDungeon} aria-label="В подземелье">
            <Dungeon />
          </button>
        )}
      </div>

      {toast && <div className="toast vil-warn">{toast}</div>}

      {placing ? (
        <div className="vil-bottom">
          <div className="vil-card compact">
            <div className="vil-card-head">
              <b>{placing.id != null ? 'Перенос' : 'Новая постройка'}: {BUILDINGS[placing.t].name}</b>
              <span className={placeOk ? 'ok' : 'bad'}>{placeOk ? 'место свободно' : 'место занято'}</span>
            </div>
            <div className="muted">Двигай постройку пальцем или коснись земли.{placing.id == null && <> Цена: <ResRow res={costOf(placing.t, 1)} /></>}</div>
            <div className="vil-actions">
              <button className="secondary" onClick={() => setPlacing(null)}>
                Отмена
              </button>
              <button className="primary" disabled={!placeOk} onClick={confirmPlace}>
                <Check /> {placing.id != null ? 'Сюда' : 'Построить'}
              </button>
            </div>
          </div>
        </div>
      ) : sel ? (
        <div className="vil-bottom">
          <BuildingCard
            b={sel}
            town={town}
            now={now}
            charge={charge}
            onClose={() => setSelected(null)}
            onUpgrade={() => act((t) => upgrade(t, sel.i, Date.now()), sel.t === 'wall' ? 'Стена укреплена!' : 'Строители взялись за дело!') && sfx('coin')}
            onSpeed={() => {
              const n = speedUpCharge(sel, Date.now());
              const p = spendCharge(latest.current, n);
              if (!p) return flash('Не хватает заряда — потренируйся!');
              commit(withTown(p, finishNow(townOf(p), sel.i, Date.now())));
              sfx('levelup');
            }}
            onMove={() => setPlacing({ t: sel.t, x: sel.x, y: sel.y, id: sel.i })}
            onCollect={() => {
              const r = collect(townOf(latest.current), sel.i, Date.now());
              if (r.got <= 0) return flash(accrued(sel, now) > 0 ? 'Склады полны: построй или улучши склад.' : 'Пока пусто.');
              commit(withTown(latest.current, r.town));
              sfx('coin');
            }}
            onArmy={() => setSheet('army')}
            onAttack={() => setSheet('attack')}
          />
        </div>
      ) : (
        <div className="vil-bottom">
          <div className="vil-dock">
            <button className="vil-dock-btn" onClick={() => setSheet('build')}>
              <Plus />
              Строить
            </button>
            <button className="vil-dock-btn" onClick={() => setSheet('army')}>
              <span className="vil-army-n">{troopCount(town.army)}</span>
              Войско{queue.length ? <small>+{queue.length}</small> : null}
            </button>
            <button className="vil-dock-btn accent" onClick={() => setSheet('attack')}>
              <Swords />
              Набег
            </button>
          </div>
          {(bonus.damage > 0 || bonus.lives > 0 || bonus.coins > 0) && (
            <div className="vil-bonus muted">
              Деревня помогает герою: {[bonus.damage && `+${Math.round(bonus.damage * 100)}% урона`, bonus.lives && `+${bonus.lives} ${bonus.lives > 1 ? 'жизни' : 'жизнь'}`, bonus.coins && `+${Math.round(bonus.coins * 100)}% монет`].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      )}

      {sheet === 'build' && (
        <div className="sheet" onClick={() => setSheet(null)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">
              Строительство
              <span className="muted">
                строители {builders - busy}/{builders}
              </span>
            </div>
            <div className="tabs small">
              {CATS.map((c) => (
                <button key={c} className={c === cat ? 'active' : ''} onClick={() => setCat(c)}>
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
            {BUILDING_TYPES.filter((t) => BUILDINGS[t].category === cat && t !== 'townhall').map((t) => {
              const d = BUILDINGS[t];
              const have = countOf(town, t);
              const max = maxCount(t, th);
              const cost = costOf(t, 1);
              const locked = max === 0;
              const full = have >= max;
              const can = !locked && !full && affordable(town.res, cost) && (timeOf(t, 1) === 0 || busy < builders);
              return (
                <button key={t} className={`vil-shop ${locked ? 'locked' : ''}`} disabled={locked || full} onClick={() => (can ? startPlacing(t) : flash(!affordable(town.res, cost) ? BUILD_ERRORS.cost : BUILD_ERRORS.builders))}>
                  <span className={`vil-swatch b-${t}`} />
                  <span className="vil-shop-info">
                    <b>{d.name}</b>
                    <span className="muted">{d.desc}</span>
                    <span className="vil-shop-meta">
                      {locked ? (
                        <>
                          <Lock /> ратуша {thFor(t, 1)}
                        </>
                      ) : (
                        <>
                          <ResRow res={cost} />
                          {timeOf(t, 1) > 0 && (
                            <span>
                              <Timer size={13} /> {fmtTime(timeOf(t, 1))}
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
          </div>
        </div>
      )}

      {sheet === 'army' && (
        <ArmySheet
          town={town}
          now={now}
          charge={charge}
          onTrain={(id) => act((t) => {
            const r = train(t, id, Date.now());
            return typeof r === 'string' ? TRAIN_ERRORS[r] : r;
          })}
          onUntrain={(id) => act((t) => untrain(t, id))}
          onSpeed={(n) => {
            const p = spendCharge(latest.current, n);
            if (!p) return flash('Не хватает заряда — потренируйся!');
            const t = townOf(p);
            commit(withTown(p, { ...t, q: t.q.map((q) => ({ ...q, end: Date.now() })) }));
            setNow(Date.now());
          }}
          onClose={() => setSheet(null)}
          onBuild={() => setSheet('build')}
        />
      )}

      {sheet === 'attack' && (
        <div className="sheet" onClick={() => setSheet(null)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">
              Набег
              <span className="muted">
                войско {housingOf(town.army)}/{armyCap(town)}
              </span>
            </div>
            {troopCount(town.army) === 0 && <div className="vil-note">Сначала обучи войско в казармах — герой пойдёт с ним.</div>}
            <button
              className="vil-pvp"
              disabled={searching || troopCount(town.army) === 0}
              onClick={async () => {
                setSearching(true);
                try {
                  const target = await findTarget(th);
                  setSheet(null);
                  setBattle({ kind: 'pvp', target });
                } catch {
                  flash('Соперник не нашёлся. Попробуй позже.');
                } finally {
                  setSearching(false);
                }
              }}
            >
              <Swords size={26} />
              <span>
                <b>{searching ? 'Ищем соперника…' : 'Найти соперника'}</b>
                <span className="muted">Деревня другого игрока твоего уровня</span>
              </span>
            </button>
            <div className="section-title">Лагеря Князя Дивана</div>
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
                    setBattle({ kind: 'camp', camp: c });
                  }}
                >
                  <span className="vil-camp-num">{c.id}</span>
                  <span className="vil-shop-info">
                    <b>{c.name}</b>
                    <span className="muted">{open ? c.hint : th < c.th ? `Нужна ратуша ${c.th}` : 'Сначала разгроми предыдущий лагерь'}</span>
                    <span className="vil-shop-meta">
                      <ResRow res={stars ? scaleRes(c.loot, CAMP_REPEAT_SHARE) : c.loot} />
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
          </div>
        </div>
      )}

      {sheet === 'tasks' && (
        <div className="sheet" onClick={() => setSheet(null)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">
              Просьбы жителей
              <span className="muted">
                {(v.tasks ?? []).length}/{TASKS.length}
              </span>
            </div>
            {tasks.length === 0 && <div className="muted">Все просьбы выполнены. Жители счастливы!</div>}
            {tasks.map((t) => {
              const [a, b] = taskProgress(progress, t);
              const done = a >= b;
              return (
                <div key={t.id} className="vil-task">
                  <Portrait line={say(t.npc, '')} size={46} />
                  <div className="vil-shop-info">
                    <b style={{ color: NPCS[t.npc].color }}>{NPCS[t.npc].name}</b>
                    <span>{t.text}</span>
                    <span className="vil-shop-meta">
                      <ResRow res={t.reward} plus /> <span className="muted">{a}/{b}</span>
                    </span>
                  </div>
                  <button
                    className="small-btn"
                    disabled={!done}
                    onClick={() => {
                      const p = claimTask(latest.current, t.id);
                      if (!p) return;
                      commit(p);
                      sfx('chest');
                      flash('Спасибо! Награда в запасах.');
                    }}
                  >
                    {done ? 'Забрать' : <Lock />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sheet === 'log' && (
        <div className="sheet" onClick={() => setSheet(null)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">Журнал обороны</div>
            <div className="muted">
              Защищено от набегов: {fmtNum(Math.floor(cap * 0.25))} каждого ресурса. Сейчас можно унести: <ResRow res={lootAvailable(town, now)} />
            </div>
            {!log.length && <div className="vil-note">Набегов пока не было. Князь Диван присматривается…</div>}
            {log.map((e) => (
              <div key={e.at} className="vil-task">
                <Portrait line={say('knyaz', '')} size={42} />
                <div className="vil-shop-info">
                  <b>{e.who}</b>
                  <span className="muted">
                    {new Date(e.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · разрушено {e.pct}%
                  </span>
                  <span className="vil-shop-meta">
                    {RES_KEYS.some((k) => e.loot[k] > 0) ? (
                      <>
                        унесли <ResRow res={e.loot} />
                      </>
                    ) : (
                      'ничего не унесли'
                    )}
                  </span>
                </div>
                <span className="vil-stars">
                  {[0, 1, 2].map((s) => (
                    <Star key={s} size={13} className={s < e.stars ? 'on bad' : ''} />
                  ))}
                </span>
                {e.deploys && e.base && (
                  <button
                    className="small-btn"
                    onClick={() => {
                      setSheet(null);
                      setBattle({ kind: 'replay', entry: e });
                    }}
                  >
                    Смотреть
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
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

function BuildingCard({ b, town, now, charge, onClose, onUpgrade, onSpeed, onMove, onCollect, onArmy, onAttack }: { b: Bld; town: Town; now: number; charge: number; onClose: () => void; onUpgrade: () => void; onSpeed: () => void; onMove: () => void; onCollect: () => void; onArmy: () => void; onAttack: () => void }) {
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
        <span className="level-tag">{b.l === 0 ? 'строится' : `уровень ${b.l}`}</span>
        <button className="link" onClick={onClose} aria-label="Закрыть">
          <Cross />
        </button>
      </div>
      <div className="muted">{d.desc}</div>
      <div className="vil-stats">
        <span>Прочность {d.hp[lvl - 1]}</span>
        {col && b.l >= 1 && (
          <span>
            <ResIcon r={col.res} /> {col.perHour[b.l - 1]}/ч · накоплено {accrued(b, now)}/{col.perHour[b.l - 1] * col.capHours}
          </span>
        )}
        {d.storage && b.l >= 1 && <span>Вмещает {fmtNum(d.storage[b.l - 1])} каждого</span>}
        {d.defense && (
          <span>
            Урон {d.defense.damage[lvl - 1]} раз в {d.defense.every} с · дальность {d.defense.range}
          </span>
        )}
        {b.t === 'barracks' && b.l >= 1 && <span>Мест в лагере {armyCap(town)}</span>}
        {b.t === 'townhall' && <span>Строителей {buildersAt(th)}</span>}
      </div>
      {b.u != null ? (
        <div className="vil-actions">
          <span className="vil-timer">
            <Timer size={15} /> {fmtTime((b.u - now) / 1000)}
          </span>
          <button className="primary" disabled={charge < sp} onClick={onSpeed}>
            Ускорить <Bolt size={15} /> {sp}
          </button>
        </div>
      ) : (
        <>
          {cost && (
            <div className="vil-next">
              {block === 'th' ? (
                <span className="muted">
                  <Lock /> Уровень {next} — с ратуши {thFor(b.t, next)}
                </span>
              ) : (
                <>
                  <span className="muted">Уровень {next}:</span> <ResRow res={cost} />
                  {timeOf(b.t, next) > 0 && (
                    <span className="muted">
                      <Timer size={13} /> {fmtTime(timeOf(b.t, next))}
                    </span>
                  )}
                </>
              )}
            </div>
          )}
          {b.t === 'townhall' && !maxed && <div className="muted vil-unlocks">Откроет: {unlocksAt(th + 1)}</div>}
          <div className="vil-actions">
            {b.t !== 'wall' && (
              <button className="secondary icon-btn" onClick={onMove} aria-label="Переместить">
                <Move />
              </button>
            )}
            {col && b.l >= 1 && (
              <button className="secondary" onClick={onCollect}>
                Собрать
              </button>
            )}
            {b.t === 'barracks' && b.l >= 1 && (
              <button className="secondary" onClick={onArmy}>
                Войско
              </button>
            )}
            {b.t === 'townhall' && (
              <button className="secondary" onClick={onAttack}>
                Набег
              </button>
            )}
            {!maxed && (
              <button className="primary" disabled={!!block && block !== 'cost' && block !== 'builders'} onClick={onUpgrade}>
                <Hammer /> Улучшить
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
  for (const t of BUILDING_TYPES) {
    if (t === 'townhall') continue;
    const now = maxCount(t, th - 1);
    const then = maxCount(t, th);
    if (now === 0 && then > 0) out.push(BUILDINGS[t].name.toLowerCase());
    else if (then > now) out.push(`+${then - now} ${t === 'wall' ? 'стен' : BUILDINGS[t].name.toLowerCase()}`);
  }
  if (buildersAt(th) > buildersAt(th - 1)) out.push('ещё один строитель');
  out.push(`уровни построек до ${Math.max(...BUILDING_TYPES.filter((t) => t !== 'townhall').map((t) => levelCap(t, th)))}`);
  return out.join(', ');
}

function ArmySheet({ town, now, charge, onTrain, onUntrain, onSpeed, onClose, onBuild }: { town: Town; now: number; charge: number; onTrain: (id: TroopId) => void; onUntrain: (id: TroopId) => void; onSpeed: (charge: number) => void; onClose: () => void; onBuild: () => void }) {
  const bl = barracksLevel(town);
  const cap = armyCap(town);
  const used = housingOf(town.army) + town.q.reduce((s, q) => s + TROOPS[q.t].housing, 0);
  const lastEnd = town.q.length ? town.q[town.q.length - 1].end : now;
  const sp = town.q.length ? Math.max(1, Math.ceil((lastEnd - now) / 60_000 / 2)) : 0;
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
        <div className="section-title">
          Казармы{bl ? ` · ур. ${bl}` : ''}
          <span className="muted">
            мест {used}/{cap}
          </span>
        </div>
        {bl === 0 ? (
          <>
            <div className="vil-note">Сначала построй казармы.</div>
            <button className="primary" onClick={onBuild}>
              Строить
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
                  <Timer size={15} /> обучение {town.q.length} · {fmtTime((lastEnd - now) / 1000)}
                </span>
                <button className="primary" disabled={charge < sp} onClick={() => onSpeed(sp)}>
                  Ускорить <Bolt size={15} /> {sp}
                </button>
              </div>
            )}
            {TROOP_IDS.map((id) => {
              const d = TROOPS[id];
              const locked = bl < d.unlock;
              const queued = town.q.filter((q) => q.t === id).length;
              return (
                <div key={id} className={`vil-task ${locked ? 'locked' : ''}`}>
                  <span className={`vil-unit-big u-${id}`} />
                  <div className="vil-shop-info">
                    <b>
                      {d.name} <span className="muted">×{town.army[id] ?? 0}{queued ? ` (+${queued})` : ''}</span>
                    </b>
                    <span className="muted">{locked ? `Казармы ${d.unlock} уровня` : d.desc}</span>
                    <span className="vil-shop-meta">
                      <ResRow res={d.cost} />
                      <span className="muted">
                        мест {d.housing} · {fmtTime(d.train)}
                      </span>
                    </span>
                  </div>
                  {queued > 0 && (
                    <button className="small-btn ghost" onClick={() => onUntrain(id)} aria-label="Убрать из очереди">
                      −
                    </button>
                  )}
                  <button className="small-btn" disabled={locked} onClick={() => onTrain(id)} aria-label="Обучить">
                    {locked ? <Lock /> : '+'}
                  </button>
                </div>
              );
            })}
            <div className="muted">Герой идёт в каждый набег сам — его сила растёт с твоими тренировками.</div>
          </>
        )}
      </div>
    </div>
  );
}
