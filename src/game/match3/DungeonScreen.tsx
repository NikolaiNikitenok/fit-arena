import { useEffect, useRef, useState } from 'react';
import { type GemSfx, sfx, useMusic } from '../../audio';
import { getSettings, useSettings } from '../../settings';
import { tg } from '../../telegram';
import { track } from '../../telemetry';
import { Heart, Lock, Swords } from '../../icons';
import type { Theme } from '../../music';
import { addCharge, CHARGE_MAX, RESOURCE_LABELS, RESOURCES, villageOf, type Resources } from '../resources';
import { useAdmin } from '../../cloud';
import { heroPower } from '../power';
import { saveProgress, type Progress } from '../progress';
import { Stars } from '../Stars';
import { adjacent, type ClearedGem, cloneBoard, type Board, hint as findHint, idx, type Pos, type Step } from './engine';
import { BoardView, type Effect } from './Board';
import { Bolt, GemIcon, MonsterFace, ResIcon } from './art';
import { Backdrop } from './Backdrop';
import { HowTo, howToSeen } from './HowTo';
import type { LandTheme } from './lands';
import {
  beginFloor,
  blocksLeft,
  checkSavedRun,
  comboMult,
  FINALE_SHARE,
  finaleRun,
  floorMult,
  GEM_YIELD,
  dailyBonusReady,
  dungeonOf,
  FAIL_KEEP,
  FLOOR_COST,
  FLOOR_COUNT,
  MAX_FLOOR,
  floorDef,
  floorOpen,
  FLOORS_PER_LAND,
  type FloorDef,
  type FloorReward,
  finishFloor,
  goalLeft,
  goalText,
  iceLeft,
  landDef,
  playMove,
  repsToFloor,
  restoreRun,
  RUN_TTL,
  type Run,
  type SavedRun,
  startRun,
  storeRun,
  surrenderRun,
} from './dungeon';
import './dungeon.css';
import { Sheet } from '../../Sheet';

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

type View = { kind: 'list' } | { kind: 'empty'; floor: number } | { kind: 'play' } | { kind: 'result'; reward: FloorReward; run: Run; note?: string };

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

// Музыка земли: замок у хранителей и в тронном подвале, космос, «тёмная» тема у лавы.
const musicTheme = (theme: LandTheme, boss: boolean): Theme => (boss || theme === 'throne' ? 'castle' : theme === 'space' ? 'space' : theme === 'lava' ? 'zombie' : 'fantasy');
// Рамка доски: дерево в лесу, погребе и тронном подвале, камень — в остальных землях.
const frameOf = (theme: LandTheme) => (theme === 'forest' || theme === 'cellar' || theme === 'throne' ? 'wood' : theme === 'ice' || theme === 'crystal' ? 'frost' : 'stone');

const ChargePill = ({ charge }: { charge: number }) => (
  <span className={`pill m3-charge ${charge < FLOOR_COST ? 'low' : ''}`}>
    <Bolt size={15} /> {charge}/{CHARGE_MAX}
  </span>
);

