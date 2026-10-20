import { Suspense, useRef } from 'react';
import { cellAt, Ctl, pan, SceneProps, Village3D } from './Village3D';

interface Props extends Omit<SceneProps, 'ctl'> {
  ctl: React.MutableRefObject<Ctl>;
  // Тап по земле: клетка (дробная).
  onTap?: (x: number, y: number) => void;
  // Перетаскивание призрака: новый левый верхний угол.
  onGhost?: (x: number, y: number) => void;
}

// Пальцами: один — двигать карту (или призрак постройки, если начали на нём), два — масштаб.
export function Viewport(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<{ moved: number; ghost: { ox: number; oy: number } | null; pinch: number }>({ moved: 0, ghost: null, pinch: 0 });
  const ctl = props.ctl.current;

  const at = (e: { clientX: number; clientY: number }) => (el.current ? cellAt(ctl, el.current, e.clientX, e.clientY) : null);
  const pinchDist = () => {
    const [a, b] = [...pts.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  return (
    <div
      ref={el}
      className="vil-view"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.current.size === 1) {
          g.current = { moved: 0, ghost: null, pinch: 0 };
          const c = at(e);
          const gh = props.ghost;
          if (c && gh && props.onGhost) {
            const s = gh.t === 'townhall' ? 3 : gh.t === 'wall' ? 1 : 2;
            if (c.x >= gh.x - 0.5 && c.x <= gh.x + s + 0.5 && c.y >= gh.y - 0.5 && c.y <= gh.y + s + 0.5) g.current.ghost = { ox: c.x - gh.x, oy: c.y - gh.y };
          }
        } else if (pts.current.size === 2) {
          g.current.pinch = pinchDist();
          g.current.moved += 100;
          g.current.ghost = null;
        }
      }}
      onPointerMove={(e) => {
        const prev = pts.current.get(e.pointerId);
        if (!prev) return;
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.current.size >= 2) {
          const d = pinchDist();
          if (g.current.pinch > 0) ctl.zoom = Math.max(7, Math.min(70, ctl.zoom * (d / g.current.pinch)));
          g.current.pinch = d;
          return;
        }
        g.current.moved += Math.abs(dx) + Math.abs(dy);
        if (g.current.ghost && props.onGhost) {
          const c = at(e);
          if (c) props.onGhost(Math.round(c.x - g.current.ghost.ox), Math.round(c.y - g.current.ghost.oy));
          return;
        }
        pan(ctl, dx, dy);
      }}
      onPointerUp={(e) => {
        pts.current.delete(e.pointerId);
        if (pts.current.size === 0 && g.current.moved < 8 && !g.current.ghost) {
          const c = at(e);
          if (c) props.onTap?.(c.x, c.y);
        }
      }}
      onPointerCancel={(e) => pts.current.delete(e.pointerId)}
      onWheel={(e) => (ctl.zoom = Math.max(7, Math.min(70, ctl.zoom * (e.deltaY > 0 ? 0.9 : 1.1))))}
    >
      <Suspense fallback={<div className="lazy-loading muted">Загружаем деревню…</div>}>
        <Village3D {...props} />
      </Suspense>
    </div>
  );
}
