// Рисунки подземелья: самоцветы, препятствия, чудовища и значки ресурсов. Всё SVG, без эмодзи.
import type { Resource } from '../resources';
import type { GemKind } from './engine';
import type { MonsterShape } from './dungeon';

type P = { size?: number; className?: string };

/** Молния заряда. */
export const Bolt = ({ size = 16, className }: P) => (
  <svg className={`icon ${className ?? ''}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M13.5 2L4 13.5h6.5L9 22l10-12.5h-6.6L13.5 2z" fill="currentColor" />
  </svg>
);

/** Значки ресурсов для счётчиков и наград. */
export function ResIcon({ res, size = 16 }: { res: Resource; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {res === 'wood' && (
        <>
          <rect x="2.5" y="7" width="16" height="10" rx="2" fill="#a0683a" />
          <ellipse cx="18.5" cy="12" rx="3.2" ry="5" fill="#e6b980" />
          <ellipse cx="18.5" cy="12" rx="1.6" ry="2.6" fill="none" stroke="#a0683a" strokeWidth="1.2" />
          <path d="M5 10.5h8M7 13.5h7" stroke="#7a4a22" strokeWidth="1.2" strokeLinecap="round" />
        </>
      )}
      {res === 'stone' && (
        <>
          <path d="M4 17l2-8 5-4 6 2 3 6-2 5H6z" fill="#90a4ae" />
          <path d="M11 5l1 6-6-2M12 11l5 7M12 11l8 2" stroke="#607d8b" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
        </>
      )}
      {res === 'gold' && (
        <>
          <path d="M3 17l3-8h12l3 8z" fill="#f9b928" />
          <path d="M6 9h12l-1.6 4H7.6z" fill="#ffe08a" />
          <path d="M3 17h18" stroke="#b77d0b" strokeWidth="1.4" />
        </>
      )}
    </svg>
  );
}

// Цвета самоцветов: светлый и тёмный край градиента, цвет вспышки.
export const GEM_COLORS: Record<GemKind, [string, string, string]> = {
  wood: ['#9be27a', '#2f7d32', '#9be27a'],
  stone: ['#d3dde4', '#5c6f7c', '#cfd8dc'],
  gold: ['#ffe9a0', '#e09a12', '#ffd54f'],
  heart: ['#ff9db0', '#c2185b', '#ff6b81'],
  sword: ['#9ad9ff', '#1e5fbf', '#64b5f6'],
};
// Середина огранки: между светлым и тёмным, чуть насыщеннее.
const GEM_MID: Record<GemKind, string> = { wood: '#4fb544', stone: '#8fa3b0', gold: '#f7bf2a', heart: '#ec407a', sword: '#3b8fe8' };

// Контур самоцвета каждого вида: разные формы, чтобы различались и без цвета
// (шестигранник, восьмигранник, ромб, сердце, щит).
const POLYS: Partial<Record<GemKind, [number, number][]>> = {
  wood: [[24, 3], [42, 13.5], [42, 34.5], [24, 45], [6, 34.5], [6, 13.5]],
  stone: [[14, 4], [34, 4], [44, 14], [44, 34], [34, 44], [14, 44], [4, 34], [4, 14]],
  gold: [[24, 2], [46, 24], [24, 46], [2, 24]],
  sword: [[24, 3], [44, 16], [37, 43], [11, 43], [4, 16]],
};
const HEART = 'M24 43S5 31 5 17.5C5 10.5 10 6 16 6c3.8 0 6.6 2 8 4.6C25.4 8 28.2 6 32 6c6 0 11 4.5 11 11.5C43 31 24 43 24 43z';
const pts = (v: [number, number][]) => v.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const polyPath = (v: [number, number][]) => `M${pts(v).replace(/ /g, 'L')}z`;
const SHAPES: Record<GemKind, string> = {
  wood: polyPath(POLYS.wood!),
  stone: polyPath(POLYS.stone!),
  gold: polyPath(POLYS.gold!),
  heart: HEART,
  sword: polyPath(POLYS.sword!),
};

// Грани: от каждого ребра контура к «площадке» в середине. Свет сверху слева: грани, смотрящие
// к свету, светлее, от света — темнее. Считается один раз при загрузке.
const LIGHT = [-0.6, -0.8];
function facets(v: [number, number][]) {
  const cx = v.reduce((s, p) => s + p[0], 0) / v.length;
  const cy = v.reduce((s, p) => s + p[1], 0) / v.length;
  const inner = v.map(([x, y]): [number, number] => [cx + (x - cx) * 0.5, cy + (y - cy) * 0.5]);
  const out = v.map((p, i) => {
    const q = v[(i + 1) % v.length];
    const mx = (p[0] + q[0]) / 2 - cx;
    const my = (p[1] + q[1]) / 2 - cy;
    const len = Math.hypot(mx, my) || 1;
    const lit = (mx / len) * LIGHT[0] + (my / len) * LIGHT[1];
    return { d: pts([p, q, inner[(i + 1) % v.length], inner[i]]), lit };
  });
  return { inner: pts(inner), out };
}
const FACETS = Object.fromEntries((Object.keys(POLYS) as GemKind[]).map((k) => [k, facets(POLYS[k]!)])) as Partial<Record<GemKind, ReturnType<typeof facets>>>;

// Знак ресурса поверх самоцвета.
function Glyph({ kind }: { kind: GemKind }) {
  const s = { stroke: 'rgba(20,16,10,.5)', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  if (kind === 'wood')
    return (
      <g {...s}>
        <path d="M24 33V21" />
        <path d="M24 26c-5 0-8-3.5-8-8 5 0 8 3 8 8zM24 23c4 0 6.5-3 6.5-6.5-4 0-6.5 2.5-6.5 6.5z" fill="rgba(20,16,10,.35)" />
      </g>
    );
  if (kind === 'stone') return <path d="M15 31l3-9 6-4 7 3 3 7-3 4H18z" {...s} fill="rgba(20,16,10,.22)" />;
  if (kind === 'gold')
    return (
      <g {...s}>
        <circle cx="24" cy="24" r="7.5" fill="rgba(120,70,0,.25)" />
        <path d="M24 20v8" />
      </g>
    );
  if (kind === 'heart') return <path d="M24 30.5s-6-3.8-6-8c0-2 1.4-3.4 3.2-3.4 1.3 0 2.2.7 2.8 1.6.6-.9 1.5-1.6 2.8-1.6 1.8 0 3.2 1.4 3.2 3.4 0 4.2-6 8-6 8z" fill="rgba(255,255,255,.8)" stroke="none" />;
  return (
    <g {...s}>
      <path d="M24 13v15M19.5 28h9M24 28v5" stroke="rgba(10,20,40,.6)" />
    </g>
  );
}

/**
 * Определения градиентов и форм: один раз на доску, самоцветы ссылаются на них (use). Огранка:
 * объёмный градиент, светлые и тёмные грани, площадка, блик и искра.
 */
export function GemDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {(Object.keys(GEM_COLORS) as GemKind[]).map((k) => (
          <radialGradient key={k} id={`m3g-${k}`} cx="0.36" cy="0.3" r="0.85">
            <stop offset="0" stopColor={GEM_COLORS[k][0]} />
            <stop offset="0.5" stopColor={GEM_MID[k]} />
            <stop offset="1" stopColor={GEM_COLORS[k][1]} />
          </radialGradient>
        ))}
        <linearGradient id="m3-table" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".45" />
          <stop offset="1" stopColor="#fff" stopOpacity=".05" />
        </linearGradient>
        {(Object.keys(SHAPES) as GemKind[]).map((k) => {
          const fc = FACETS[k];
          return (
            <symbol key={k} id={`m3s-${k}`} viewBox="0 0 48 48">
              <path d={SHAPES[k]} fill={`url(#m3g-${k})`} stroke="rgba(0,0,0,.45)" strokeWidth="1.6" strokeLinejoin="round" />
              {fc ? (
                <>
                  {fc.out.map((f, i) => (
                    <polygon key={i} points={f.d} fill={f.lit > 0 ? '#fff' : '#000'} opacity={f.lit > 0 ? 0.08 + f.lit * 0.3 : 0.06 - f.lit * 0.24} />
                  ))}
                  <polygon points={fc.inner} fill="url(#m3-table)" stroke="rgba(255,255,255,.35)" strokeWidth=".8" strokeLinejoin="round" />
                </>
              ) : (
                <>
                  <path d={SHAPES[k]} fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1.4" transform="translate(24 24) scale(.8) translate(-24 -24)" />
                  <path d="M24 10.6L24 40M8 15l16 10 16-10" stroke="rgba(0,0,0,.12)" strokeWidth="1.2" fill="none" />
                  <path d={SHAPES[k]} fill="url(#m3-table)" transform="translate(24 22) scale(.5) translate(-24 -24)" />
                </>
              )}
              <ellipse cx="16.5" cy="13" rx="6.5" ry="2.8" fill="#fff" opacity=".55" transform="rotate(-30 16.5 13)" />
              <path d="M33 31.5l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" fill="#fff" opacity=".7" />
              <g transform="translate(24 24) scale(.82) translate(-24 -24)">
                <Glyph kind={k} />
              </g>
            </symbol>
          );
        })}
      </defs>
    </svg>
  );
}

