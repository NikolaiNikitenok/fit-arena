import { useRef, useState } from 'react';
import { EXERCISE_LABELS } from '../repCounter';
import { ITEMS, itemById, RARITY_COLORS, RARITY_NAMES } from './items';
import { LANDS, WORLD_NAMES, WORLDS } from './lands';
import { LEVEL_COUNT, LEVELS, LevelDef, targetReps, WORLD_SIZE } from './levels';
import { MissionPlay, Stars } from './MissionPlay';
import { buy, claimChest, currentLevel, equip, isUnlocked, loadProgress, recordWin } from './progress';
import { WorldMap3D } from './WorldMap3D';

// Три мира по 100 уровней и финал. Вкладка «Замок» открывается после третьего мира.
const TABS = [...WORLDS, 'castle'] as const;
const levelsOf = (w: number) => (w === 3 ? LEVELS.slice(WORLD_SIZE * 3) : LEVELS.slice(w * WORLD_SIZE, (w + 1) * WORLD_SIZE));

export function Adventure() {
  const [progress, setProgress] = useState(loadProgress);
  const current = currentLevel(progress, LEVEL_COUNT);
  const currentDef = LEVELS[current - 1];
  const [world, setWorld] = useState(currentDef.world);
  const [playing, setPlaying] = useState<LevelDef | null>(null);
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
          const r = recordWin(progress, playing, stars, record);
          setProgress(r.progress);
          return r.reward;
        }}
        onNext={playing.id < LEVEL_COUNT ? () => setPlaying(LEVELS[playing.id]) : undefined}
      />
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

  return (
    <>
      <div className="tabs small">
        {TABS.map((w, i) => (
          <button key={w} className={world === i ? 'active' : ''} disabled={!worldOpen(i)} onClick={() => switchWorld(i)}>
            {worldOpen(i) ? WORLD_NAMES[w] : `🔒 ${WORLD_NAMES[w]}`}
          </button>
        ))}
      </div>

      <div className="arena map3d" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => setTimeout(() => (drag.current = null))}>
        <WorldMap3D
          levels={levels}
          stars={progress.stars}
          currentId={current}
          heroColor={item.color}
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
        <div className="map-hud">
          <div>
            <div className="map-land">{L.name}</div>
            <div className="map-sub">{L.world === 'castle' ? 'Финал' : `Хранитель: ${L.boss.name}`}</div>
          </div>
          <div className="coins">🪙 {progress.coins}</div>
        </div>
        {toast && <div className="toast">{toast}</div>}
        <div className="map-help">Листай карту пальцем · сундуки и купец ждут на дороге</div>
      </div>

      {selected && (
        <div className="level-card">
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
      )}
      {!selected && (
        <button className="primary" onClick={() => setPlaying(currentDef)}>
          Уровень {currentDef.num}: {currentDef.title}
        </button>
      )}

      {shop && (
        <div className="sheet" onClick={() => setShop(false)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            <div className="level-title">Купец Фёдор</div>
            <div className="muted">«Смотри, герой, товар со всех трёх миров! Найденное в сундуках тоже можно надеть.»</div>
            <div className="coins">🪙 {progress.coins}</div>
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
                      🪙 {i.price}
                    </button>
                  )}
                </div>
              );
            })}
            <button className="link" onClick={() => setShop(false)}>
              Закрыть
            </button>
          </div>
        </div>
      )}
    </>
  );
}
