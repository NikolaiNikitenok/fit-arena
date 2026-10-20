import { memo, useRef } from 'react';
import { type Board as BoardState, type Gem, type GemKind, type Pos, type Special } from './engine';
import { BoulderArt, CrateArt, GEM_COLORS, GemArt, GemDefs } from './art';

// Доска: самоцветы двигаются CSS-переходами transform (только композитинг, 60 к/с и на слабых
// телефонах), вспышки и осколки — короткие CSS-анимации, которые экран убирает сам.

export type Effect =
  | { key: number; type: 'pop'; x: number; y: number; kind: GemKind; special?: Special }
  | { key: number; type: 'row'; x: number; y: number }
  | { key: number; type: 'col'; x: number; y: number }
  | { key: number; type: 'bomb'; x: number; y: number; r: number }
  | { key: number; type: 'flash'; x: number; y: number; kind?: GemKind }
  | { key: number; type: 'break'; x: number; y: number; block: 'crate' | 'boulder' | 'ice' }
  | { key: number; type: 'combo'; text: string; big: boolean };

interface Props {
  board: BoardState;
  // Новые самоцветы: на сколько клеток они падают сверху; особые, которые появились, — вспыхивают.
  drops: Map<number, number>;
  born: Set<number>;
  effects: Effect[];
  selected: Pos | null;
  hint: [Pos, Pos] | null;
  disabled: boolean;
  lite: boolean;
  onTap: (p: Pos) => void;
  onSwipe: (a: Pos, b: Pos) => void;
}

const GemView = memo(function GemView({ gem, x, y, drop, born, selected, hinted, lite }: { gem: Gem; x: number; y: number; drop: number; born: boolean; selected: boolean; hinted: boolean; lite: boolean }) {
  return (
    <div className="m3-gem" style={{ transform: `translate3d(${x * 100}%, ${y * 100}%, 0)` }}>
      <div className={`m3-gem-in ${drop ? 'm3-drop' : ''} ${born ? 'm3-born' : ''} ${selected ? 'm3-sel' : ''} ${hinted ? 'm3-hinted' : ''}`} style={drop ? { ['--drop' as string]: drop } : undefined}>
        {gem.special === 'rainbow' ? <div className="m3-rainbow" /> : <GemArt kind={gem.kind} />}
        {(gem.special === 'lineH' || gem.special === 'lineV') && <div className={`m3-stripe ${gem.special}`} />}
        {gem.special === 'bomb' && <div className="m3-bomb" style={{ ['--gc' as string]: GEM_COLORS[gem.kind][2] }} />}
        {/* Особый самоцвет: искры бегут по кругу — его видно сразу. */}
        {gem.special && !lite && <i className="m3-spark" style={{ ['--gc' as string]: GEM_COLORS[gem.kind][2] }} />}
      </div>
    </div>
  );
});

export function BoardView({ board, drops, born, effects, selected, hint, disabled, lite, onTap, onSwipe }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ p: Pos; x: number; y: number; done: boolean } | null>(null);
  const cellAt = (cx: number, cy: number): Pos | null => {
    const r = ref.current!.getBoundingClientRect();
    const x = Math.floor(((cx - r.left) / r.width) * board.w);
    const y = Math.floor(((cy - r.top) / r.height) * board.h);
    return x >= 0 && y >= 0 && x < board.w && y < board.h ? { x, y } : null;
  };
  const cellPx = () => ref.current!.getBoundingClientRect().width / board.w;

  const gems: { gem: Gem; x: number; y: number }[] = [];
  board.cells.forEach((c, i) => c.gem && gems.push({ gem: c.gem, x: i % board.w, y: Math.floor(i / board.w) }));
  // Одинаковый порядок узлов между кадрами: React двигает элементы, а не пересоздаёт.
  gems.sort((a, b) => a.gem.id - b.gem.id);
  const same = (p: Pos | null, x: number, y: number) => !!p && p.x === x && p.y === y;

  return (
    <div
      ref={ref}
      className={`m3-board ${disabled ? 'busy' : ''} ${lite ? 'lite' : ''}`}
      style={{ ['--w' as string]: board.w, ['--h' as string]: board.h }}
      onPointerDown={(e) => {
        if (disabled) return;
        const p = cellAt(e.clientX, e.clientY);
        if (!p) return;
        start.current = { p, x: e.clientX, y: e.clientY, done: false };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Не во всех браузерах.
        }
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s || s.done || disabled) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < cellPx() * 0.35) return;
        s.done = true;
        const to = Math.abs(dx) > Math.abs(dy) ? { x: s.p.x + Math.sign(dx), y: s.p.y } : { x: s.p.x, y: s.p.y + Math.sign(dy) };
        if (to.x >= 0 && to.y >= 0 && to.x < board.w && to.y < board.h) onSwipe(s.p, to);
      }}
      onPointerUp={() => {
        const s = start.current;
        start.current = null;
        if (s && !s.done && !disabled) onTap(s.p);
      }}
      onPointerCancel={() => (start.current = null)}
    >
      <GemDefs />
      <div className="m3-tiles">
        {board.cells.map((c, i) => (
          <div key={i} className={`m3-tile ${((i % board.w) + Math.floor(i / board.w)) % 2 ? 'odd' : ''} ${c.ice ? `ice ice${c.ice}` : ''}`} />
        ))}
      </div>
      {gems.map(({ gem, x, y }) => (
        <GemView key={gem.id} gem={gem} x={x} y={y} drop={drops.get(gem.id) ?? 0} born={born.has(gem.id)} selected={same(selected, x, y)} hinted={!!hint && (same(hint[0], x, y) || same(hint[1], x, y))} lite={lite} />
      ))}
      {board.cells.map((c, i) =>
        c.block ? (
          <div key={`b${i}`} className="m3-block" style={{ transform: `translate3d(${(i % board.w) * 100}%, ${Math.floor(i / board.w) * 100}%, 0)` }}>
            {c.block.kind === 'crate' ? <CrateArt /> : <BoulderArt hp={c.block.hp} />}
          </div>
        ) : null,
      )}
      <div className="m3-fx">
        {effects.map((f) => {
          if (f.type === 'combo')
            return (
              <div key={f.key} className={`m3-combo ${f.big ? 'big' : ''}`}>
                {f.text}
              </div>
            );
          const cell = { left: `${(f.x / board.w) * 100}%`, top: `${(f.y / board.h) * 100}%` };
          if (f.type === 'pop')
            return (
              <div key={f.key} className="m3-pop" style={{ ...cell, ['--gc' as string]: GEM_COLORS[f.kind][2] }}>
                {f.special === 'rainbow' ? <div className="m3-rainbow" /> : <GemArt kind={f.kind} />}
                {!lite && <i className="m3-shards" />}
              </div>
            );
          if (f.type === 'row' || f.type === 'col')
            return (
              <div key={f.key} className={`m3-beam ${f.type}`} style={f.type === 'row' ? { top: cell.top } : { left: cell.left }}>
                {!lite && <i className="m3-trail" />}
              </div>
            );
          if (f.type === 'bomb') return <div key={f.key} className="m3-ring" style={{ ...cell, ['--r' as string]: f.r }} />;
          if (f.type === 'flash') return <div key={f.key} className="m3-flash" style={{ ...cell, ['--gc' as string]: f.kind ? GEM_COLORS[f.kind][2] : '#fff' }} />;
          return <div key={f.key} className={`m3-break ${f.block}`} style={cell} />;
        })}
      </div>
    </div>
  );
}
