// Карточка события в посте ленты (автопосты и посты персонажей): значок по виду, крупное значение и подпись.
import type { CardKind, PostCardData } from '../../shared/social';

const LOOK: Record<CardKind, { icon: string; c1: string; c2: string }> = {
  boss: { icon: '💥', c1: '#ff7043', c2: '#8e24aa' },
  streak: { icon: '🔥', c1: '#ff9800', c2: '#e53935' },
  level: { icon: '⚔️', c1: '#42a5f5', c2: '#5e35b1' },
  win: { icon: '🏅', c1: '#26a69a', c2: '#1e88e5' },
  group: { icon: '🏆', c1: '#ffca28', c2: '#ef6c00' },
  league: { icon: '🛡️', c1: '#ab47bc', c2: '#3949ab' },
  daily: { icon: '📊', c1: '#ff7a59', c2: '#c2185b' },
  tip: { icon: '💡', c1: '#66bb6a', c2: '#00897b' },
  task: { icon: '🎯', c1: '#ffb74d', c2: '#d84315' },
};

export function EventCard({ card }: { card: PostCardData }) {
  const look = LOOK[card.kind] ?? LOOK.win;
  return (
    <div className="event-card" style={{ ['--ec1' as string]: look.c1, ['--ec2' as string]: look.c2 }}>
      <span className="event-card-icon" aria-hidden>
        {look.icon}
      </span>
      <span className="event-card-text">
        <small>{card.title}</small>
        {card.value && <b>{card.value}</b>}
        {card.sub && <span>{card.sub}</span>}
      </span>
    </div>
  );
}
