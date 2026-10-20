import { useEffect, useRef, useState } from 'react';
import { sfx, useMusic } from '../../audio';
import { getSettings, useSettings } from '../../settings';
import { tg } from '../../telegram';
import { track } from '../../telemetry';
import { Heart, Lock, Swords } from '../../icons';
import type { Theme } from '../../music';
import { CHARGE_MAX, RESOURCE_LABELS, RESOURCES, villageOf, type Resources } from '../resources';
import { heroPower } from '../power';
import { saveProgress, type Progress } from '../progress';
import { Stars } from '../Stars';
import { adjacent, cloneBoard, type Board, hint as findHint, idx, type Pos } from './engine';
import { BoardView, type Effect } from './Board';
import { Bolt, GemIcon, MonsterFace, ResIcon } from './art';
import {
  beginFloor,
  blocksLeft,
  dailyBonusReady,
  DUNGEON_LANDS,
  dungeonOf,
  FLOOR_COST,
  FLOOR_COUNT,
  floorDef,
  floorOpen,
  FLOORS_PER_LAND,
  type FloorDef,
  type FloorReward,
  finishFloor,
  goalLeft,
  goalText,
  iceLeft,
  LAND_COUNT,
  playMove,
  repsToFloor,
  type Run,
  startRun,
} from './dungeon';
import './dungeon.css';

// Подземелье «три в ряд»: список этажей, партия, итог и экран «заряд кончился».
// Экран самостоятельный: его открывает главный экран героя, а может открыть и деревня.

export interface DungeonScreenProps {
  progress: Progress;
  // Прогресс уже сохранён (saveProgress): нужно только показать.
  setProgress: (p: Progress) => void;
  onClose: () => void;
  // Куда отправить за зарядом: тренировка дня, задание дня, программы.
  onTrain?: () => void;
  onDaily?: () => void;
  onPrograms?: () => void;
  // Сразу открыть этот этаж.
  startFloor?: number;
}

type View = { kind: 'list' } | { kind: 'empty'; floor: number } | { kind: 'play' } | { kind: 'result'; reward: FloorReward; run: Run };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const HINT_AFTER_MS = 6000;

function haptic(style: 'light' | 'medium' | 'heavy') {
  if (!getSettings().haptics) return;
  try {
    tg?.HapticFeedback?.impactOccurred(style);
  } catch {
    // Старый клиент.
  }
}

const landTheme = (land: number, boss: boolean): Theme => (boss || land === 9 ? 'castle' : land === 8 ? 'space' : land === 7 ? 'zombie' : 'fantasy');

const ChargePill = ({ charge }: { charge: number }) => (
  <span className={`pill m3-charge ${charge < FLOOR_COST ? 'low' : ''}`}>
    <Bolt size={15} /> {charge}/{CHARGE_MAX}
  </span>
);

const ResRow = ({ res, plus }: { res: Resources; plus?: boolean }) => (
  <span className="m3-res">
    {RESOURCES.map((r) => (
      <span key={r} title={RESOURCE_LABELS[r]}>
        <ResIcon res={r} size={16} /> {plus ? '+' : ''}
        {res[r]}
      </span>
    ))}
  </span>
);