export const GemArt = ({ kind }: { kind: GemKind }) => (
  <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">
    <use href={`#m3s-${kind}`} />
  </svg>
);

/** Самоцвет без общих определений: для подписей вне доски. */
export const GemIcon = ({ kind, size = 18 }: { kind: GemKind; size?: number }) => (
  <svg className="icon" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
    <path d={SHAPES[kind]} fill={GEM_COLORS[kind][1]} stroke={GEM_COLORS[kind][0]} strokeWidth="3" strokeLinejoin="round" />
  </svg>
);

export function CrateArt({ cracked }: { cracked?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">
      <rect x="4" y="4" width="40" height="40" rx="5" fill="#a86f3e" stroke="#5e3a1a" strokeWidth="2" />
      <rect x="9" y="9" width="30" height="30" rx="2" fill="#bf8550" />
      <path d="M10 10l28 28M38 10L10 38" stroke="#7a4a22" strokeWidth="4" strokeLinecap="round" />
      {cracked && <path d="M18 4l4 9-5 6 6 7" stroke="#2e1a0a" strokeWidth="1.6" fill="none" />}
    </svg>
  );
}

export function BoulderArt({ hp }: { hp: number }) {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">
      <path d="M6 34l3-15 10-11 14 1 9 11 1 16-8 7H13z" fill="#78909c" stroke="#37474f" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 20l8-8 10 1" stroke="#b0bec5" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      {hp <= 1 && <path d="M24 9l-3 10 6 6-5 9 3 8M27 25l9 1" stroke="#263238" strokeWidth="1.8" fill="none" strokeLinejoin="round" />}
    </svg>
  );
}

