// Иконки деревни в том же стиле, что src/icons.tsx: контур 24×24, цвет — currentColor.
type P = { size?: number; className?: string };
const svg = (size: number, className: string | undefined, body: React.ReactNode, fill = false) => (
  <svg className={`icon ${className ?? ''}`} width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {body}
  </svg>
);

export const House = ({ size = 22, className }: P) => svg(size, className, <><path d="M3.5 11L12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5h4v5" /></>);

export const Wood = ({ size = 16, className }: P) =>
  svg(size, className, <><rect x="3" y="7" width="15" height="10" rx="5" fill="currentColor" stroke="none" /><ellipse cx="18" cy="12" rx="3" ry="5" fill="#f3d9a4" stroke="none" /><ellipse cx="18" cy="12" rx="1.2" ry="2" fill="none" stroke="#a0703a" strokeWidth="1.2" /></>);

export const Stone = ({ size = 16, className }: P) => svg(size, className, <path d="M4 17l2.5-7 5-4 6 2 2.5 6-3 4H7z" />, true);

export const Bolt = ({ size = 16, className }: P) => svg(size, className, <path d="M13.5 2L5 13.5h6L9.5 22 19 9.5h-6z" />, true);

export const Hammer = ({ size = 16, className }: P) => svg(size, className, <><path d="M14 4l6 6-2.5 2.5-6-6z" /><path d="M12.5 8.5L4 17l3 3 8.5-8.5" /></>);

export const Plus = ({ size = 22, className }: P) => svg(size, className, <path d="M12 5v14M5 12h14" />);

export const Scroll = ({ size = 22, className }: P) => svg(size, className, <><path d="M7 4h11v13a3 3 0 01-3 3H6" /><path d="M7 4a2 2 0 00-2 2v1h2M6 20a2 2 0 01-2-2v-1h9v1a2 2 0 002 2" /><path d="M10 9h5M10 12.5h5" /></>);

export const Gate = ({ size = 22, className }: P) => svg(size, className, <><path d="M4 21V8l4-3 4 3 4-3 4 3v13" /><path d="M9 21v-6a3 3 0 016 0v6" /></>);

export const Move = ({ size = 16, className }: P) => svg(size, className, <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />);

export const Dungeon = ({ size = 22, className }: P) => svg(size, className, <><path d="M4 20V10a8 8 0 0116 0v10" /><path d="M8 20v-7a4 4 0 018 0v7M2.5 20h19" /></>);

export const Star = ({ size = 16, className }: P) => svg(size, className, <path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9l-5.4 2.9 1.1-6.1-4.5-4.3 6.1-.8z" />, true);

export const RES_COLORS = { wood: '#c98a4b', stone: '#b9c0cc', gold: '#ffd27a' } as const;