export function DungeonScreen({ progress, setProgress, onClose, onTrain, onDaily, onPrograms, startFloor }: DungeonScreenProps) {
  const d = dungeonOf(progress);
  const v = villageOf(progress);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [picked, setPicked] = useState<FloorDef | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const latest = useRef(progress);
  latest.current = progress;
  useMusic(view.kind === 'play' && run ? landTheme(run.floor.land, run.floor.boss) : 'calm', 1);

  const play = (id: number) => {
    const p = latest.current;
    if (!floorOpen(p, id)) return;
    const next = beginFloor(p, id);
    if (!next) return setView({ kind: 'empty', floor: id });
    setProgress(saveProgress(next));
    track('dungeon_start', id);
    setPicked(null);
    // Своё зерно на каждую попытку: этаж тот же, доска новая.
    setRun(startRun(floorDef(id), heroPower(p).damage, (floorDef(id).seed + dungeonOf(next).plays * 101) >>> 0));
    setView({ kind: 'play' });
  };

  useEffect(() => {
    if (startFloor) play(startFloor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = (r: Run) => {
    const res = finishFloor(latest.current, r, Date.now());
    setProgress(saveProgress(res.progress));
    track(res.reward.won ? 'dungeon_win' : 'dungeon_lose', r.floor.id);
    setTimeout(() => sfx(res.reward.won ? 'win' : 'lose'), 100);
    if (res.reward.won) setTimeout(() => sfx('coin'), 900);
    setView({ kind: 'result', reward: res.reward, run: r });
  };

  if (view.kind === 'play' && run) return <Play key={run.board.rng + run.floor.id} initial={run} charge={v.charge} onFinish={finish} />;

  if (view.kind === 'result') {
    const { reward, run: r } = view;
    const nextId = Math.min(FLOOR_COUNT, r.floor.id + 1);
    const enough = v.charge >= FLOOR_COST;
    return (
      <div className="m3-screen m3-result" style={{ ['--la' as string]: DUNGEON_LANDS[r.floor.land].accent }}>
        <div className={`m3-result-card ${reward.won ? 'won' : 'lost'}`}>
          {r.floor.monster && <MonsterFace shape={r.floor.monster.shape} color={r.floor.monster.color} boss={r.floor.boss} size={84} angry={!reward.won} />}
          <div className="m3-result-tag">
            Этаж {r.floor.id} · {DUNGEON_LANDS[r.floor.land].name}
          </div>
          <h2>{reward.won ? (r.floor.boss ? 'Хранитель повержен!' : 'Этаж пройден!') : r.heroHp <= 0 ? 'Герой отступил' : 'Ходы кончились'}</h2>
          {reward.won ? <div className="m3-result-stars"><Stars n={reward.stars} /></div> : <div className="muted">Половина добычи всё равно твоя. Попробуй ещё раз!</div>}
          <div className="m3-loot">
            {RESOURCES.map((res, i) => (
              <div key={res} className="m3-loot-item" style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
                <ResIcon res={res} size={30} />
                <b>+{reward.loot[res]}</b>
                <span>{RESOURCE_LABELS[res]}</span>
              </div>
            ))}
          </div>
          {reward.won && (
            <div className="m3-result-notes">
              <span>
                Бонус этажа: <ResRow res={reward.bonus} plus />
              </span>
              {reward.daily && (
                <span className="gift">
                  Первая победа дня: <ResRow res={reward.daily} plus />
                </span>
              )}
              {r.maxCombo >= 3 && <span>Лучшее комбо: ×{r.maxCombo}</span>}
            </div>
          )}
          <div className="m3-result-charge">
            <ChargePill charge={v.charge} />
            <span className="muted">в деревне: </span>
            <ResRow res={v.res} />
          </div>
          {reward.won && r.floor.id < FLOOR_COUNT ? (
            <button className="primary" onClick={() => (enough ? play(nextId) : setView({ kind: 'empty', floor: nextId }))}>
              Дальше: этаж {nextId}
              <span className="m3-cost">
                <Bolt size={14} /> {FLOOR_COST}
              </span>
            </button>
          ) : (
            <button className="primary" onClick={() => (enough ? play(r.floor.id) : setView({ kind: 'empty', floor: r.floor.id }))}>
              Ещё раз
              <span className="m3-cost">
                <Bolt size={14} /> {FLOOR_COST}
              </span>
            </button>
          )}
          <button className="secondary" onClick={() => setView({ kind: 'list' })}>
            К этажам
          </button>
        </div>
      </div>
    );
  }

  if (view.kind === 'empty') {
    const need = repsToFloor(progress);
    return (
      <div className="m3-screen">
        <div className="app-head">
          <button className="pill btn" onClick={() => setView({ kind: 'list' })}>
            ‹ Назад
          </button>
          <ChargePill charge={v.charge} />
        </div>
        <div className="m3-empty">
          <div className="m3-empty-bolt">
            <Bolt size={64} />
          </div>
          <h2>Заряд кончился — сделай пару подходов</h2>
          <div className="m3-empty-need">
            Ещё <b>{need}</b> {plural(need, 'повтор', 'повтора', 'повторов')} до этажа {view.floor}
          </div>
          <div className="muted">Каждый повтор = 1 заряд, планка: 2 секунды = 1 заряд. Этаж стоит {FLOOR_COST}, копится до {CHARGE_MAX}.</div>
          <div className="m3-charge-bar">
            <span style={{ width: `${Math.min(100, (v.charge / FLOOR_COST) * 100)}%` }} />
          </div>
          {onDaily && (
            <button className="primary" onClick={onDaily}>
              Задание дня
            </button>
          )}
          {onTrain && (
            <button className="secondary" onClick={onTrain}>
              Тренировка дня
            </button>
          )}
          {onPrograms && (
            <button className="secondary" onClick={onPrograms}>
              Программы Грома
            </button>
          )}
        </div>
      </div>
    );
  }

  // Список этажей: открытые земли и следующая закрытая.
  const nextFloor = floorDef(Math.min(FLOOR_COUNT, d.reached));
  const lands = Array.from({ length: Math.min(LAND_COUNT, nextFloor.land + 2) }, (_, i) => i);
  const bonus = dailyBonusReady(progress, Date.now());
  const L = DUNGEON_LANDS[nextFloor.land];
  return (
    <div className="m3-screen">
      <div className="app-head">
        <button className="pill btn" onClick={onClose}>
          ‹ Назад
        </button>
        <h1>Подземелье</h1>
        <ChargePill charge={v.charge} />
      </div>
      <div className="m3-village-res">
        <span className="muted">Добыто для деревни</span>
        <ResRow res={v.res} />
      </div>

      <button className={`m3-next ${nextFloor.boss ? 'boss' : ''}`} style={{ ['--la' as string]: L.accent, ['--lb' as string]: L.bg }} onClick={() => setPicked(nextFloor)}>
        <span className="m3-next-face">{nextFloor.monster ? <MonsterFace shape={nextFloor.monster.shape} color={nextFloor.monster.color} boss={nextFloor.boss} size={64} /> : <GoalBadge f={nextFloor} size={64} />}</span>
        <span className="m3-next-text">
          <small>
            {L.name} · этаж {nextFloor.num} из {FLOORS_PER_LAND}
          </small>
          <b>{goalText(nextFloor)}</b>
          <small>
            {nextFloor.moves} ходов{bonus ? ' · бонус первой победы дня' : ''}
          </small>
        </span>
        <span className="m3-play-chip">
          <Bolt size={14} /> {FLOOR_COST}
        </span>
      </button>

      {lands.map((land) => {
        const DL = DUNGEON_LANDS[land];
        const ids = Array.from({ length: FLOORS_PER_LAND }, (_, i) => land * FLOORS_PER_LAND + i + 1);
        const stars = ids.reduce((s, id) => s + (d.stars[id] ?? 0), 0);
        const open = floorOpen(progress, ids[0]);
        return (
          <div key={land} className={`m3-land ${open ? '' : 'locked'}`} style={{ ['--la' as string]: DL.accent, ['--lb' as string]: DL.bg }}>
            <div className="m3-land-head">
              <b>
                {!open && <Lock size={13} />} {DL.name}
              </b>
              <span>
                <span className="m3-star">★</span> {stars}/{FLOORS_PER_LAND * 3}
              </span>
            </div>
            <div className="m3-floors">
              {ids.map((id) => {
                const f = floorDef(id);
                const isOpen = floorOpen(progress, id);
                const s = d.stars[id] ?? 0;
                return (
                  <button key={id} className={`m3-floor ${f.boss ? 'boss' : ''} ${isOpen ? '' : 'locked'} ${id === d.reached ? 'current' : ''}`} disabled={!isOpen} onClick={() => setPicked(f)}>
                    {f.boss ? <MonsterFace shape={f.monster!.shape} color={isOpen ? f.monster!.color : '#4a4f63'} boss size={30} /> : <span className="m3-floor-num">{id}</span>}
                    <span className="m3-floor-stars">{isOpen ? [1, 2, 3].map((i) => <i key={i} className={i <= s ? 'on' : ''} />) : <Lock size={10} />}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="muted m3-foot">
        Тренируйся — копи заряд: 1 повтор = 1 <Bolt size={12} />. Этаж — {FLOOR_COST} <Bolt size={12} />. Лучшее комбо: ×{d.bestCombo}, побед: {d.wins}.
      </div>

      {picked && (
        <div className="sheet" onClick={() => setPicked(null)}>
          <div className="sheet-body m3-pick" onClick={(e) => e.stopPropagation()} style={{ ['--la' as string]: DUNGEON_LANDS[picked.land].accent }}>
            <div className="m3-pick-top">
              {picked.monster ? <MonsterFace shape={picked.monster.shape} color={picked.monster.color} boss={picked.boss} size={72} /> : <GoalBadge f={picked} size={72} />}
              <div>
                <div className="m3-result-tag">
                  {DUNGEON_LANDS[picked.land].name} · этаж {picked.id}
                </div>
                <div className="level-title">{goalText(picked)}</div>
                {picked.monster && (
                  <div className="muted">
                    {picked.monster.name}: <Heart size={12} className="heart" /> {picked.monster.hp}, бьёт на {picked.monster.atk} раз в {picked.monster.every} {plural(picked.monster.every, 'ход', 'хода', 'ходов')}
                  </div>
                )}
                <div className="muted">
                  {picked.moves} ходов · <Stars n={d.stars[picked.id] ?? 0} />
                </div>
              </div>
            </div>
            <div className="m3-legend">
              <span>
                <GemIcon kind="wood" /> <GemIcon kind="stone" /> <GemIcon kind="gold" /> ресурсы деревни
              </span>
              <span>
                <GemIcon kind="sword" /> бьют чудовище · <GemIcon kind="heart" /> лечат
              </span>
              <span>4 в ряд — луч, уголок — бомба, 5 в ряд — радуга</span>
            </div>
            <button className="primary" onClick={() => play(picked.id)}>
              {d.stars[picked.id] ? 'Пройти ещё раз' : 'В бой'}
              <span className="m3-cost">
                <Bolt size={14} /> {FLOOR_COST}
              </span>
            </button>
            {v.charge < FLOOR_COST && <div className="muted m3-center">Заряда {v.charge} из {FLOOR_COST}: ещё {repsToFloor(progress)} повторов</div>}
            <button className="link" onClick={() => setPicked(null)}>
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
};

/** Значок цели этажа без чудовища. */
function GoalBadge({ f, size }: { f: FloorDef; size: number }) {
  return (
    <span className={`m3-goal-badge ${f.goal}`} style={{ width: size, height: size }}>
      {f.goal === 'collect' && f.collect ? <ResIcon res={f.collect.res} size={size * 0.6} /> : f.goal === 'ice' ? <span className="m3-ice-glyph" /> : <span className="m3-crate-glyph" />}
    </span>
  );
}

// ---------- Партия ----------

let fxKey = 1;

function Play({ initial, charge, onFinish }: { initial: Run; charge: number; onFinish: (r: Run) => void }) {
  const settings = useSettings();
  const lite = settings.lowPower;
  const [run, setRun] = useState(initial);
  const [shown, setShown] = useState<Board>(initial.board);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Pos | null>(null);
  const [hintPair, setHint] = useState<[Pos, Pos] | null>(null);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [monsterHp, setMonsterHp] = useState(initial.monsterHp);
  const [floats, setFloats] = useState<{ key: number; text: string; cls: string }[]>([]);
  const wrap = useRef<HTMLDivElement>(null);
  const [hurt, setHurt] = useState(0);
  const [hitMonster, setHitMonster] = useState(0);
  const [quit, setQuit] = useState(false);
  const drops = useRef(new Map<number, number>());
  const born = useRef(new Set<number>());
  const alive = useRef(true);
  const busyRef = useRef(false);
  const f = initial.floor;
  const L = DUNGEON_LANDS[f.land];

  useEffect(() => {
    alive.current = true;
    if (f.boss) setTimeout(() => sfx('roar'), 300);
    return () => {
      alive.current = false;
    };
  }, [f.boss]);

  // Подсказка после паузы.
  useEffect(() => {
    if (busy || run.status !== 'play') return;
    setHint(null);
    const t = setTimeout(() => {
      const m = findHint(run.board);
      if (m) setHint([m.a, m.b]);
    }, HINT_AFTER_MS);
    return () => clearTimeout(t);
  }, [busy, run]);

  const addFx = (list: Effect[]) => {
    if (!list.length) return;
    setEffects((e) => [...e, ...list]);
    const keys = new Set(list.map((x) => x.key));
    setTimeout(() => alive.current && setEffects((e) => e.filter((x) => !keys.has(x.key))), 900);
  };
  const addFloat = (text: string, cls: string) => {
    const key = fxKey++;
    setFloats((x) => [...x, { key, text, cls }]);
    setTimeout(() => alive.current && setFloats((x) => x.filter((y) => y.key !== key)), 1100);
  };

  const swap = async (a: Pos, b: Pos) => {
    if (busyRef.current || run.status !== 'play') return;
    busyRef.current = true;
    setBusy(true);
    setSelected(null);
    setHint(null);
    const swapped = cloneBoard(run.board);
    const ia = idx(swapped, a.x, a.y);
    const ib = idx(swapped, b.x, b.y);
    [swapped.cells[ia].gem, swapped.cells[ib].gem] = [swapped.cells[ib].gem, swapped.cells[ia].gem];
    if (!swapped.cells[ia].gem || !swapped.cells[ib].gem) {
      busyRef.current = false;
      setBusy(false);
      return;
    }
    setShown(swapped);
    sfx('tap');
    await wait(150);
    const o = playMove(run, a, b);
    if (!alive.current) return;
    if (!o) {
      // Ход ничего не даёт: самоцветы возвращаются.
      haptic('light');
      setShown(run.board);
      await wait(170);
      busyRef.current = false;
      setBusy(false);
      return;
    }
    let hp = run.monsterHp;
    for (let i = 0; i < o.result.steps.length; i++) {
      const s = o.result.steps[i];
      const fx: Effect[] = s.cleared.map((c) => ({ key: fxKey++, type: 'pop' as const, x: c.x, y: c.y, kind: c.kind, special: c.special }));
      for (const bl of s.blasts) {
        if (bl.kind === 'row' || bl.kind === 'col') fx.push({ key: fxKey++, type: bl.kind, x: bl.x, y: bl.y });
        else if (bl.kind === 'bomb' || bl.kind === 'bigbomb') fx.push({ key: fxKey++, type: 'bomb', x: bl.x, y: bl.y, r: bl.kind === 'bomb' ? 1 : 2 });
        else fx.push({ key: fxKey++, type: 'flash', x: bl.x, y: bl.y, kind: bl.target });
      }
      for (const h of s.blocksHit) fx.push({ key: fxKey++, type: 'break', x: h.x, y: h.y, block: h.kind });
      for (const h of s.iceHit) fx.push({ key: fxKey++, type: 'break', x: h.x, y: h.y, block: 'ice' });
      if (s.combo >= 2) fx.push({ key: fxKey++, type: 'combo', text: s.combo >= 5 ? `Невероятно! ×${s.combo}` : s.combo >= 3 ? `Супер! ×${s.combo}` : `Комбо ×${s.combo}`, big: s.combo >= 3 });
      else if (s.longest >= 5) fx.push({ key: fxKey++, type: 'combo', text: 'Радуга!', big: true });
      addFx(fx);
      for (const c of s.created) born.current.add(c.gem.id);
      setShown(s.mid);
      if (s.blasts.length) {
        sfx('ko');
        haptic('heavy');
      } else if (s.combo >= 2) {
        sfx('combo');
        haptic('medium');
      } else {
        sfx('hit');
        haptic('light');
      }
      if (o.damage[i] > 0) {
        hp = Math.max(0, hp - o.damage[i]);
        setMonsterHp(hp);
        setHitMonster((n) => n + 1);
        addFloat(`−${o.damage[i]}`, 'dmg');
        setTimeout(() => sfx('hurt'), 80);
      }
      await wait(lite ? 170 : 210);
      if (!alive.current) return;
      for (const sp of s.spawned) drops.current.set(sp.id, sp.drop);
      setShown(s.after);
      await wait(lite ? 220 : 260);
      if (!alive.current) return;
    }
    if (o.result.reshuffled) {
      addFx([{ key: fxKey++, type: 'combo', text: 'Ходов нет — перемешиваем', big: false }]);
      await wait(500);
      setShown(o.run.board);
    }
    if (o.healed > 0) addFloat(`+${o.healed}`, 'heal');
    if (o.hit > 0) {
      await wait(120);
      setHurt((n) => n + 1);
      // Тряска доски без перерисовки самоцветов.
      wrap.current?.animate?.([{ transform: 'translate(0,0)' }, { transform: 'translate(-6px,2px)' }, { transform: 'translate(5px,-2px)' }, { transform: 'translate(-3px,1px)' }, { transform: 'translate(0,0)' }], { duration: 380, easing: 'ease-out' });
      addFloat(`−${o.hit}`, 'hurt');
      sfx('ouch');
      haptic('heavy');
    }
    setRun(o.run);
    setShown(o.run.board);
    setMonsterHp(o.run.monsterHp);
    if (o.run.status !== 'play') {
      await wait(o.run.status === 'won' ? 700 : 900);
      if (alive.current) onFinish(o.run);
      return;
    }
    busyRef.current = false;
    setBusy(false);
  };

  const tap = (p: Pos) => {
    if (busyRef.current) return;
    if (selected && adjacent(selected, p)) return void swap(selected, p);
    if (selected && selected.x === p.x && selected.y === p.y) return setSelected(null);
    if (shown.cells[idx(shown, p.x, p.y)].gem) {
      setSelected(p);
      haptic('light');
    }
  };

  const m = f.monster;
  const left = goalLeft(run);
  const telegraph = !!m && run.monsterHp > 0 && run.attackIn === 1;
  return (
    <div className={`m3-play ${f.boss ? 'boss' : ''}`} style={{ ['--la' as string]: L.accent, ['--lb' as string]: L.bg }}>
      <div className="m3-top">
        <button className="pill btn icon-only" onClick={() => setQuit(true)} aria-label="Выйти">
          ×
        </button>
        <div className="m3-top-title">
          <small>{L.name}</small>
          <b>
            Этаж {f.id}
            {f.boss ? ' · хранитель' : ''}
          </b>
        </div>
        <ChargePill charge={charge} />
      </div>

      <div className="m3-hud">
        <div className="m3-hud-main">
          <div className="m3-foe-name">{m && (f.goal === 'monster' || f.goal === 'survive') ? m.name : goalText(f)}</div>
          {m && (f.goal === 'monster' || f.goal === 'survive') ? (
            <div className="m3-bar foe">
              <span style={{ width: `${(monsterHp / run.monsterMax) * 100}%` }} />
              <em>{monsterHp}</em>
            </div>
          ) : (
            <div className="m3-goal-line">
              {f.goal === 'collect' && f.collect && <ResIcon res={f.collect.res} size={18} />}
              {f.goal === 'ice' && <span className="m3-ice-glyph small" />}
              {f.goal === 'crates' && <span className="m3-crate-glyph small" />}
              <b>{f.goal === 'collect' ? `${run.gems[f.collect!.res]} / ${f.collect!.n}` : f.goal === 'ice' ? `осталось ${iceLeft(shown)}` : `осталось ${blocksLeft(shown)}`}</b>
            </div>
          )}
          {m && (
            <div key={hurt} className={`m3-bar hero ${hurt ? 'hurt' : ''}`}>
              <span style={{ width: `${(run.heroHp / run.heroMax) * 100}%` }} />
              <em>
                <Heart size={11} /> {run.heroHp}
              </em>
              {floats.filter((x) => x.cls !== 'dmg').map((x) => (
                <i key={x.key} className={`m3-float ${x.cls}`}>
                  {x.text}
                </i>
              ))}
            </div>
          )}
        </div>
        <div className={`m3-moves ${run.moves <= 3 ? 'low' : ''}`}>
          <b>{f.goal === 'survive' ? left : run.moves}</b>
          <span>{f.goal === 'survive' ? 'продержись' : 'ходов'}</span>
        </div>
      </div>

      <div className="m3-stage">
        <div className={`m3-foe ${telegraph ? 'telegraph' : ''}`}>
          <div key={hitMonster} className={`m3-foe-face ${hitMonster ? 'hit' : ''}`}>
            {m ? <MonsterFace shape={m.shape} color={m.color} boss={f.boss} size={f.boss ? 132 : 112} angry={telegraph} /> : <GoalBadge f={f} size={96} />}
          </div>
          {floats.filter((x) => x.cls === 'dmg').map((x) => (
            <span key={x.key} className="m3-float dmg">
              {x.text}
            </span>
          ))}
        </div>
        {m && run.monsterHp > 0 && (
          <span className={`m3-attack ${telegraph ? 'soon' : ''}`}>
            <Swords size={13} /> {telegraph ? 'Сейчас ударит!' : `Удар через ${run.attackIn} ${plural(run.attackIn, 'ход', 'хода', 'ходов')} · −${m.atk}`}
          </span>
        )}
      </div>

      <div ref={wrap} className="m3-board-wrap">
        <BoardView board={shown} drops={drops.current} born={born.current} effects={effects} selected={selected} hint={hintPair} disabled={busy || run.status !== 'play'} lite={lite} onTap={tap} onSwipe={(a, b) => void swap(a, b)} />
        {telegraph && <div className="m3-warn" />}
      </div>

      <div className="m3-bottom">
        <span className="m3-res-label">Добыча</span>
        <ResRow res={{ wood: Math.round(run.loot.wood), stone: Math.round(run.loot.stone), gold: Math.round(run.loot.gold) }} />
      </div>

      {quit && (
        <div className="sheet" onClick={() => setQuit(false)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            <div className="level-title">Покинуть этаж?</div>
            <div className="muted">Заряд уже потрачен. Уйдёшь — останется половина добычи, как при поражении.</div>
            <button
              className="primary"
              onClick={() => {
                setQuit(false);
                if (busyRef.current) return;
                onFinish({ ...run, status: 'lost' });
              }}
            >
              Уйти с добычей
            </button>
            <button className="secondary" onClick={() => setQuit(false)}>
              Играть дальше
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DungeonScreen;
