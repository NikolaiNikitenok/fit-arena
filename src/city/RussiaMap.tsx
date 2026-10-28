import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { GRID, MAP_H, MAP_W, RUSSIA, WORLD } from './mapShapes';

// Карта России: города светятся тем ярче, чем больше у них показатель. Двигается пальцем, щипком и колёсиком,
// подписи появляются по мере приближения и не налезают друг на друга. Остальной мир пока только фоном.

export interface MapCity {
  key: string;
  name: string;
  x: number;
  y: number;
  // Население в тысячах: размер точки, пока в городе никто не играет.
  popK: number;
  // Показатель (повторы, герои, уровень) и его подпись; 0 — город пока пустой.
  value: number;
  label: string;
  place?: number;
  mine?: boolean;
}

interface View {
  k: number;
  x: number;
  y: number;
}

const MAX_ZOOM = 14;
// Сколько подписей видно на всей стране; дальше — больше с каждым приближением.
const BASE_LABELS = 5;

const clampView = (v: View, w: number, h: number, fit: number): View => {
  const k = Math.min(fit * MAX_ZOOM, Math.max(fit, v.k));
  // Край карты не уходит дальше трети экрана: страну не потерять.
  const mw = MAP_W * k;
  const mh = MAP_H * k;
  const x = mw <= w ? (w - mw) / 2 : Math.min(w / 3, Math.max(w - mw - w / 3, v.x));
  const y = mh <= h ? (h - mh) / 2 : Math.min(h / 3, Math.max(h - mh - h / 3, v.y));
  return { k, x, y };
};

