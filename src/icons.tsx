// Простые иконки одного стиля вместо эмодзи: эмодзи на разных телефонах рисуются по-разному.
import { useId } from 'react';

type P = { size?: number; className?: string };
const svg = (size: number, className: string | undefined, body: React.ReactNode, fill = false) => (
  <svg className={`icon ${className ?? ''}`} width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {body}
  </svg>
);

export const Heart = ({ size = 16, className }: P) => svg(size, className, <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.6 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.5 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />, true);

export const Flame = ({ size = 16, className }: P) =>
  svg(size, className, <path d="M12 22c4.2 0 7-2.8 7-6.8 0-3.2-1.8-5.6-3.6-7.6-.4 1.9-1.4 3.2-2.6 3.8.3-3.4-1-6.6-3.8-9.4-.2 3.4-1.8 5.4-3.4 7.4C4.3 11.1 5 13.4 5 15.2 5 19.2 7.8 22 12 22z" />, true);

export const Coin = ({ size = 16, className }: P) =>
  svg(
    size,
    className,
    <>
      <circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="6" fill="none" stroke="rgba(0,0,0,.28)" strokeWidth="1.8" />
    </>,
  );

export const Shield = ({ size = 22, className }: P) => svg(size, className, <path d="M12 3l8 3v6c0 4.6-3.3 8.1-8 9-4.7-.9-8-4.4-8-9V6l8-3z" />);

export const MapIcon = ({ size = 22, className }: P) =>
  svg(
    size,
    className,
    <>
      <path d="M9 4L3 6.5v13.5L9 17.5l6 2.5 6-2.5V4l-6 2.5L9 4z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </>,
  );

export const Swords = ({ size = 22, className }: P) =>
  svg(
    size,
    className,
    <>
      <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
      <path d="M13 19l6-6M16 16l4 4M19 21l2-2" />
      <path d="M9.5 6.5L13 3h3v3l-3.5 3.5" />
      <path d="M5 14l-2 2 4 4 2-2" />
    </>,
  );

// Звезда Telegram: цена Pro Pass.
export const Star = ({ size = 16, className }: P) => svg(size, className, <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" />, true);

export const Lock = ({ size = 14, className }: P) =>
  svg(
    size,
    className,
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </>,
  );

export const Cog = ({ size = 18, className }: P) =>
  svg(
    size,
    className,
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </>,
  );

/** Склянка с зельем или свиток: цвет — из описания зелья. */
export const Flask = ({ size = 40, color = '#ff6b81', scroll = false }: { size?: number; color?: string; scroll?: boolean }) =>
  scroll ? (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="9" y="8" width="22" height="24" rx="3" fill="#f3e3c2" />
      <rect x="6" y="6" width="28" height="6" rx="3" fill="#d9bf8f" />
      <rect x="6" y="28" width="28" height="6" rx="3" fill="#d9bf8f" />
      <path d="M13 17h14M13 21h14M13 25h9" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="16" y="4" width="8" height="5" rx="1.5" fill="#b07a4f" />
      <path d="M17 9h6v6.5l7.2 10.6A5 5 0 0126 34H14a5 5 0 01-4.2-7.9L17 15.5z" fill="rgba(255,255,255,.18)" stroke="rgba(255,255,255,.55)" strokeWidth="1.5" />
      <path d="M11.6 24h16.8l1.6 2.4A3.6 3.6 0 0127 32H13a3.6 3.6 0 01-3-5.6z" fill={color} />
      <circle cx="16" cy="27" r="1.4" fill="rgba(255,255,255,.7)" />
    </svg>
  );

export const Banner = ({ size = 22, className }: P) =>
  svg(
    size,
    className,
    <>
      <path d="M5 21V4" />
      <path d="M5 4h12l-2.5 4L17 12H5" />
    </>,
  );

export const Send = ({ size = 18, className }: P) => svg(size, className, <path d="M4 12l16-8-6 16-3-7-7-1z" />);

export const Check = ({ size = 16, className }: P) => svg(size, className, <path d="M5 12.5l4.2 4.2L19 7" />);

/** Сундук: награда пропуска. */
export const Chest = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
    <path d="M6 17h28v15a3 3 0 01-3 3H9a3 3 0 01-3-3z" fill="#9a5b2e" />
    <path d="M6 17c0-6 4-10 14-10s14 4 14 10z" fill="#b8733d" />
    <path d="M6 17h28v4H6z" fill="#e0b04a" />
    <path d="M13 8.5V35M27 8.5V35" stroke="#e0b04a" strokeWidth="2.5" />
    <rect x="17" y="18" width="6" height="8" rx="1.5" fill="#ffe08a" stroke="#7a4a1c" strokeWidth="1.2" />
  </svg>
);

