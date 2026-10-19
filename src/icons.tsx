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
