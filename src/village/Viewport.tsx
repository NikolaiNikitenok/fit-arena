import { createContext, Suspense, useContext, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { bubbleAt, cellAt, Ctl, pan, SceneProps, stopCamera, Village3D, zoomAt } from './Village3D';
import { SIZE } from './looks';

export interface ViewportProps extends Omit<SceneProps, 'ctl'> {
  ctl: React.MutableRefObject<Ctl>;
  // Тап по земле: клетка (дробная).
  onTap?: (x: number, y: number) => void;
  // Тап по пузырю урожая над постройкой i.
  onBubble?: (i: number, clientX: number, clientY: number) => void;
  // Перетаскивание призрака: новый левый верхний угол.
  onGhost?: (x: number, y: number) => void;
}

// Пальцами: один — двигать карту (или призрак постройки, если начали на нём), два — масштаб.
export function Viewport(props: ViewportProps) {
  const el = useRef<HTMLDivElement>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<{ moved: number; ghost: { ox: number; oy: number } | null; pinch: number; mid: { x: number; y: number } | null; vx: number; vy: number; t: number }>({ moved: 0, ghost: null, pinch: 0, mid: null, vx: 0, vy: 0, t: 0 });
  const ctl = props.ctl.current;

  const at = (e: { clientX: number; clientY: number }) => (el.current ? cellAt(ctl, el.current, e.clientX, e.clientY) : null);
  const pinchDist = () => {
    const [a, b] = [...pts.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const pinchMid = () => {
    const [a, b] = [...pts.current.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  // Точка экрана относительно центра холста.
  const fromCenter = (x: number, y: number) => {
    const r = el.current?.getBoundingClientRect();
    return r ? { x: x - (r.left + r.width / 2), y: y - (r.top + r.height / 2) } : { x: 0, y: 0 };
  };

  return (
    <div
      ref={el}
      className="vil-view"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        stopCamera(ctl);
        if (pts.current.size === 1) {
          g.current = { moved: 0, ghost: null, pinch: 0, mid: null, vx: 0, vy: 0, t: performance.now() };
          const c = at(e);
          const gh = props.ghost;
          if (c && gh && props.onGhost) {
            const s = SIZE[gh.t];
            if (c.x >= gh.x - 0.5 && c.x <= gh.x + s + 0.5 && c.y >= gh.y - 0.5 && c.y <= gh.y + s + 0.5) g.current.ghost = { ox: c.x - gh.x, oy: c.y - gh.y };
          }
        } else if (pts.current.size === 2) {
          g.current.pinch = pinchDist();
          g.current.mid = pinchMid();
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
          // Два пальца: масштаб вокруг точки между ними и сдвиг, если пальцы едут вместе.
          const d = pinchDist();
          const m = pinchMid();
          if (g.current.mid) pan(ctl, m.x - g.current.mid.x, m.y - g.current.mid.y);
          if (g.current.pinch > 0) {
            const c = fromCenter(m.x, m.y);
            zoomAt(ctl, ctl.zoom * (d / g.current.pinch), c.x, c.y);
          }
          g.current.pinch = d;
          g.current.mid = m;
          return;
        }
        g.current.moved += Math.abs(dx) + Math.abs(dy);
        // Скорость пальца для инерции: сглаженная, пикселей в секунду.
        const now = performance.now();
        const dtm = Math.max(1, now - g.current.t);
        g.current.t = now;
        g.current.vx = g.current.vx * 0.6 + ((dx / dtm) * 1000) * 0.4;
        g.current.vy = g.current.vy * 0.6 + ((dy / dtm) * 1000) * 0.4;
        if (g.current.ghost && props.onGhost) {
          const c = at(e);
          if (c) props.onGhost(Math.round(c.x - g.current.ghost.ox), Math.round(c.y - g.current.ghost.oy));
          return;
        }
        pan(ctl, dx, dy);
      }}
      onPointerUp={(e) => {
        pts.current.delete(e.pointerId);
        if (pts.current.size === 1) g.current.mid = null;
        // Бросок: палец ушёл быстро и только что двигался — карта катится дальше.
        if (pts.current.size === 0 && g.current.moved >= 8 && !g.current.ghost && g.current.pinch === 0 && performance.now() - g.current.t < 80 && Math.hypot(g.current.vx, g.current.vy) > 150)
          ctl.fling = { vx: g.current.vx, vy: g.current.vy };
        if (pts.current.size === 0 && g.current.moved < 8 && !g.current.ghost) {
          const hit = el.current && props.onBubble && props.bubbles ? bubbleAt(ctl, el.current, e.clientX, e.clientY, props.buildings, props.bubbles) : null;
          if (hit != null) return props.onBubble?.(hit, e.clientX, e.clientY);
          const c = at(e);
          if (c) props.onTap?.(c.x, c.y);
        }
      }}
      onPointerCancel={(e) => pts.current.delete(e.pointerId)}
      onWheel={(e) => {
        stopCamera(ctl);
        const c = fromCenter(e.clientX, e.clientY);
        zoomAt(ctl, ctl.zoom * (e.deltaY > 0 ? 0.9 : 1.1), c.x, c.y);
      }}
    >
      <Suspense fallback={<div className="lazy-loading muted">Загружаем деревню…</div>}>
        <Village3D {...props} />
      </Suspense>
    </div>
  );
}

// Одна 3D-сцена на деревню и бой. Раньше бой открывал свой холст: старый WebGL гасился, новый заново
// собирал все шейдеры и грузил модели — экран замирал на старте набега. Теперь холст один: экран деревни
// держит его на месте (ViewHost), а бой лишь подменяет, что в нём показано (useHostedView).

interface ViewSlot {
  props: ViewportProps | null;
  subs: Set<() => void>;
}
const ViewCtx = createContext<ViewSlot | null>(null);

export function useViewSlot(): ViewSlot {
  return useState<ViewSlot>(() => ({ props: null, subs: new Set() }))[0];
}

/**
 * Холст на постоянном месте. С props — показывает их (экран деревни), без — что прислал бой
 * (до первой присылки — последнее показанное, чтобы холст не пропадал ни на кадр).
 */
export function ViewHost({ slot, props, children }: { slot: ViewSlot; props?: ViewportProps; children?: React.ReactNode }) {
  const sent = useSyncExternalStore(
    (cb) => {
      slot.subs.add(cb);
      return () => slot.subs.delete(cb);
    },
    () => slot.props,
  );
  if (props) slot.props = props;
  const shown = props ?? sent;
  return (
    <ViewCtx.Provider value={slot}>
      {shown && <Viewport {...shown} />}
      {children}
    </ViewCtx.Provider>
  );
}

/** Показать сцену в общем холсте; вне ViewHost вернёт свой Viewport. */
export function useHostedView(props: ViewportProps): React.ReactNode {
  const slot = useContext(ViewCtx);
  useLayoutEffect(() => {
    if (!slot) return;
    slot.props = props;
    for (const f of slot.subs) f();
  });
  return slot ? null : <Viewport {...props} />;
}
