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
  | { key: number; type: 'combo'; text: string; big: boolean }
  // Молния радуги: от радуги ко всем самоцветам её вида.
  | { key: number; type: 'chain'; x: number; y: number; to: Pos[]; kind?: GemKind }
  // Осколки бомбы разлетаются во все стороны.
  | { key: number; type: 'debris'; x: number; y: number; r: number }
  // Два особых вместе: волна на всю доску.
  | { key: number; type: 'mega'; x: number; y: number };

// Постоянный разброс без случайности: молния не дёргается между перерисовками.
const jit = (k: number, i: number) => ((Math.sin(k * 12.9898 + i * 78.233) * 43758.5453) % 1 + 1) % 1 - 0.5;

/** Ломаная молнии от точки к точке в клетках доски. */
function zigzag(key: number, x1: number, y1: number, x2: number, y2: number, amp = 0.32): string {
  const n = Math.max(3, Math.round(Math.hypot(x2 - x1, y2 - y1) * 1.6));
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / len;
  const ny = (x2 - x1) / len;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const o = i === 0 || i === n ? 0 : jit(key, i) * amp * 2;
    pts.push(`${(x1 + (x2 - x1) * t + nx * o).toFixed(2)},${(y1 + (y2 - y1) * t + ny * o).toFixed(2)}`);
  }
  return pts.join(' ');
}

function Lightning({ k, w, h, lines, color = '#9fd4ff' }: { k: number; w: number; h: number; lines: [number, number, number, number][]; color?: string }) {
  return (
    <svg className="m3-bolt" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ ['--bc' as string]: color }}>
      {lines.map(([x1, y1, x2, y2], i) => {
        const d = zigzag(k * 31 + i, x1, y1, x2, y2);
        return (
          <g key={i}>
            <polyline points={d} className="glow" />
            <polyline points={d} className="core" />
          </g>
        );
      })}
    </svg>
  );
}

interface Props {
  board: BoardState;
  // Новые самоцветы: на сколько клеток они падают сверху; особые, которые появились, — вспыхивают.
  drops: Map<number, number>;
  born: Set<number>;
  // Упавшие самоцветы пружинят при приземлении; класс чередуется, чтобы анимация шла заново.
  landed: Map<number, string>;
  effects: Effect[];
  selected: Pos | null;
  hint: [Pos, Pos] | null;
  disabled: boolean;
  lite: boolean;
  onTap: (p: Pos) => void;
  onSwipe: (a: Pos, b: Pos) => void;
}

const GemView = memo(function GemView({ gem, x, y, drop, born, land, selected, hinted, lite }: { gem: Gem; x: number; y: number; drop: number; born: boolean; land: string; selected: boolean; hinted: boolean; lite: boolean }) {
  // Блик: у каждого самоцвета свой момент, чтобы искорки пробегали по доске вразнобой.
  const style: Record<string, string | number> = { ['--sd']: `${-((gem.id * 2.37) % 11).toFixed(2)}s` };
  if (drop) style['--drop'] = drop;
  return (
    <div className="m3-gem" style={{ transform: `translate3d(${x * 100}%, ${y * 100}%, 0)` }}>
      <div className={`m3-gem-in ${drop ? 'm3-drop' : ''} ${born ? 'm3-born' : ''} ${land} ${selected ? 'm3-sel' : ''} ${hinted ? 'm3-hinted' : ''} ${lite ? '' : 'm3-gleam'}`} style={style}>
        {gem.special === 'rainbow' ? <div className="m3-rainbow" /> : <GemArt kind={gem.kind} />}
        {(gem.special === 'lineH' || gem.special === 'lineV') && <div className={`m3-stripe ${gem.special}`} />}
        {gem.special === 'bomb' && <div className="m3-bomb" style={{ ['--gc' as string]: GEM_COLORS[gem.kind][2] }} />}
        {/* Особый самоцвет: искры бегут по кругу — его видно сразу. */}
        {gem.special && !lite && <i className="m3-spark" style={{ ['--gc' as string]: GEM_COLORS[gem.kind][2] }} />}
      </div>
    </div>
  );
});

export function BoardView({ board, drops, born, landed, effects, selected, hint, disabled, lite, onTap, onSwipe }: Props) {
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
        <GemView key={gem.id} gem={gem} x={x} y={y} drop={drops.get(gem.id) ?? 0} born={born.has(gem.id)} land={landed.get(gem.id) ?? ''} selected={same(selected, x, y)} hinted={!!hint && (same(hint[0], x, y) || same(hint[1], x, y))} lite={lite} />
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
              <div key={f.key}>
                <div className={`m3-beam ${f.type}`} style={f.type === 'row' ? { top: cell.top } : { left: cell.left }}>
                  {!lite && <i className="m3-trail" />}
                </div>
                {!lite && <Lightning k={f.key} w={board.w} h={board.h} lines={[f.type === 'row' ? [0, f.y + 0.5, board.w, f.y + 0.5] : [f.x + 0.5, 0, f.x + 0.5, board.h]]} />}
              </div>
            );
          if (f.type === 'chain')
            return lite ? null : <Lightning key={f.key} k={f.key} w={board.w} h={board.h} color={f.kind ? GEM_COLORS[f.kind][2] : '#fff'} lines={f.to.map((t) => [f.x + 0.5, f.y + 0.5, t.x + 0.5, t.y + 0.5])} />;
          if (f.type === 'debris')
            return lite ? null : (
              <div key={f.key} className="m3-debris" style={{ ...cell, ['--r' as string]: f.r }}>
                {Array.from({ length: 10 }, (_, i) => (
                  <i key={i} style={{ ['--a' as string]: `${i * 36 + jit(f.key, i) * 30}deg`, ['--l' as string]: (1.4 + jit(f.key, i + 20) + f.r).toFixed(2) }} />
                ))}
              </div>
            );
          if (f.type === 'mega') return <div key={f.key} className="m3-mega" style={cell} />;
          if (f.type === 'bomb') return <div key={f.key} className="m3-ring" style={{ ...cell, ['--r' as string]: f.r }} />;
          if (f.type === 'flash') return <div key={f.key} className="m3-flash" style={{ ...cell, ['--gc' as string]: f.kind ? GEM_COLORS[f.kind][2] : '#fff' }} />;
          return <div key={f.key} className={`m3-break ${f.block}`} style={cell} />;
        })}
      </div>
    </div>
  );
}
