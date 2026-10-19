// Простые иконки одного стиля вместо эмодзи: эмодзи на разных телефонах рисуются по-разному.

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