const SHIELD = 'M50 4L92 17v36c0 29-17 49-42 59C25 102 8 82 8 53V17z';
const SHIELD_IN = 'M50 13l34 10.5V53c0 23.5-13.5 40-34 48.5C29.5 93 16 76.5 16 53V23.5z';

/**
 * Щит пропуска: серый — бесплатный, золотой — Pro. Внутри номер ступени или звезда.
 * dim — ступень ещё не открыта.
 */
export function PassShield({ size = 40, gold = false, dim = false, label, star = false }: { size?: number; gold?: boolean; dim?: boolean; label?: string | number; star?: boolean }) {
  const id = useId().replace(/:/g, '');
  const c = gold ? ['#fff4c2', '#ffd45c', '#d99a22', '#8a5a0c'] : ['#f3f6fa', '#c3cad4', '#87909e', '#4c5462'];
  return (
    <svg width={size} height={size * 1.16} viewBox="0 0 100 116" aria-hidden="true" style={dim ? { filter: 'saturate(.35) brightness(.6)' } : undefined}>
      <defs>
        <linearGradient id={`r${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c[0]} />
          <stop offset=".45" stopColor={c[1]} />
          <stop offset="1" stopColor={c[3]} />
        </linearGradient>
        <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c[2]} />
          <stop offset="1" stopColor={c[3]} />
        </linearGradient>
      </defs>
      <path d={SHIELD} fill={`url(#r${id})`} />
      <path d={SHIELD_IN} fill={`url(#f${id})`} />
      <path d="M50 13l34 10.5V40C64 34 38 34 16 42V23.5z" fill="#fff" opacity=".16" />
      {star && <path d="M50 33l6.5 13.5 14.5 2-10.5 10 2.6 14.5L50 66l-13.1 7 2.6-14.5-10.5-10 14.5-2z" fill={c[0]} stroke={c[3]} strokeWidth="2" strokeLinejoin="round" />}
      {label != null && (
        <text x="50" y="70" textAnchor="middle" fontSize={String(label).length > 2 ? 30 : 38} fontWeight="900" fontFamily="Nunito, system-ui, sans-serif" fill={gold ? '#fff7dc' : '#f6f8fb'} stroke={c[3]} strokeWidth="3" paintOrder="stroke">
          {label}
        </text>
      )}
    </svg>
  );
}

/** Золотой щит за героем на главной у владельцев Pro: лучи, кайма, звезда, искры. */
export function GoldShieldArt({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id={`bg${id}`} cx="50%" cy="42%" r="70%">
          <stop offset="0" stopColor="#8a6118" />
          <stop offset=".45" stopColor="#402c0c" />
          <stop offset="1" stopColor="#1a1408" />
        </radialGradient>
        <linearGradient id={`rim${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset=".3" stopColor="#ffd25e" />
          <stop offset=".6" stopColor="#c8891c" />
          <stop offset="1" stopColor="#ffe08a" />
        </linearGradient>
        <linearGradient id={`fld${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a3d0c" />
          <stop offset="1" stopColor="#24180a" />
        </linearGradient>
        <radialGradient id={`ray${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffe9a6" stopOpacity=".42" />
          <stop offset="1" stopColor="#ffe9a6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#bg${id})`} />
      <g className="gold-rays">
        {Array.from({ length: 16 }, (_, i) => (
          <path key={i} d="M200 130L190 -150h20z" fill={`url(#ray${id})`} transform={`rotate(${i * 22.5} 200 130)`} />
        ))}
      </g>
      <g transform="translate(200 128) scale(2.1) translate(-50 -58)" opacity=".9">
        <path d={SHIELD} fill={`url(#rim${id})`} />
        <path d={SHIELD_IN} fill={`url(#fld${id})`} />
        <path d="M50 22l26 8v23c0 18-10 31-26 38-16-7-26-20-26-38V30z" fill="none" stroke="#ffe08a" strokeOpacity=".55" strokeWidth="1.5" />
        <path d="M50 13l34 10.5V40C64 34 38 34 16 42V23.5z" fill="#fff" opacity=".14" />
        <path d="M50 30l5.2 10.8 11.8 1.6-8.6 8.2 2.1 11.6L50 56.6l-10.5 5.6 2.1-11.6-8.6-8.2 11.8-1.6z" fill="#ffe9a6" opacity=".5" />
      </g>
      {[
        [62, 64, 1.2],
        [338, 84, 1],
        [96, 214, 0.8],
        [312, 220, 1.3],
        [150, 30, 0.7],
        [262, 40, 0.9],
      ].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <path className="gold-spark" style={{ animationDelay: `${i * 0.6}s` }} d="M0-9C1-2 2-1 9 0 2 1 1 2 0 9-1 2-2 1-9 0-2-1-1-2 0-9z" fill="#fff3c4" />
        </g>
      ))}
    </svg>
  );
}

export const Users = ({ size = 18, className }: P) =>
  svg(
    size,
    className,
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
      <path d="M15.5 4.8a3.3 3.3 0 010 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2" />
    </>,
  );

export const UserPlus = ({ size = 18, className }: P) =>
  svg(
    size,
    className,
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
      <path d="M19 8v6M16 11h6" />
    </>,
  );

export const Cross = ({ size = 16, className }: P) => svg(size, className, <path d="M6 6l12 12M18 6L6 18" />);

// Программы тренировок: календарь с отметкой, секундомер, отдых, пауза и продолжение.
export const Plan = ({ size = 22, className }: P) =>
  svg(
    size,
    className,
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="M8.5 15l2.2 2.2 4.8-4.7" />
    </>,
  );

export const Timer = ({ size = 18, className }: P) =>
  svg(
    size,
    className,
    <>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 13.5V9.5M10 2.5h4M18.5 6.5l1.5-1.5" />
    </>,
  );

export const Moon = ({ size = 18, className }: P) => svg(size, className, <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />);

export const Pause = ({ size = 16, className }: P) => svg(size, className, <path d="M8 5v14M16 5v14" />);

export const Play = ({ size = 16, className }: P) => svg(size, className, <path d="M7 4.5v15l12-7.5z" />, true);

// Главный экран: сила (гантель) и лавка (сумка).
export const Dumbbell = ({ size = 22, className }: P) =>
  svg(
    size,
    className,
    <>
      <path d="M6.5 7.5v9M17.5 7.5v9M3.5 10v4M20.5 10v4M6.5 12h11" />
    </>,
  );

export const Bag = ({ size = 22, className }: P) =>
  svg(
    size,
    className,
    <>
      <path d="M5 8.5h14l-1.2 11.2a1.5 1.5 0 01-1.5 1.3H7.7a1.5 1.5 0 01-1.5-1.3L5 8.5z" />
      <path d="M9 10.5V7a3 3 0 016 0v3.5" />
    </>,
  );

/** Медаль рекорда: золотой круг на ленте. */
export const Medal = ({ size = 18, className }: P) => (
  <svg className={`icon ${className ?? ''}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 13.5L4.5 21l3.2-1.2L9.6 22l2-6.3M17 13.5l2.5 7.5-3.2-1.2-1.9 2.2-2-6.3" fill="#e8a33a" />
    <circle cx="12" cy="9.5" r="6.5" fill="#ffd27a" />
    <circle cx="12" cy="9.5" r="4.2" fill="none" stroke="#c98a1e" strokeWidth="1.4" />
  </svg>
);

export const Trash = ({ size = 16, className }: P) => svg(size, className, <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />);

export const Pencil = ({ size = 16, className }: P) => svg(size, className, <path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 013 3L8 18.5 4 20zM13.5 7l3 3" />);

export const Plus = ({ size = 16, className }: P) => svg(size, className, <path d="M12 5v14M5 12h14" />);

export const Search = ({ size = 16, className }: P) => svg(size, className, <path d="M10.5 18a7.5 7.5 0 110-15 7.5 7.5 0 010 15zM16 16l5 5" />);

export const Kettlebell = ({ size = 18, className }: P) => svg(size, className, <path d="M8 9.5V8a4 4 0 018 0v1.5M12 21a6.5 6.5 0 100-13 6.5 6.5 0 000 13z" />);

// Топ города: дома разной высоты.
export const City = ({ size = 18, className }: P) => svg(size, className, <path d="M3 21h18M5 21V10l5-3v14M10 21V4h7v17M19 21v-8h-2M13 8h1.5M13 11.5h1.5M13 15h1.5" />);

// Коллекции обликов: альбом с карточками.
export const Album = ({ size = 18, className }: P) => svg(size, className, <path d="M4 5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5zM8 8h3v4H8zM13 8h3v4h-3zM8 14h3v2.5H8zM13 14h3v2.5h-3z" />);

/** Жетон праздника: тыква, снежинка, цветок или медаль. */
export function HolidayToken({ id, size = 22 }: { id: string; size?: number }) {
  return (
    <svg className="icon hol-token" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {id === 'pumpkin' && (
        <>
          <path d="M12 7.2c-1-2.2.2-4 2.2-4.5" fill="none" stroke="#5d8a2e" strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="7.6" cy="14" rx="5" ry="6.6" fill="#f57c00" />
          <ellipse cx="16.4" cy="14" rx="5" ry="6.6" fill="#f57c00" />
          <ellipse cx="12" cy="14" rx="4.6" ry="7.2" fill="#ff9800" />
          <path d="M9.3 12.4l1.4 1.6-1.9.4zM14.7 12.4l-1.4 1.6 1.9.4zM9 16.6c1.8 1.4 4.2 1.4 6 0l-1 1.6h-4z" fill="#ffe082" />
        </>
      )}
      {id === 'winter' && (
        <g stroke="#b3e5fc" strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6" />
          <path d="M9.6 4.2L12 6.4l2.4-2.2M9.6 19.8l2.4-2.2 2.4 2.2M4.4 10.6l3.2-.8-.8-3.1M19.6 13.4l-3.2.8.8 3.1M4.4 13.4l3.2.8-.8 3.1M19.6 10.6l-3.2-.8.8-3.1" stroke="#e1f5fe" strokeWidth="1.5" />
        </g>
      )}
      {id === 'spring' && (
        <>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="12" cy="6.6" rx="3.4" ry="4.6" fill="#f48fb1" transform={`rotate(${a} 12 12)`} />
          ))}
          <circle cx="12" cy="12" r="3" fill="#ffeb3b" />
        </>
      )}
      {id === 'summer' && (
        <>
          <path d="M7 2.5h4l1 5-3 1zM17 2.5h-4l-1 5 3 1z" fill="#42a5f5" />
          <circle cx="12" cy="14.5" r="7" fill="#ffca28" />
          <circle cx="12" cy="14.5" r="4.6" fill="none" stroke="#e09b00" strokeWidth="1.4" />
          <path d="M12 11.6l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z" fill="#fff3c4" />
        </>
      )}
    </svg>
  );
}