const ResRow = ({ res, plus }: { res: Resources; plus?: boolean }) => (
  <span className="m3-res">
    {RESOURCES.map((r) => (
      <span key={r} data-res={r} title={RESOURCE_LABELS[r]}>
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
  const [giveUp, setGiveUp] = useState(false);
  // Земля в середине окна списка (null — текущая), поле «перейти к этажу» и подсказка к нему.
  const [landFocus, setLandFocus] = useState<number | null>(null);
  const [jumpText, setJumpText] = useState('');
  const [jumpMsg, setJumpMsg] = useState<string | null>(null);
  const [howto, setHowto] = useState(false);
  const admin = useAdmin();
  const latest = useRef(progress);
  latest.current = progress;
  // Зерно и время начала идущей партии: пишутся в сохранение вместе с доской.
  const meta = useRef({ seed: 0, startedAt: 0 });
  useMusic(view.kind === 'play' && run ? musicTheme(landDef(run.floor.land).theme, run.floor.boss) : 'calm', 1);
  const saved = d.run;

  const play = (id: number) => {
    let p = latest.current;
    if (!floorOpen(p, id)) return;
    // Новый этаж поверх незаконченного: тот засчитывается поражением.
    const old = p.dungeon?.run && restoreRun(p.dungeon.run);
    if (old) p = surrenderRun(p, old, Date.now()).progress;
    const next = beginFloor(p, id);
    if (!next) return setView({ kind: 'empty', floor: id });
    track('dungeon_start', id);
    setPicked(null);
    // Своё зерно на каждую попытку: этаж тот же, доска новая.
    const seed = (floorDef(id).seed + dungeonOf(next).plays * 101) >>> 0;
    const r = startRun(floorDef(id), heroPower(p).damage, seed);
    meta.current = { seed, startedAt: Date.now() };
    // Сразу в сохранение: закроют приложение до первого хода — этаж не пропадёт.
    setProgress(saveProgress(storeRun(next, r, seed, meta.current.startedAt)));
    setRun(r);
    setView({ kind: 'play' });
  };

  const resume = () => {
    const c = checkSavedRun(latest.current, Date.now());
    if (c.kind !== 'resume') return;
    meta.current = { seed: c.saved.seed, startedAt: c.saved.startedAt };
    setRun(c.run);
    setView({ kind: 'play' });
  };

  const showResult = (reward: FloorReward, r: Run, note?: string) => {
    track(reward.won ? 'dungeon_win' : 'dungeon_lose', r.floor.id);
    setTimeout(() => sfx(reward.won ? 'win' : 'lose'), 100);
    // Звёзды «штампуются» по одной, потом звенит добыча.
    for (let i = 0; i < reward.stars; i++) setTimeout(() => sfx('hit'), 700 + i * 300);
    if (reward.won) setTimeout(() => sfx('coin'), 900 + reward.stars * 300);
    setView({ kind: 'result', reward, run: r, note });
  };

  useEffect(() => {
    // Сохранённая партия: кончилась или пролежала сутки — итог сразу; иначе предложим доиграть.
    const c = checkSavedRun(latest.current, Date.now());
    if (c.kind === 'settled') {
      setProgress(saveProgress(c.progress));
      return showResult(c.reward, c.run, c.stale ? `Этаж ${c.run.floor.id} не доигран за сутки — засчитано поражение.` : undefined);
    }
    if (c.progress !== latest.current) setProgress(saveProgress(c.progress));
    if (c.kind === 'resume') return;
    if (startFloor) play(startFloor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Свернули или закрыли приложение посреди этажа: сохранить ещё раз (сам ход уже сохранён).
  useEffect(() => {
    if (view.kind !== 'play') return;
    const flush = () => {
      if (latest.current.dungeon?.run) saveProgress(latest.current);
    };
    const onVis = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
    };
  }, [view.kind]);

  // После каждого хода: партия в сохранение (маленький JSON, запись в телефоне мгновенная).
  const persist = (r: Run) => setProgress(saveProgress(storeRun(latest.current, r, meta.current.seed, meta.current.startedAt)));

  const finish = (r: Run) => {
    const res = finishFloor(latest.current, r, Date.now());
    setProgress(saveProgress(res.progress));
    showResult(res.reward, r);
  };

  const surrender = () => {
    setGiveUp(false);
    const s = latest.current.dungeon?.run;
    const r = s && restoreRun(s);
    if (!r) return;
    const res = surrenderRun(latest.current, r, Date.now());
    setProgress(saveProgress(res.progress));
    showResult(res.reward, { ...r, status: 'lost' });
  };

  // Админ: заряд до максимума, чтобы проверять этажи без тренировки (кнопка видна только админам).
  const adminCharge = () => setProgress(saveProgress(addCharge(latest.current, CHARGE_MAX)));
  const AdminButton = () =>
    admin ? (
      <button className="small-btn ghost m3-admin" onClick={adminCharge}>
        Админ: +{CHARGE_MAX} <Bolt size={12} />
      </button>
    ) : null;

  if (view.kind === 'play' && run) return <Play key={run.board.rng + run.floor.id} initial={run} charge={v.charge} onMove={persist} onFinish={finish} />;

  if (view.kind === 'result') {
    const { reward, run: r } = view;
    const nextId = Math.min(MAX_FLOOR, r.floor.id + 1);
    const enough = v.charge >= FLOOR_COST;
    const RL = landDef(r.floor.land);
    const lite = getSettings().lowPower;
    return (
      <div className={`m3-screen m3-result m3-th-${RL.theme}`} style={{ ['--la' as string]: RL.accent, ['--lb' as string]: RL.bg }}>
        <Backdrop theme={RL.theme} lite={lite} count={12} />
        <div className={`m3-result-card ${reward.won ? 'won' : 'lost'}`}>
          {reward.won && !lite && <div className="m3-rays" aria-hidden="true" />}
          {r.floor.monster && (
            <div className={`m3-result-foe ${reward.won ? 'beaten' : ''}`}>
              <MonsterFace shape={r.floor.monster.shape} color={r.floor.monster.color} boss={r.floor.boss} size={84} angry={!reward.won} />
            </div>
          )}
          <div className="m3-result-tag">
            Этаж {r.floor.id} · {RL.name}
          </div>
          <h2>{reward.won ? (r.floor.boss ? 'Хранитель повержен!' : 'Этаж пройден!') : r.heroHp <= 0 ? 'Герой отступил' : r.moves > 0 ? 'Этаж покинут' : 'Ходы кончились'}</h2>
          {view.note && <div className="muted">{view.note}</div>}
          {reward.won ? <StarStamps n={reward.stars} /> : <div className="muted">Половина добычи всё равно твоя. Попробуй ещё раз!</div>}
          <div className="m3-loot">
            {RESOURCES.map((res, i) => (
              <div key={res} className="m3-loot-item" style={{ animationDelay: `${0.25 + reward.stars * 0.3 + i * 0.12}s` }}>
                <ResIcon res={res} size={30} />
                <b>
                  +<CountUp value={reward.loot[res]} delay={450 + reward.stars * 300 + i * 120} instant={lite} />
                </b>
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
          {reward.won ? (
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
          <AdminButton />
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

  // Список этажей: земли бесконечны, поэтому рисуем окно из трёх земель вокруг выбранной
  // (по умолчанию — текущей); дальше текущей видна только одна закрытая земля.
  const nextFloor = floorDef(d.reached);
  const curLand = nextFloor.land;
  const maxLand = curLand + 1;
  const focus = Math.min(maxLand, Math.max(0, landFocus ?? curLand));
  const from = Math.max(0, focus - 1);
  const to = Math.min(maxLand, focus + 1);
  const lands = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const bonus = dailyBonusReady(progress, Date.now());
  const L = landDef(nextFloor.land);
  const jump = () => {
    const n = Math.floor(Number(jumpText));
    if (!(n >= 1)) return setJumpMsg('Введи номер этажа');
    if (n > d.reached) {
      setLandFocus(null);
      return setJumpMsg(`Этаж ${n} ещё закрыт: открыты 1–${d.reached}`);
    }
    setJumpMsg(null);
    setLandFocus(floorDef(n).land);
    setPicked(floorDef(n));
  };
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
      <div className="m3-tools">
        <button className="small-btn ghost" onClick={() => setHowto(true)}>
          Как играть
        </button>
        <AdminButton />
      </div>

      {saved && <ResumeCard saved={saved} onResume={resume} onGiveUp={() => setGiveUp(true)} />}

      <button className={`m3-next m3-th-${L.theme} ${nextFloor.boss ? 'boss' : ''}`} style={{ ['--la' as string]: L.accent, ['--lb' as string]: L.bg }} onClick={() => setPicked(nextFloor)}>
        <Backdrop theme={L.theme} lite={getSettings().lowPower} count={10} />
        <span className="m3-next-face">{nextFloor.monster ? <MonsterFace shape={nextFloor.monster.shape} color={nextFloor.monster.color} boss={nextFloor.boss} size={64} /> : <GoalBadge f={nextFloor} size={64} />}</span>
        <span className="m3-next-text">
          <small>
            {L.name} · этаж {nextFloor.num} из {FLOORS_PER_LAND}
          </small>
          <b>{goalText(nextFloor)}</b>
          <small>
            Этаж {nextFloor.id} · {nextFloor.moves} ходов{bonus ? ' · бонус первой победы дня' : ''}
          </small>
        </span>
        <span className="m3-play-chip">
          <Bolt size={14} /> {FLOOR_COST}
        </span>
      </button>

      <form
        className="m3-jump"
        onSubmit={(e) => {
          e.preventDefault();
          jump();
        }}
      >
        <input inputMode="numeric" pattern="[0-9]*" placeholder={`Этаж 1–${d.reached}`} value={jumpText} onChange={(e) => setJumpText(e.target.value.replace(/\D/g, '').slice(0, 5))} aria-label="Номер этажа" />
        <button className="small-btn" type="submit">
          Перейти к этажу
        </button>
        {focus !== curLand && (
          <button className="small-btn ghost" type="button" onClick={() => setLandFocus(null)}>
            К текущей
          </button>
        )}
      </form>
      {jumpMsg && <div className="muted m3-center">{jumpMsg}</div>}

      {from > 0 && (
        <button className="m3-more" onClick={() => setLandFocus(Math.max(0, from - 2))}>
          ▲ Земли 1–{from} · этажи 1–{from * FLOORS_PER_LAND}
        </button>
      )}
      {lands.map((land) => {
        const DL = landDef(land);
        const ids = Array.from({ length: FLOORS_PER_LAND }, (_, i) => land * FLOORS_PER_LAND + i + 1);
        const stars = ids.reduce((s, id) => s + (d.stars[id] ?? 0), 0);
        const open = floorOpen(progress, ids[0]);
        return (
          <div key={land} className={`m3-land m3-th-${DL.theme} ${open ? '' : 'locked'} ${land === curLand ? 'here' : ''}`} style={{ ['--la' as string]: DL.accent, ['--lb' as string]: DL.bg }}>
            <div className="m3-land-head">
              <b>
                {!open && <Lock size={13} />} {DL.name}
              </b>
              <span>
                <span className="m3-star">★</span> {stars}/{FLOORS_PER_LAND * 3}
              </span>
            </div>
            <div className="m3-land-sub">
              Земля {land + 1} · этажи {ids[0]}–{ids[ids.length - 1]}
              {ids[0] > FLOOR_COUNT && <span className="m3-endless">бесконечные земли</span>}
            </div>
            <div className="m3-floors">
              {ids.map((id) => {
                const f = floorDef(id);
                const isOpen = floorOpen(progress, id);
                const s = d.stars[id] ?? 0;
                return (
                  <button key={id} className={`m3-floor ${f.boss ? 'boss' : ''} ${isOpen ? '' : 'locked'} ${id === d.reached ? 'current' : ''}`} disabled={!isOpen} onClick={() => setPicked(f)}>
                    {f.boss ? <MonsterFace shape={f.monster!.shape} color={isOpen ? f.monster!.color : '#4a4f63'} boss size={30} /> : <span className={`m3-floor-num ${id >= 1000 ? 'long' : ''}`}>{id}</span>}
                    <span className="m3-floor-stars">{isOpen ? [1, 2, 3].map((i) => <i key={i} className={i <= s ? 'on' : ''} />) : <Lock size={10} />}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {to < maxLand && (
        <button className="m3-more" onClick={() => setLandFocus(Math.min(maxLand, to + 2))}>
          ▼ Дальше: земли {to + 2}–{maxLand + 1}
        </button>
      )}
      <div className="muted m3-foot">
        Тренируйся — копи заряд: 1 повтор = 1 <Bolt size={12} />. Этаж — {FLOOR_COST} <Bolt size={12} />. Лучшее комбо: ×{d.bestCombo}, побед: {d.wins}.
      </div>

      {giveUp && saved && (
        <Sheet onClose={() => setGiveUp(false)}>
          <div className="level-title">Сдаться на этаже {saved.floor}?</div>
          <LeaveText loot={saved.loot} />
          <button className="primary" onClick={surrender}>
            Сдаться
          </button>
          <button
            className="secondary"
            onClick={() => {
              setGiveUp(false);
              resume();
            }}
          >
            Продолжить этаж {saved.floor}
          </button>
        </Sheet>
      )}

      {howto && <HowTo onDone={() => setHowto(false)} />}

      {picked && (
        <Sheet onClose={() => setPicked(null)} bodyClassName="m3-pick" bodyStyle={{ ['--la' as string]: landDef(picked.land).accent }}>
          <div className="m3-pick-top">
            {picked.monster ? <MonsterFace shape={picked.monster.shape} color={picked.monster.color} boss={picked.boss} size={72} /> : <GoalBadge f={picked} size={72} />}
            <div>
              <div className="m3-result-tag">
                {landDef(picked.land).name} · этаж {picked.id}
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
          <button className="primary" disabled={!floorOpen(progress, picked.id)} onClick={() => play(picked.id)}>
            {d.stars[picked.id] ? 'Пройти ещё раз' : 'В бой'}
            <span className="m3-cost">
              <Bolt size={14} /> {FLOOR_COST}
            </span>
          </button>
          {v.charge < FLOOR_COST && <div className="muted m3-center">Заряда {v.charge} из {FLOOR_COST}: ещё {repsToFloor(progress)} повторов</div>}
          {saved && v.charge >= FLOOR_COST && <div className="muted m3-center">Незаконченный этаж {saved.floor} засчитается поражением: останется половина его добычи.</div>}
        </Sheet>
      )}
    </div>
  );
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
};

const halfLoot = (loot: Resources): Resources => ({ wood: Math.round(loot.wood * FAIL_KEEP), stone: Math.round(loot.stone * FAIL_KEEP), gold: Math.round(loot.gold * FAIL_KEEP) });

/** Чем кончится уход с этажа: честно, до нажатия. */
function LeaveText({ loot }: { loot: Resources }) {
  return (
    <div className="muted m3-leave">
      Это <b>поражение</b>: этаж не засчитается, звёзд и бонуса этажа не будет, заряд {FLOOR_COST} уже потрачен и не вернётся. В деревню уйдёт половина собранного: <ResRow res={halfLoot(loot)} plus />
    </div>
  );
}

/** Незаконченный этаж: приложение закрыли посреди партии. */
function ResumeCard({ saved, onResume, onGiveUp }: { saved: SavedRun; onResume: () => void; onGiveUp: () => void }) {
  const f = floorDef(saved.floor);
  const L = landDef(f.land);
  const hoursLeft = Math.max(1, Math.ceil((saved.startedAt + RUN_TTL - Date.now()) / 3600000));
  return (
    <div className={`m3-next m3-resume ${f.boss ? 'boss' : ''}`} style={{ ['--la' as string]: L.accent, ['--lb' as string]: L.bg }}>
      <span className="m3-next-face">{f.monster ? <MonsterFace shape={f.monster.shape} color={f.monster.color} boss={f.boss} size={64} /> : <GoalBadge f={f} size={64} />}</span>
      <span className="m3-next-text">
        <small>Незаконченный этаж · {L.name}</small>
        <b>{goalText(f)}</b>
        <small>
          Осталось {saved.moves} {plural(saved.moves, 'ход', 'хода', 'ходов')} · ждёт ещё {hoursLeft} ч
        </small>
        <span className="m3-resume-actions">
          <button className="primary" onClick={onResume}>
            Продолжить этаж {saved.floor}
          </button>
          <button className="secondary" onClick={onGiveUp}>
            Сдаться
          </button>
        </span>
      </span>
    </div>
  );
}

/** Число добычи «набегает» от нуля: ~0,9 с, requestAnimationFrame; в экономном режиме — сразу. */
function CountUp({ value, delay, instant }: { value: number; delay: number; instant?: boolean }) {
  const [n, setN] = useState(instant ? value : 0);
  useEffect(() => {
    if (instant || value <= 0) return setN(value);
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0) / 900));
      setN(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, delay, instant]);
  return <span className="m3-count">{n}</span>;
}

const STAR_PATH = 'M12 1.8l3.1 6.4 7 1-5.1 4.9 1.2 7-6.2-3.3-6.2 3.3 1.2-7L1.9 9.2l7-1z';

/** Звёзды итога: заработанные «впечатываются» по одной, остальные — тёмные гнёзда. */
function StarStamps({ n }: { n: number }) {
  return (
    <div className="m3-stamps" aria-label={`${n} из 3 звёзд`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`m3-stamp ${i <= n ? 'on' : ''} ${i === 2 ? 'mid' : ''}`} style={{ animationDelay: `${0.35 + i * 0.3}s` }}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={STAR_PATH} />
          </svg>
        </span>
      ))}
    </div>
  );
}

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
// Сколько летит самоцвет от доски к цели: к чудищу, к здоровью героя, к добыче.
const FLY_MS = 460;
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Добыча одной волны: счётчик внизу растёт, когда самоцветы долетают. Как в playMove. */
function stepLoot(floor: number, s: Step, share: number): Resources {
  const k = floorMult(floor) * share;
  const out: Resources = { wood: 0, stone: 0, gold: 0 };
  for (const r of RESOURCES) out[r] = s.counts[r] * GEM_YIELD[r] * k;
  return out;
}

const addLoot = (a: Resources, b: Resources): Resources => ({ wood: a.wood + b.wood, stone: a.stone + b.stone, gold: a.gold + b.gold });

/** Тряска элемента: только transform. */
function shake(el: HTMLElement | null | undefined, px: number, ms = 380) {
  if (!el?.animate || reduceMotion()) return;
  el.animate(
    [{ transform: 'translate(0,0)' }, { transform: `translate(${-px}px,${px * 0.4}px)` }, { transform: `translate(${px * 0.8}px,${-px * 0.4}px)` }, { transform: `translate(${-px * 0.5}px,${px * 0.2}px)` }, { transform: 'translate(0,0)' }],
    { duration: ms, easing: 'ease-out' },
  );
}

/** Цель «подпрыгивает», когда в неё прилетел самоцвет. */
function bump(el: Element | null | undefined, to = 'scale(1.2)') {
  (el as HTMLElement | null)?.animate?.([{ transform: 'none' }, { transform: to }, { transform: 'none' }], { duration: 220, easing: 'ease-out' });
}

function Play({ initial, charge, onMove, onFinish }: { initial: Run; charge: number; onMove: (r: Run) => void; onFinish: (r: Run) => void }) {
  const settings = useSettings();
  const lite = settings.lowPower;
  const [run, setRun] = useState(initial);
  const [shown, setShown] = useState<Board>(initial.board);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Pos | null>(null);
  const [hintPair, setHint] = useState<[Pos, Pos] | null>(null);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [monsterHp, setMonsterHp] = useState(initial.monsterHp);
  const [floats, setFloats] = useState<{ key: number; text: string; cls: string; dx: number }[]>([]);
  // Добыча на экране: растёт, когда самоцветы долетают до счётчика.
  const [lootShown, setLootShown] = useState<Resources>(initial.loot);
  // Волна каскада: счётчик ×N и разгорающаяся рамка.
  const [combo, setCombo] = useState(0);
  const [attack, setAttack] = useState(0);
  const [claw, setClaw] = useState(0);
  const [dead, setDead] = useState(false);
  const [finale, setFinale] = useState(false);
  const [movesView, setMovesView] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const lootRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<HTMLDivElement>(null);
  const foeRef = useRef<HTMLDivElement>(null);
  const heroBarRef = useRef<HTMLDivElement>(null);
  const movesRef = useRef<HTMLDivElement>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  // Заставка хранителя — только в начале этажа (не при продолжении сохранённой партии).
  const [intro, setIntro] = useState(initial.floor.boss && initial.moves === initial.floor.moves);
  const [howto, setHowto] = useState(() => !howToSeen());
  // Вспышка экрана на бомбе и радуге.
  const [flash, setFlash] = useState(0);
  const [hurt, setHurt] = useState(0);
  const [hitMonster, setHitMonster] = useState(0);
  const [quit, setQuit] = useState(false);
  const drops = useRef(new Map<number, number>());
  const born = useRef(new Set<number>());
  const landed = useRef(new Map<number, string>());
  const alive = useRef(true);
  const busyRef = useRef(false);
  const skipRef = useRef(false);
  const hpRef = useRef(initial.monsterHp);
  const f = initial.floor;
  const L = landDef(f.land);
  const m = f.monster;
  const fights = !!m && (f.goal === 'monster' || f.goal === 'survive');

  useEffect(() => {
    if (!intro) return;
    const t = setTimeout(() => setIntro(false), 2600);
    return () => clearTimeout(t);
  }, [intro]);

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
      const mv = findHint(run.board);
      if (mv) setHint([mv.a, mv.b]);
    }, HINT_AFTER_MS);
    return () => clearTimeout(t);
  }, [busy, run]);

  const later = (ms: number, fn: () => void) => setTimeout(() => alive.current && fn(), ms);
  // Пауза анимации; в салюте по нажатию «пропустить» — без ожидания.
  const pause = (ms: number) => (skipRef.current ? Promise.resolve() : wait(ms));

  const addFx = (list: Effect[]) => {
    if (!list.length) return;
    // Новая надпись сменяет прежнюю, а не ложится поверх.
    const text = list.some((x) => x.type === 'combo');
    setEffects((e) => [...(text ? e.filter((x) => x.type !== 'combo') : e), ...list]);
    const keys = new Set(list.map((x) => x.key));
    later(900, () => setEffects((e) => e.filter((x) => !keys.has(x.key))));
  };
  const addFloat = (text: string, cls: string) => {
    const key = fxKey++;
    setFloats((x) => [...x, { key, text, cls, dx: Math.round((Math.random() - 0.5) * 50) }]);
    later(1100, () => setFloats((x) => x.filter((y) => y.key !== key)));
  };

  /** Летящий значок: от точки к точке по дуге, в слое поверх экрана. Координаты — от экрана партии. */
  const launch = (sx: number, sy: number, tx: number, ty: number, size: number, html: string, cls: string, delay: number, done?: () => void) => {
    const layer = flyRef.current;
    if (!layer) return;
    const el = document.createElement('div');
    el.className = `m3-flyer ${cls}`;
    el.style.cssText = `left:${sx - size / 2}px;top:${sy - size / 2}px;width:${size}px;height:${size}px`;
    el.innerHTML = html;
    layer.appendChild(el);
    const dx = tx - sx;
    const dy = ty - sy;
    // Сначала подскок вверх и чуть в сторону, потом разгон к цели.
    const side = (Math.random() - 0.5) * Math.min(90, Math.abs(dy) * 0.3 + 30);
    const anim = el.animate?.(
      [
        { transform: 'translate(0px,0px) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.18 + side}px,${dy * 0.18 - 36}px) scale(1.18)`, opacity: 1, offset: 0.32 },
        { transform: `translate(${dx}px,${dy}px) scale(.4)`, opacity: 0.85 },
      ],
      { duration: FLY_MS, delay, easing: 'cubic-bezier(.45,0,.75,.9)', fill: 'backwards' },
    );
    if (!anim) {
      el.remove();
      done?.();
      return;
    }
    anim.onfinish = () => {
      el.remove();
      done?.();
    };
  };

  // Где на экране центр клетки доски и какой она величины.
  const boardGeom = () => {
    const root = playRef.current?.getBoundingClientRect();
    const br = wrap.current?.querySelector('.m3-board')?.getBoundingClientRect();
    if (!root || !br) return null;
    const cw = br.width / shown.w;
    return { root, cw, at: (p: Pos) => ({ x: br.left - root.left + (p.x + 0.5) * cw, y: br.top - root.top + (p.y + 0.5) * cw }) };
  };
  const centerOf = (el: Element | null | undefined, root: DOMRect, left = false) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left - root.left + (left ? Math.min(r.width / 2, 10) : r.width / 2), y: r.top - root.top + r.height / 2 };
  };

  /** Убранные самоцветы летят к целям: мечи — в чудище, сердца — в здоровье, ресурсы — в добычу. */
  const flyGems = (cleared: ClearedGem[]) => {
    const g = boardGeom();
    if (!g || reduceMotion()) return;
    const list = cleared.filter((c) => c.special !== 'rainbow' && (!!m || (c.kind !== 'sword' && c.kind !== 'heart')));
    const max = lite ? 4 : 14;
    const step = Math.max(1, list.length / max);
    const pick: ClearedGem[] = [];
    for (let i = 0; i < list.length && pick.length < max; i += step) pick.push(list[Math.floor(i)]);
    pick.forEach((c, i) => {
      const target = c.kind === 'sword' ? foeRef.current : c.kind === 'heart' ? heroBarRef.current : lootRef.current?.querySelector(`[data-res="${c.kind}"]`);
      const to = centerOf(target, g.root, c.kind !== 'sword' && c.kind !== 'heart');
      if (!to) return;
      const from = g.at(c);
      launch(from.x, from.y, to.x, to.y, g.cw * 0.72, `<svg viewBox="0 0 48 48" width="100%" height="100%"><use href="#m3s-${c.kind}"/></svg>`, c.kind, i * 22, () => bump(target, c.kind === 'heart' ? 'scaleY(1.45)' : 'scale(1.2)'));
    });
  };

  /** Одна волна: вспышки, молнии, звуки, полёт самоцветов, падение. */
  const animateStep = async (s: Step, damage: number, share: number) => {
    const fx: Effect[] = s.cleared.map((c) => ({ key: fxKey++, type: 'pop' as const, x: c.x, y: c.y, kind: c.kind, special: c.special }));
    let line = false;
    let bomb = false;
    let prism = false;
    const mega = s.blasts.some((bl) => bl.kind === 'bigbomb' || bl.kind === 'all') || s.blasts.some((a) => a.kind === 'row' && s.blasts.some((b) => b.kind === 'col' && b.x === a.x && b.y === a.y));
    for (const bl of s.blasts) {
      if (bl.kind === 'row' || bl.kind === 'col') {
        fx.push({ key: fxKey++, type: bl.kind, x: bl.x, y: bl.y });
        line = true;
      } else if (bl.kind === 'bomb' || bl.kind === 'bigbomb') {
        const r = bl.kind === 'bomb' ? 1 : 2;
        fx.push({ key: fxKey++, type: 'bomb', x: bl.x, y: bl.y, r }, { key: fxKey++, type: 'debris', x: bl.x, y: bl.y, r });
        bomb = true;
      } else {
        fx.push({ key: fxKey++, type: 'flash', x: bl.x, y: bl.y, kind: bl.target });
        const to = s.cleared.filter((c) => (bl.kind === 'all' || c.kind === bl.target) && (c.x !== bl.x || c.y !== bl.y)).slice(0, 24);
        if (to.length) fx.push({ key: fxKey++, type: 'chain', x: bl.x, y: bl.y, to, kind: bl.target });
        prism = true;
      }
    }
    if (mega) {
      const at = s.blasts[0];
      fx.push({ key: fxKey++, type: 'mega', x: at.x, y: at.y });
    }
    for (const h of s.blocksHit) fx.push({ key: fxKey++, type: 'break', x: h.x, y: h.y, block: h.kind });
    for (const h of s.iceHit) fx.push({ key: fxKey++, type: 'break', x: h.x, y: h.y, block: 'ice' });
    if (mega) fx.push({ key: fxKey++, type: 'combo', text: 'Сокрушительно!', big: true });
    // Номер волны показывает счётчик ×N у доски, надпись — только похвала.
    else if (s.combo >= 2) fx.push({ key: fxKey++, type: 'combo', text: s.combo >= 5 ? 'Невероятно!' : s.combo >= 3 ? 'Супер!' : 'Комбо!', big: s.combo >= 3 });
    else if (s.longest >= 5) fx.push({ key: fxKey++, type: 'combo', text: 'Радуга!', big: true });
    addFx(fx);
    if (s.combo >= 2) setCombo(s.combo);
    for (const c of s.created) born.current.add(c.gem.id);
    setShown(s.mid);
    if (bomb || prism || mega) setFlash((n) => n + 1);
    if (mega) shake(playRef.current, 9, 520);
    else if (bomb) shake(wrap.current, 6);
    else if (line) shake(wrap.current, 2.5, 220);

    // Звуки: у каждого самоцвета свой, с каждой волной выше.
    const kinds = new Set(s.cleared.filter((c) => c.special !== 'rainbow').map((c) => c.kind));
    kinds.forEach((k) => sfx(`gem-${k}` as GemSfx, s.combo));
    if (line) sfx('zap');
    if (bomb || mega) sfx('boom');
    if (prism) sfx('prism');
    if (s.combo >= 2) sfx('combo');
    haptic(mega || bomb ? 'heavy' : s.combo >= 2 || line ? 'medium' : 'light');

    flyGems(s.cleared);
    const got = stepLoot(f.id, s, share);
    later(FLY_MS, () => {
      setLootShown((l) => addLoot(l, got));
      sfx('thud', s.combo);
    });
    if (damage > 0) {
      later(FLY_MS * 0.8, () => {
        hpRef.current = Math.max(0, hpRef.current - damage);
        setMonsterHp(hpRef.current);
        setHitMonster((n) => n + 1);
        addFloat(`−${damage}`, s.combo >= 2 || s.blasts.length ? 'dmg crit' : 'dmg');
        sfx('hurt');
      });
    }
    await pause(lite ? 170 : 210);
    if (!alive.current) return;
    for (const sp of s.spawned) drops.current.set(sp.id, sp.drop);
    // Упавшие пружинят: у самоцвета класс чередуется, чтобы анимация началась заново, а у
    // остальных не меняется — их анимация не повторяется.
    for (const fl of s.falls) {
      drops.current.delete(fl.id);
      landed.current.set(fl.id, landed.current.get(fl.id) === 'm3-land-a' ? 'm3-land-b' : 'm3-land-a');
    }
    setShown(s.after);
    await pause(lite ? 220 : 260);
  };

  /** Финальный салют: оставшиеся ходы улетают на доску лучами, и всё взрывается. */
  const playFinale = async (won: Run, fin: NonNullable<ReturnType<typeof finaleRun>>) => {
    setFinale(true);
    skipRef.current = false;
    addFx([{ key: fxKey++, type: 'combo', text: 'Финальный салют!', big: true }]);
    sfx('levelup');
    setMovesView(won.moves);
    await pause(750);
    let b = cloneBoard(won.board);
    let left = won.moves;
    for (let k = 0; k < fin.finale.marked.length && !skipRef.current; k++) {
      const mk = fin.finale.marked[k];
      left -= 1;
      setMovesView(left);
      const g = boardGeom();
      const from = g && centerOf(movesRef.current, g.root);
      if (g && from && !reduceMotion()) {
        const to = g.at(mk);
        launch(from.x, from.y, to.x, to.y, g.cw * 0.5, '', 'star', 0);
      }
      sfx('spark', k + 1);
      await pause(lite ? 220 : FLY_MS);
      if (!alive.current) return;
      b = cloneBoard(b);
      b.cells[idx(b, mk.x, mk.y)].gem = mk.gem;
      born.current.add(mk.gem.id);
      setShown(b);
      addFx([{ key: fxKey++, type: 'flash', x: mk.x, y: mk.y, kind: mk.gem.kind }]);
      await pause(lite ? 40 : 90);
    }
    setMovesView(won.moves - fin.finale.marked.length);
    setShown(fin.finale.start);
    await pause(350);
    for (const s of fin.finale.result.steps) {
      if (skipRef.current || !alive.current) break;
      await animateStep(s, 0, FINALE_SHARE);
    }
    if (!alive.current) return;
    setShown(fin.run.board);
    await wait(FLY_MS);
    setLootShown(fin.run.loot);
    setCombo(0);
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
    // Ход в сохранение до анимации: закроют приложение посреди каскада — ход не пропадёт.
    onMove(o.run);
    hpRef.current = run.monsterHp;
    for (let i = 0; i < o.result.steps.length; i++) {
      const s = o.result.steps[i];
      await animateStep(s, o.damage[i], comboMult(s.combo));
      if (!alive.current) return;
    }
    if (o.result.reshuffled) {
      addFx([{ key: fxKey++, type: 'combo', text: 'Ходов нет — перемешиваем', big: false }]);
      await wait(500);
      setShown(o.run.board);
    }
    // Самоцветы долетают: добыча на экране ровно как в партии.
    later(FLY_MS, () => setLootShown(o.run.loot));
    setCombo(0);
    if (o.healed > 0) addFloat(`+${o.healed}`, 'heal');
    if (o.hit > 0) {
      // Чудище замахивается, бросается на доску, по экрану проходят когти.
      await wait(160);
      setAttack((n) => n + 1);
      await wait(lite ? 180 : 300);
      if (!alive.current) return;
      setClaw((n) => n + 1);
      setHurt((n) => n + 1);
      shake(playRef.current, 8, 420);
      addFloat(`−${o.hit}`, 'hurt');
      sfx('claw');
      haptic('heavy');
      await wait(250);
    }
    let final = o.run;
    if (o.run.status === 'won') {
      if (fights && o.run.monsterHp <= 0) {
        // Чудище повержено: вспыхивает и рассыпается искрами.
        await wait(FLY_MS);
        setMonsterHp(0);
        setDead(true);
        sfx('shatter');
        haptic('heavy');
        await wait(900);
      }
      const fin = finaleRun(o.run);
      if (fin && alive.current) {
        onMove(fin.run);
        final = fin.run;
        await playFinale(o.run, fin);
      }
    }
    if (!alive.current) return;
    setRun(final);
    setShown(final.board);
    setMonsterHp(final.monsterHp);
    if (final.status !== 'play') {
      await wait(final.status === 'won' ? 700 : 900);
      if (alive.current) onFinish(final);
      return;
    }
    busyRef.current = false;
    setBusy(false);
  };

  const tap = (p: Pos) => {
    if (busyRef.current || intro || howto) return;
    if (selected && adjacent(selected, p)) return void swap(selected, p);
    if (selected && selected.x === p.x && selected.y === p.y) return setSelected(null);
    if (shown.cells[idx(shown, p.x, p.y)].gem) {
      setSelected(p);
      haptic('light');
    }
  };

  const left = goalLeft(run);
  const telegraph = !!m && run.monsterHp > 0 && run.attackIn === 1 && !dead;
  // Чудище при смерти злится и дрожит.
  const weak = fights && !dead && monsterHp > 0 && monsterHp / run.monsterMax < 0.3;
  const heat = Math.min(1, Math.max(0, (combo - 1) / 4));
  const moves = movesView ?? run.moves;
  const shards = lite ? 6 : 14;
  return (
    <div ref={playRef} className={`m3-play m3-th-${L.theme} ${f.boss ? 'boss' : ''}`} style={{ ['--la' as string]: L.accent, ['--lb' as string]: L.bg }}>
      <Backdrop theme={L.theme} lite={lite} />
      {flash > 0 && !lite && <div key={flash} className="m3-screenflash" aria-hidden="true" />}
      {hurt > 0 && <div key={`h${hurt}`} className="m3-hurtflash" aria-hidden="true" />}
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

      <div ref={hudRef} className="m3-hud">
        <div className="m3-hud-main">
          <div className="m3-foe-name">{fights ? m!.name : goalText(f)}</div>
          {fights ? (
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
            <div ref={heroBarRef} key={hurt} className={`m3-bar hero ${hurt ? 'hurt' : ''}`}>
              <span style={{ width: `${(run.heroHp / run.heroMax) * 100}%` }} />
              <em>
                <Heart size={11} /> {run.heroHp}
              </em>
              {floats.filter((x) => !x.cls.startsWith('dmg')).map((x) => (
                <i key={x.key} className={`m3-float ${x.cls}`}>
                  {x.text}
                </i>
              ))}
            </div>
          )}
        </div>
        <div ref={movesRef} className={`m3-moves ${moves <= 3 && !finale ? 'low' : ''} ${finale ? 'finale' : ''}`}>
          <b>{f.goal === 'survive' ? left : moves}</b>
          <span>{f.goal === 'survive' ? 'продержись' : 'ходов'}</span>
        </div>
      </div>

      <div className="m3-stage">
        <div ref={foeRef} className={`m3-foe ${telegraph ? 'telegraph' : ''} ${dead ? 'dead' : ''}`}>
          <div key={`a${attack}`} className={`m3-foe-body ${attack ? 'lunge' : ''}`}>
            <div key={hitMonster} className={`m3-foe-face ${hitMonster ? 'hit' : ''} ${weak ? 'weak' : ''}`}>
              <div className={lite ? '' : 'm3-foe-idle'}>
                {m ? <MonsterFace shape={m.shape} color={m.color} boss={f.boss} size={f.boss ? 132 : 112} angry={telegraph || weak} /> : <GoalBadge f={f} size={96} />}
              </div>
              {hitMonster > 0 && <span className="m3-foe-flash" aria-hidden="true" />}
              {hitMonster > 0 && !lite && <span className="m3-impact" aria-hidden="true" />}
            </div>
          </div>
          {dead && (
            <div className="m3-shatter" aria-hidden="true" style={{ ['--gc' as string]: m?.color ?? '#fff' }}>
              {Array.from({ length: shards }, (_, i) => (
                <i key={i} style={{ ['--a' as string]: `${(i * 360) / shards + (i % 3) * 9}deg`, ['--l' as string]: `${60 + (i % 4) * 18}px` }} />
              ))}
            </div>
          )}
          {floats.filter((x) => x.cls.startsWith('dmg')).map((x) => (
            <span key={x.key} className={`m3-float ${x.cls}`} style={{ ['--dx' as string]: `${x.dx}px` }}>
              {x.text}
            </span>
          ))}
        </div>
        {m && run.monsterHp > 0 && !dead && (
          <span className={`m3-attack ${telegraph ? 'soon' : ''}`}>
            <Swords size={13} /> {telegraph ? 'Сейчас ударит!' : `Удар через ${run.attackIn} ${plural(run.attackIn, 'ход', 'хода', 'ходов')} · −${m.atk}`}
          </span>
        )}
      </div>

      <div ref={wrap} className="m3-board-wrap">
        <div className={`m3-frame ${frameOf(L.theme)} ${heat > 0 ? 'hot' : ''}`} style={{ ['--heat' as string]: heat }}>
          <BoardView board={shown} drops={drops.current} born={born.current} landed={landed.current} effects={effects} selected={selected} hint={hintPair} disabled={busy || intro || howto || run.status !== 'play'} lite={lite} onTap={tap} onSwipe={(a, b) => void swap(a, b)} />
        </div>
        {telegraph && <div className="m3-warn" />}
        {combo >= 2 && (
          <div key={combo} className={`m3-meter ${combo >= 4 ? 'hot' : ''}`} aria-hidden="true">
            ×{combo}
          </div>
        )}
        {claw > 0 && (
          <div key={claw} className="m3-claws" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        )}
      </div>

      <div ref={lootRef} className="m3-bottom">
        <span className="m3-res-label">Добыча</span>
        <ResRow res={{ wood: Math.round(lootShown.wood), stone: Math.round(lootShown.stone), gold: Math.round(lootShown.gold) }} />
      </div>

      <div ref={flyRef} className="m3-fly" aria-hidden="true" />

      {finale && busy && (
        <button className="m3-finale-skip" onClick={() => (skipRef.current = true)}>
          нажми, чтобы пропустить
        </button>
      )}

      {intro && m && (
        <div className="m3-boss-intro" onClick={() => setIntro(false)}>
          <div className="m3-boss-band">
            <div className="m3-boss-face">
              <MonsterFace shape={m.shape} color={m.color} boss size={120} angry />
            </div>
            <div className="m3-boss-text">
              <small>Хранитель земли · этаж {f.id}</small>
              <b>{m.name}</b>
              <span>
                <Heart size={12} /> {m.hp} · бьёт на {m.atk} раз в {m.every} {plural(m.every, 'ход', 'хода', 'ходов')}
              </span>
            </div>
          </div>
          <div className="m3-boss-tap">нажми, чтобы начать</div>
        </div>
      )}
      {!intro && howto && <HowTo targets={{ board: wrap, hud: hudRef, loot: lootRef }} onDone={() => setHowto(false)} />}

      {quit && (
        <Sheet onClose={() => setQuit(false)}>
          <div className="level-title">Покинуть этаж?</div>
          <LeaveText loot={run.loot} />
          <div className="muted m3-leave">Можно и просто закрыть приложение: этаж сохранится, доиграешь в течение суток.</div>
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
        </Sheet>
      )}
    </div>
  );
}

export default DungeonScreen;
