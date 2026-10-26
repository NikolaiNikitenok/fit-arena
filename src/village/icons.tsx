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

// Молоток: боёк и рукоять. Им же подписаны «Строить», «Улучшить» и строители.
export const Hammer = ({ size = 16, className }: P) =>
  svg(size, className, <><path d="M12.6 5.2l2.6-2.2a2.2 2.2 0 012.9.1l3.3 3.3-3 3-1.5-1.5-1.8 1.8-3.6-3.6z" fill="currentColor" /><path d="M12.6 9.4l-8 8a1.9 1.9 0 002.7 2.7l8-8" strokeWidth="2.6" /></>);

export const Plus = ({ size = 22, className }: P) => svg(size, className, <path d="M12 5v14M5 12h14" />);

export const Scroll = ({ size = 22, className }: P) => svg(size, className, <><path d="M7 4h11v13a3 3 0 01-3 3H6" /><path d="M7 4a2 2 0 00-2 2v1h2M6 20a2 2 0 01-2-2v-1h9v1a2 2 0 002 2" /><path d="M10 9h5M10 12.5h5" /></>);

export const Gate = ({ size = 22, className }: P) => svg(size, className, <><path d="M4 21V8l4-3 4 3 4-3 4 3v13" /><path d="M9 21v-6a3 3 0 016 0v6" /></>);

export const Move = ({ size = 16, className }: P) => svg(size, className, <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />);

export const Dungeon = ({ size = 22, className }: P) => svg(size, className, <><path d="M4 20V10a8 8 0 0116 0v10" /><path d="M8 20v-7a4 4 0 018 0v7M2.5 20h19" /></>);

export const Star = ({ size = 16, className }: P) => svg(size, className, <path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9l-5.4 2.9 1.1-6.1-4.5-4.3 6.1-.8z" />, true);

// Кубок: кубки набегов на деревни.
export const Trophy = ({ size = 16, className }: P) => svg(size, className, <><path d="M7 4h10v5a5 5 0 01-10 0z" /><path d="M7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M12 14v3M8.5 20h7M9.5 17h5" /></>);

export const RES_COLORS = { wood: '#c98a4b', stone: '#b9c0cc', gold: '#ffd27a' } as const;

// Умения героя (shared/heroSkills.ts): ярость, клич, удар о землю, щит, дружина, молнии.
export const SkillIcon = ({ id, size = 30, className }: P & { id: string }) => {
  switch (id) {
    case 'rage':
      return svg(size, className, <><path d="M12 2.5c1 3.5 5 5.5 5 10a5 5 0 01-10 0c0-2.4 1.3-3.8 2.3-5 .3 1.6 1 2.6 2 3 0-3 .2-5.5.7-8z" fill="currentColor" stroke="none" /><path d="M10 16.5a2 2 0 004 0c0-1.3-1-2-2-3-1 1-2 1.7-2 3z" fill="#fff3c4" stroke="none" /></>);
    case 'cry':
      return svg(size, className, <><path d="M4 10v4h3l6 4V6L7 10z" fill="currentColor" /><path d="M16.5 9a4 4 0 010 6M19 6.5a7.5 7.5 0 010 11" /></>);
    case 'quake':
      return svg(size, className, <><path d="M2 19h20" /><path d="M5 19l3-4 2 2 2-5 2 4 2-2 3 5" /><path d="M12 3v5M9.5 5.5L12 8l2.5-2.5" /></>);
    case 'guard':
      return svg(size, className, <><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z" fill="currentColor" fillOpacity={0.25} /><path d="M8.5 12l2.5 2.5 4.5-5" /></>);
    case 'squad':
      return svg(size, className, <><circle cx="8" cy="8" r="2.6" /><circle cx="16" cy="8" r="2.6" /><path d="M3 19c0-3 2.2-5 5-5s5 2 5 5M11 19c0-3 2.2-5 5-5s5 2 5 5" /></>);
    default:
      return svg(size, className, <path d="M13.5 2L5 13.5h6L9.5 22 19 9.5h-6z" />, true);
  }
};

// Пухлые иконки запасов: заливка с бликом и тёмный контур, как в больших стратегиях. Их рисует
// ResIcon во всей деревне — в полосах запасов, добыче и итогах набега.
const OUT = '#2a1608';
let uid = 0;
export function ChunkyRes({ r, size = 18 }: { r: 'wood' | 'stone' | 'gold' | 'charge'; size?: number }) {
  // Свой id градиентов у каждой иконки: в одном документе их много.
  const id = `cr${(uid = (uid + 1) % 1e6)}`;
  return (
    <svg className="icon chunky" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {r === 'wood' && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#d9954f" />
              <stop offset="1" stopColor="#8a4b1c" />
            </linearGradient>
          </defs>
          <path d="M5 6.5h11.5a5.5 5.5 0 010 11H5a5.5 5.5 0 010-11z" fill={`url(#${id})`} stroke={OUT} strokeWidth="1.8" />
          <path d="M5.5 9.5h7M4.5 13h6M7 15.5h6" stroke="#6b3812" strokeWidth="1.2" strokeLinecap="round" />
          <ellipse cx="17" cy="12" rx="4" ry="5" fill="#f6dcaa" stroke={OUT} strokeWidth="1.6" />
          <ellipse cx="17" cy="12" rx="1.8" ry="2.4" fill="none" stroke="#b07a3e" strokeWidth="1.1" />
          <path d="M6 7.8h8" stroke="#f3c48a" strokeWidth="1.2" strokeLinecap="round" opacity=".8" />
        </>
      )}
      {r === 'stone' && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#e4e8ef" />
              <stop offset="1" stopColor="#7c8494" />
            </linearGradient>
          </defs>
          <path d="M3 17.5l2.6-7.2 5.4-4.6 6.4 1.8 3.4 6.4-3 4.6H6.4z" fill={`url(#${id})`} stroke={OUT} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M11 5.7l1.2 5.3 5.2-3.5M12.2 11l-6.6-.7M12.2 11l1.6 7.5M12.2 11l8.6 3" stroke="#5d6473" strokeWidth="1" strokeLinejoin="round" fill="none" opacity=".75" />
          <path d="M6.6 10.6l4.2-3.6" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" opacity=".85" />
        </>
      )}
      {r === 'gold' && (
        <>
          <defs>
            <radialGradient id={id} cx=".38" cy=".32" r=".8">
              <stop offset="0" stopColor="#fff2a6" />
              <stop offset=".55" stopColor="#ffc93c" />
              <stop offset="1" stopColor="#d48a12" />
            </radialGradient>
          </defs>
          <circle cx="12" cy="12" r="9.2" fill={`url(#${id})`} stroke={OUT} strokeWidth="1.8" />
          <circle cx="12" cy="12" r="6" fill="none" stroke="#b9730c" strokeWidth="1.3" />
          <path d="M12 8.2l1.1 2.3 2.5.3-1.8 1.7.5 2.5-2.3-1.2-2.3 1.2.5-2.5-1.8-1.7 2.5-.3z" fill="#e59a17" />
          <path d="M7.2 8.6a5.6 5.6 0 012.8-2.6" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity=".9" fill="none" />
        </>
      )}
      {r === 'charge' && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#d6f7ff" />
              <stop offset="1" stopColor="#36b5ea" />
            </linearGradient>
          </defs>
          <path d="M13.8 1.8L4.6 13.6h6.2L9.2 22.2l10.2-12.8h-6.2z" fill={`url(#${id})`} stroke={OUT} strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M12.6 4.8l-5 6.6" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity=".9" />
        </>
      )}
    </svg>
  );
}