/** Чудовище подземелья: форма по виду, цвет земли, у хранителя — рога и корона. */
export function MonsterFace({ shape, color, boss, size = 72, angry }: { shape: MonsterShape; color: string; boss?: boolean; size?: number; angry?: boolean }) {
  const eyeY = shape === 'bat' ? 30 : shape === 'skull' ? 30 : 32;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="m3-monster-svg">
      <defs>
        <radialGradient id={`m3m-${shape}-${color.slice(1)}`} cx="0.4" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset=".35" stopColor={color} />
          <stop offset="1" stopColor="#1b1520" />
        </radialGradient>
      </defs>
      {(() => {
        const fill = `url(#m3m-${shape}-${color.slice(1)})`;
        if (shape === 'slime') return <path d="M8 52c0-20 10-38 24-38s24 18 24 38c-3 3-6-1-8 1s-5 3-8 0-5-1-8 1-6 1-8-1-5-1-8 0-6 2-8-1z" fill={fill} />;
        if (shape === 'bat')
          return (
            <>
              <path d="M32 22C24 12 10 12 2 22c6 0 8 4 8 8 4-3 8-2 10 2" fill={color} opacity=".75" />
              <path d="M32 22c8-10 22-10 30 0-6 0-8 4-8 8-4-3-8-2-10 2" fill={color} opacity=".75" />
              <circle cx="32" cy="34" r="16" fill={fill} />
              <path d="M22 20l2-9 5 7M42 20l-2-9-5 7" fill={color} />
            </>
          );
        if (shape === 'golem')
          return (
            <>
              <path d="M10 56l2-30 8-12h24l8 12 2 30z" fill={fill} stroke="#00000055" strokeWidth="1.5" />
              <path d="M18 24h28M14 40h10M40 44h10" stroke="#00000040" strokeWidth="2" />
            </>
          );
        if (shape === 'skull')
          return (
            <>
              <path d="M12 30c0-12 9-20 20-20s20 8 20 20c0 7-4 11-8 13v8H20v-8c-4-2-8-6-8-13z" fill={fill} />
              <path d="M26 47v4M32 47v4M38 47v4" stroke="#1b1520" strokeWidth="2" />
            </>
          );
        return <path d="M32 8c13 0 20 10 20 22 0 8-2 14-2 24-4-4-6-2-9 1-3-4-6-4-9 0-3-4-6-4-9 0-3-3-5-5-9-1 0-10-2-16-2-24C12 18 19 8 32 8z" fill={fill} opacity=".95" />;
      })()}
      {boss && (
        <>
          <path d="M14 22l-6-14 12 8M50 22l6-14-12 8" fill="#ffe0b2" stroke="#5d4037" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M22 12l4-7 6 6 6-6 4 7z" fill="#ffd54f" stroke="#b77d0b" strokeWidth="1.2" strokeLinejoin="round" />
        </>
      )}
      <g>
        <ellipse cx="24" cy={eyeY} rx="5.5" ry={angry ? 3.6 : 5} fill={shape === 'skull' ? '#1b1520' : '#fff'} />
        <ellipse cx="40" cy={eyeY} rx="5.5" ry={angry ? 3.6 : 5} fill={shape === 'skull' ? '#1b1520' : '#fff'} />
        <circle cx="25" cy={eyeY + 1} r="2.4" fill={shape === 'skull' ? (angry ? '#ff5252' : '#ffb74d') : '#1b1520'} />
        <circle cx="39" cy={eyeY + 1} r="2.4" fill={shape === 'skull' ? (angry ? '#ff5252' : '#ffb74d') : '#1b1520'} />
        {angry ? (
          <path d={`M17 ${eyeY - 7}l10 3M47 ${eyeY - 7}l-10 3`} stroke="#1b1520" strokeWidth="2.6" strokeLinecap="round" />
        ) : (
          <path d={`M18 ${eyeY - 6}q6 -3 10 0M36 ${eyeY - 6}q4 -3 10 0`} stroke="#1b1520" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".6" />
        )}
      </g>
      {shape !== 'skull' && <path d={angry ? 'M24 46q8 -6 16 0' : 'M25 44q7 4 14 0'} stroke="#1b1520" strokeWidth="2.4" fill={angry ? '#1b1520' : 'none'} strokeLinecap="round" />}
    </svg>
  );
}