export function RussiaMap({ cities, selected, onSelect, focus }: { cities: MapCity[]; selected: string | null; onSelect: (key: string | null) => void; focus?: { key: string; n: number } }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 360, h: 300 });
  const fit = size.w / MAP_W;
  const [view, setView] = useState<View | null>(null);
  const viewRef = useRef<View | null>(null);
  viewRef.current = view;
  const anim = useRef(0);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const set = (v: View) => setView(clampView(v, size.w, size.h, fit));
  const whole = () => clampView({ k: fit, x: 0, y: 0 }, size.w, size.h, fit);
  const v = view ?? whole();

  // Плавный перелёт к виду (кнопки, выбор города из таблицы).
  const fly = (to: View) => {
    cancelAnimationFrame(anim.current);
    const from = viewRef.current ?? whole();
    const target = clampView(to, size.w, size.h, fit);
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 380);
      const e = 1 - (1 - p) ** 3;
      setView({ k: from.k + (target.k - from.k) * e, x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e });
      if (p < 1) anim.current = requestAnimationFrame(tick);
    };
    anim.current = requestAnimationFrame(tick);
  };
  const zoomAt = (factor: number, sx = size.w / 2, sy = size.h / 2, smooth = true) => {
    const cur = viewRef.current ?? whole();
    const k = Math.min(fit * MAX_ZOOM, Math.max(fit, cur.k * factor));
    const next = { k, x: sx - ((sx - cur.x) * k) / cur.k, y: sy - ((sy - cur.y) * k) / cur.k };
    if (smooth) fly(next);
    else set(next);
  };

  // Город выбрали в таблице — летим к нему.
  useEffect(() => {
    if (!focus) return;
    const c = cities.find((x) => x.key === focus.key);
    if (!c) return;
    const k = Math.max(viewRef.current?.k ?? fit, fit * 4);
    fly({ k, x: size.w / 2 - c.x * k, y: size.h / 2 - c.y * k });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);

  // Жесты: один палец — двигать, два — масштаб. Касания не уходят шторке: иначе она закрывается вместо прокрутки карты.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let last: { x: number; y: number; d: number } | null = null;
    let downAt = 0;
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const centroid = () => {
      const a = [...pts.values()];
      const x = a.reduce((s, p) => s + p.x, 0) / a.length;
      const y = a.reduce((s, p) => s + p.y, 0) / a.length;
      const d = a.length > 1 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0;
      return { x, y, d };
    };
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      cancelAnimationFrame(anim.current);
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, local(e));
      if (pts.size === 1) {
        moved = 0;
        downAt = performance.now();
      }
      last = centroid();
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, local(e));
      const c = centroid();
      if (!last) return void (last = c);
      const cur = viewRef.current ?? whole();
      const factor = last.d && c.d ? c.d / last.d : 1;
      const k = Math.min(fit * MAX_ZOOM, Math.max(fit, cur.k * factor));
      moved += Math.hypot(c.x - last.x, c.y - last.y) + Math.abs(c.d - last.d);
      set({ k, x: c.x - ((last.x - cur.x) * k) / cur.k, y: c.y - ((last.y - cur.y) * k) / cur.k });
      last = c;
    };
    const up = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      const p = pts.get(e.pointerId)!;
      pts.delete(e.pointerId);
      last = pts.size ? centroid() : null;
      // Короткое касание без движения — выбор города (или снять выбор).
      if (!pts.size && moved < 8 && performance.now() - downAt < 500) {
        const cur = viewRef.current ?? whole();
        const mx = (p.x - cur.x) / cur.k;
        const my = (p.y - cur.y) / cur.k;
        // Ближайший город в пределах пальца (22 пикселя на экране).
        let best: MapCity | null = null;
        let bestD = 22 / cur.k;
        for (const c of cities) {
          const d = Math.hypot(c.x - mx, c.y - my);
          if (d < bestD && (c.value > 0 || cur.k > fit * 2.5 || c.popK > 900)) [best, bestD] = [c, d];
        }
        onSelectRef.current(best?.key ?? null);
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomRef.current(Math.exp(-e.deltaY / 300), e.clientX - r.left, e.clientY - r.top, false);
    };
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('touchstart', stop, { passive: true });
    el.addEventListener('touchmove', stop, { passive: true });
    el.addEventListener('mousedown', stop);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('touchstart', stop);
      el.removeEventListener('touchmove', stop);
      el.removeEventListener('mousedown', stop);
    };
    // Обработчики читают свежие значения через ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, cities]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const zoomRef = useRef(zoomAt);
  zoomRef.current = zoomAt;

  // Кнопки приближают к выбранному городу, к своему или к Москве — не к пустой середине Сибири.
  const anchor = (): [number, number] => {
    const c = cities.find((x) => x.key === selected) ?? cities.find((x) => x.mine) ?? cities[0];
    const sx = v.x + (c?.x ?? MAP_W / 2) * v.k;
    const sy = v.y + (c?.y ?? MAP_H / 2) * v.k;
    return sx >= 0 && sx <= size.w && sy >= 0 && sy <= size.h ? [sx, sy] : [size.w / 2, size.h / 2];
  };

  const max = useMemo(() => Math.max(1, ...cities.map((c) => c.value)), [cities]);
  const zoom = v.k / fit;
  const s = 1 / v.k;

  // Подписи: по убыванию показателя, сколько влезает без наложений; выбранный и свой город — всегда.
  const labels = useMemo(() => {
    const order = [...cities].sort((a, b) => Number(b.key === selected) - Number(a.key === selected) || Number(!!b.mine) - Number(!!a.mine) || b.value - a.value || b.popK - a.popK);
    const limit = Math.round(BASE_LABELS * zoom * zoom);
    const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const out: { c: MapCity; full: boolean; left: boolean }[] = [];
    for (const c of order) {
      const forced = c.key === selected || !!c.mine;
      const active = c.value > 0;
      if (!forced && out.length >= limit) break;
      // Пустые города — тускло и только крупные: миллионники на всей стране, остальные вблизи.
      if (!forced && !active && c.popK * zoom * zoom < 1000) continue;
      const sx = v.x + c.x * v.k;
      const sy = v.y + c.y * v.k;
      if (!forced && (sx < -40 || sx > size.w + 40 || sy < -20 || sy > size.h + 20)) continue;
      const full = active || forced;
      const w = (c.name.length + (full ? c.label.length + 2 : 0)) * 6.4 + 14;
      // У правого края подпись — слева от точки; не влезает и так — не подписываем.
      const left = sx + 8 + w > size.w - 4;
      const b = left ? { x0: sx - 8 - w, y0: sy - 11, x1: sx - 6, y1: sy + 11 } : { x0: sx + 6, y0: sy - 11, x1: sx + 6 + w, y1: sy + 11 };
      if (!forced && (b.x0 < 2 || b.y0 < 2 || b.y1 > size.h - 2 || boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0))) continue;
      boxes.push(b);
      out.push({ c, full, left });
    }
    return out;
  }, [cities, selected, zoom, v.x, v.y, v.k, size.w, size.h]);

  return (
    <div className="rmap" ref={box}>
      <svg width={size.w} height={size.h} role="img" aria-label="Карта городов России">
        <defs>
          <radialGradient id="rmap-heat">
            <stop offset="0" stopColor="#ffd27a" stopOpacity=".95" />
            <stop offset=".35" stopColor="#ff8a5c" stopOpacity=".55" />
            <stop offset="1" stopColor="#ff7a59" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="rmap-land" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2b3047" />
            <stop offset="1" stopColor="#24283a" />
          </linearGradient>
        </defs>
        <g transform={`translate(${v.x} ${v.y}) scale(${v.k})`}>
          <path d={GRID} className="rmap-grid" />
          <path d={WORLD} className="rmap-world" />
          {/* Свечение и обводка под заливкой: заливка прячет внутренний шов на Чукотке. */}
          <path d={RUSSIA} className="rmap-glow" style={{ strokeWidth: 9 * s }} />
          <path d={RUSSIA} className="rmap-edge" style={{ strokeWidth: 2.6 * s }} />
          <path d={RUSSIA} className="rmap-land" />
          {cities.map((c) => {
            const share = c.value / max;
            if (c.value <= 0) return <circle key={c.key} cx={c.x} cy={c.y} r={Math.max(1.3, Math.min(4, Math.sqrt(c.popK) / 9)) * s * Math.min(2, Math.sqrt(zoom))} className="rmap-dot" />;
            const r = (7 + 26 * Math.sqrt(share)) * s * Math.min(2.2, Math.sqrt(zoom));
            return (
              <g key={c.key}>
                <circle cx={c.x} cy={c.y} r={r} fill="url(#rmap-heat)" />
                <circle cx={c.x} cy={c.y} r={(2.4 + 2 * share) * s * Math.min(1.8, Math.sqrt(zoom))} className="rmap-core" />
              </g>
            );
          })}
          {cities
            .filter((c) => c.mine || c.key === selected)
            .map((c) => (
              <circle key={`ring-${c.key}`} cx={c.x} cy={c.y} r={9 * s} className={c.mine ? 'rmap-ring mine' : 'rmap-ring'} style={{ strokeWidth: 2 * s }} />
            ))}
        </g>
        {labels.map(({ c, full, left }) => {
          const sx = v.x + c.x * v.k;
          const sy = v.y + c.y * v.k;
          return (
            <g key={`l-${c.key}`} className={`rmap-label${c.mine ? ' mine' : ''}${c.key === selected ? ' sel' : ''}${full ? '' : ' empty'}${c.place && c.place <= 3 && full ? ` p${c.place}` : ''}`} transform={`translate(${left ? sx - 8 : sx + 8} ${sy})`}>
              <text y="4" textAnchor={left ? 'end' : 'start'}>
                {c.place && c.place <= 3 && full ? <tspan className="medal">{['🥇', '🥈', '🥉'][c.place - 1]} </tspan> : null}
                <tspan className="nm">{c.name}</tspan>
                {full && c.value > 0 ? <tspan className="val"> {c.label}</tspan> : null}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="rmap-zoom">
        <button onClick={() => zoomAt(1.8, ...anchor())} aria-label="Приблизить">
          +
        </button>
        <button onClick={() => zoomAt(1 / 1.8, ...anchor())} aria-label="Отдалить">
          −
        </button>
        {zoom > 1.05 && (
          <button className="all" onClick={() => fly(whole())} aria-label="Вся страна">
            ⤢
          </button>
        )}
      </div>
      <div className="rmap-soon">🌍 Весь мир — скоро</div>
    </div>
  );
}
