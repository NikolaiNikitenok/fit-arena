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

// Контур самоцвета каждого вида: разные формы, чтобы различались и без цвета.
const SHAPES: Record<GemKind, string> = {
  wood: 'M24 3l18 10.5v21L24 45 6 34.5v-21z',
  stone: 'M10 5h28l5 5v28l-5 5H10l-5-5V10z',
  gold: 'M24 2l21 22-21 22L3 24z',
  heart: 'M24 43S5 31 5 17.5C5 10.5 10 6 16 6c3.8 0 6.6 2 8 4.6C25.4 8 28.2 6 32 6c6 0 11 4.5 11 11.5C43 31 24 43 24 43z',
  sword: 'M24 3l20 13-7 26H11L4 16z',
};

// Знак ресурса поверх самоцвета.
function Glyph({ kind }: { kind: GemKind }) {
  const s = { stroke: 'rgba(20,16,10,.55)', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  if (kind === 'wood')
    return (
      <g {...s}>
        <path d="M24 33V21" />
        <path d="M24 26c-5 0-8-3.5-8-8 5 0 8 3 8 8zM24 23c4 0 6.5-3 6.5-6.5-4 0-6.5 2.5-6.5 6.5z" fill="rgba(20,16,10,.35)" />
      </g>
    );
  if (kind === 'stone') return <path d="M15 31l3-9 6-4 7 3 3 7-3 4H18z" {...s} fill="rgba(20,16,10,.25)" />;
  if (kind === 'gold')
    return (
      <g {...s}>
        <circle cx="24" cy="24" r="7.5" fill="rgba(120,70,0,.25)" />
        <path d="M24 20v8" />
      </g>
    );
  if (kind === 'heart') return <path d="M24 30.5s-6-3.8-6-8c0-2 1.4-3.4 3.2-3.4 1.3 0 2.2.7 2.8 1.6.6-.9 1.5-1.6 2.8-1.6 1.8 0 3.2 1.4 3.2 3.4 0 4.2-6 8-6 8z" fill="rgba(255,255,255,.75)" stroke="none" />;
  return (
    <g {...s}>
      <path d="M24 13v15M19.5 28h9M24 28v5" stroke="rgba(10,20,40,.6)" />
    </g>
  );
}

/** Определения градиентов и форм: один раз на доску, самоцветы ссылаются на них. */
export function GemDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {(Object.keys(GEM_COLORS) as GemKind[]).map((k) => (
          <linearGradient key={k} id={`m3g-${k}`} x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" stopColor={GEM_COLORS[k][0]} />
            <stop offset="1" stopColor={GEM_COLORS[k][1]} />
          </linearGradient>
        ))}
        {(Object.keys(SHAPES) as GemKind[]).map((k) => (
          <symbol key={k} id={`m3s-${k}`} viewBox="0 0 48 48">
            <path d={SHAPES[k]} fill={`url(#m3g-${k})`} stroke="rgba(0,0,0,.35)" strokeWidth="1.5" strokeLinejoin="round" />
            <path d={SHAPES[k]} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.5" transform="translate(24 24) scale(.82) translate(-24 -24)" />
            <ellipse cx="17" cy="14" rx="7" ry="3.2" fill="rgba(255,255,255,.45)" transform="rotate(-25 17 14)" />
            <Glyph kind={k} />
          </symbol>
        ))}
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
