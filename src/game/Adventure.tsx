import { useEffect, useRef, useState } from 'react';
import { EXERCISE_LABELS, Exercise } from '../repCounter';
import { Portrait } from './Dialog';
import { HeroHome } from './HeroHome';
import { ITEMS, itemById, RARITY_COLORS, RARITY_NAMES } from './items';
import { LANDS, WORLD_NAMES, WORLDS } from './lands';
import { LEVEL_COUNT, LEVELS, LevelDef, targetReps, WORLD_SIZE } from './levels';
import { MissionPlay, Stars } from './MissionPlay';
import { NPCS } from './npcs';
import {
  buy,
  claimChest,
  claimHeroLevels,
  currentLevel,
  dayKey,
  equip,
  isUnlocked,
  livesNow,
  loadProgress,
  Progress,
  recordActivity,
  recordWin,
  REST_PER_WEEK,
  spendLife,
  spendSwaps,
  streak,
  swapsLeft,
} from './progress';
import { WorldMap3D } from './WorldMap3D';
import { Coin, Heart, Lock } from '../icons';

// Три мира по 100 уровней и финал. Вкладка «Замок» открывается после третьего мира.
const TABS = [...WORLDS, 'castle'] as const;
// На вкладках карты короткие названия, чтобы все четыре мира помещались в строку.
const SHORT_WORLD: Record<(typeof TABS)[number], string> = { fantasy: 'Королевство', space: 'Космос', zombie: 'Зомби', castle: 'Замок' };
const levelsOf = (w: number) => (w === 3 ? LEVELS.slice(WORLD_SIZE * 3) : LEVELS.slice(w * WORLD_SIZE, (w + 1) * WORLD_SIZE));

const EXERCISES: Exercise[] = ['squat', 'pushup', 'situp'];
const fmtMin = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

export type AdventureTab = 'hero' | 'map';

interface Props {
  tab: AdventureTab;
  onTab: (tab: AdventureTab) => void;
  // Во время миссии нижнее меню прячется.
  onPlaying: (playing: boolean) => void;
}

export function Adventure({ tab, onTab, onPlaying }: Props) {
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
  const current = currentLevel(progress, LEVEL_COUNT);
  const currentDef = LEVELS[current - 1];
  const [world, setWorld] = useState(currentDef.world);
  const [playing, setPlayingState] = useState<LevelDef | null>(null);
  const setPlaying = (l: LevelDef | null) => {
    setPlayingState(l);
    onPlaying(!!l);
  };
  const [selected, setSelected] = useState<LevelDef | null>(null);
  const [shop, setShop] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const levels = levelsOf(world);
  const startIndex = () => Math.max(0, levels.findIndex((l) => l.id === current));
  const focus = useRef(startIndex());
  const [focusLand, setFocusLand] = useState(levels[startIndex()].land);
  const drag = useRef<{ y: number; moved: number } | null>(null);
  const item = itemById(progress.equipped);

  const showToast = (text: string) => {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), 2600);
  };

  // Новый уровень героя: монеты и сообщение, как только миссия закончилась.
  const [levelUp, setLevelUp] = useState<string | null>(null);
  useEffect(() => {
    if (playing) return;
    const r = claimHeroLevels(latest.current);
    if (!r) return;
    setProgress(r.progress);
    setLevelUp(`Новый уровень героя: ${r.levels[r.levels.length - 1]}! +${r.coins} монет`);
    setTimeout(() => setLevelUp(null), 3500);
  }, [playing, progress.days]);

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
      <MissionPlay
        key={playing.id}
        level={playing}
        progress={progress}
        onExit={() => setPlaying(null)}
        onWin={(stars, record) => {
          const r = recordWin(latest.current, playing, stars, record);
          setProgress(r.progress);
          return r.reward;
        }}
        onLose={() => update((p) => spendLife(p, Date.now()))}
        onActivity={(ex, reps) => update((p) => recordActivity(p, ex, reps, Date.now()))}
        lives={lives}
        swaps={swapsLeft(progress, playing.id, Date.now())}
        onSwap={(count) => {
          const next = spendSwaps(latest.current, playing.id, count, Date.now());
          if (next) update(() => next);
          return next != null;
        }}
        onNext={playing.id < LEVEL_COUNT ? () => setPlaying(LEVELS[playing.id]) : undefined}
      />
    );

  const sheets = (
    <>
      {strength && <StrengthSheet progress={progress} now={now} onClose={() => setStrength(false)} />}
      {shop && <Shop progress={progress} setProgress={setProgress} onClose={() => setShop(false)} />}
      {levelUp && <div className="toast global">{levelUp}</div>}
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
          onMap={() => onTab('map')}
          onShop={() => setShop(true)}
          onStrength={() => setStrength(true)}
          onEquip={(id) => setProgress(equip(progress, id))}
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
    <div className="map-screen">
      <div className="arena map3d" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => setTimeout(() => (drag.current = null))}>
        <WorldMap3D
          levels={levels}
          stars={progress.stars}
          currentId={current}
          hero={item.hero}
          heroTint={item.tint}
          heroGlow={item.glow}
          focus={focus}
          focusLand={focusLand}
          openedChests={progress.chests}
          onSelect={(l) => tap(() => setSelected(l))()}
          onMerchant={tap(() => setShop(true))}
          onChest={(land) =>
            tap(() => {
              const r = claimChest(progress, land);
              if (!r) return showToast('Этот сундук уже пуст.');
              setProgress(r.progress);
              showToast(r.itemName ? `В сундуке: ${r.itemName}!` : `В сундуке ${r.coins} монет.`);
            })()
          }
        />
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
      {sheets}
    </div>
  );
}

/** Лавка купца Фёдора. */
function Shop({ progress, setProgress, onClose }: { progress: Progress; setProgress: (p: Progress) => void; onClose: () => void }) {
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
        <div className="remark">
          <Portrait line={{ face: 'fedor', color: NPCS.fedor.color, who: NPCS.fedor.name }} size={52} />
          <div>
            <div className="level-title">Купец Фёдор</div>
            <div className="muted">«Смотри, герой, товар со всех трёх миров! Найденное в сундуках тоже можно надеть.»</div>
          </div>
        </div>
        <div className="coins">
          <Coin className="coin" /> {progress.coins}
        </div>
        {ITEMS.filter((i) => i.inShop || progress.items.includes(i.id)).map((i) => {
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
                <button
                  className="small-btn"
                  disabled={progress.coins < i.price}
                  onClick={() => {
                    const next = buy(progress, i.id);
                    if (next) setProgress(next);
                  }}
                >
                  <Coin size={14} /> {i.price}
                </button>
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

const WEEKDAY = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** «Твоя сила»: рост по упражнениям, серия и повторы за две недели. */
function StrengthSheet({ progress, now, onClose }: { progress: Progress; now: number; onClose: () => void }) {
  const series = streak(progress.days, now);
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
                <div className="strength-was">{first ? `первый подход: ${first.reps}` : 'ещё не делал'}</div>
              </div>
              {up > 0 && <span className="strength-up">+{up}</span>}
              <span className="strength-val">{best?.reps ?? '—'}</span>
            </div>
          );
        })}
        <div className="muted">Лучший подход за одну миссию. За 2 недели: {total} повторов.</div>
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
