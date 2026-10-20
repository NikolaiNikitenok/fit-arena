import { type Equip, type GymExercise, muscleOf } from './catalog';

// Значок упражнения в стиле игры: плитка цвета мышцы и рисунок снаряда.
const GLYPH: Record<Equip | 'cardio', React.ReactNode> = {
  bb: <path d="M2.5 12h19M5 8v8M7.5 6.5v11M16.5 6.5v11M19 8v8" />,
  ez: <path d="M2.5 12h4l2-2 2 4 2-4 2 4 2-2h5M5 8.5v7M19 8.5v7" />,
  trap: <path d="M3 12h4M17 12h4M7 9l2.5-3h5L17 9v6l-2.5 3h-5L7 15zM10 12h4M5 9v6M19 9v6" />,
  db: <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />,
  kb: <path d="M8 9.5V8a4 4 0 018 0v1.5M12 21a6.5 6.5 0 100-13 6.5 6.5 0 000 13z" />,
  cable: <path d="M5 3h14M12 3v9M8 21h8M12 15.5a2 2 0 100-4 2 2 0 000 4zM12 15.5V21" />,
  machine: <path d="M4 21V3M4 4h12M16 4v6M10 21v-6h8M14 15v-3M7 9h6M4 21h16" />,
  smith: <path d="M5 3v18M19 3v18M3 21h4M17 21h4M5 10h14M8 7v6M16 7v6" />,
  plate: <path d="M12 21a9 9 0 100-18 9 9 0 000 18zM12 14a2 2 0 100-4 2 2 0 000 4z" />,
  band: <path d="M4 16c3-8 5-8 8 0s5 8 8 0M3 16h2M19 16h2" />,
  bw: <path d="M12 6.5a2 2 0 100-4 2 2 0 000 4zM6 10l6-1.5 6 1.5M12 8.5v6M12 14.5l-3 6.5M12 14.5l3 6.5" />,
  cardio: <path d="M3 12h4l2-5 3.5 10 2.5-7 1.5 2H21" />,
};

export function ExIcon({ ex, size = 40 }: { ex: GymExercise; size?: number }) {
  const m = muscleOf(ex.muscle);
  const glyph = ex.muscle === 'cardio' && ex.equip !== 'bw' ? GLYPH.cardio : GLYPH[ex.equip];
  return (
    <span className="gym-exicon" style={{ width: size, height: size, ['--mc' as string]: m.color }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {glyph}
      </svg>
    </span>
  );
}
