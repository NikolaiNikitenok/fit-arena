import { bonusText, newPets, PetId, petBonus, petById, petLevel, petMood, petName, petXp } from './pets';
import { heroLevel, heroXp, Progress } from './progress';
import './pets.css';
import { t } from '../i18n';

// Кнопка питомца на главном экране и мордочка для списков. Без 3D: экран питомца грузится по нажатию.

const heroLvl = (p: Progress) => heroLevel(heroXp(p)).level;

/** Мордочка питомца для списков: плоский значок того же цвета, что и 3D-зверёк. */
export function PetFace({ id, size = 44, dim }: { id: PetId; size?: number; dim?: boolean }) {
  const d = petById(id)!;
  const c = dim ? '#3a3e50' : d.color;
  const a = dim ? '#2e3242' : d.accent;
  const eyes = dim ? null : (
    <>
      <circle cx={18.5} cy={26} r={3} fill="#1a1420" />
      <circle cx={29.5} cy={26} r={3} fill="#1a1420" />
      <circle cx={19.5} cy={25} r={1} fill="#fff" />
      <circle cx={30.5} cy={25} r={1} fill="#fff" />
    </>
  );
  return (
    <svg className="pet-face" width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <circle cx={24} cy={24} r={23} fill={dim ? '#1b1e2a' : `${d.color}33`} />
      {id === 'hedgehog' && <path d="M24 6l3 5 5-3 0 6 6-1-3 5 6 2-5 4 4 5-6 0 1 6-24 0 1-6-6 0 4-5-5-4 6-2-3-5 6 1 0-6 5 3z" fill={dim ? c : '#7a5236'} />}
      {id === 'cat' && <path d="M11 22l2-12 9 7zM37 22l-2-12-9 7z" fill={c} />}
      {id === 'wolf' && <path d="M12 22l1-15 9 9zM36 22l-1-15-9 9z" fill={c} />}
      {id === 'owl' && <path d="M12 16l-1-8 8 5zM36 16l1-8-8 5z" fill={c} />}
      {id === 'dragon' && <path d="M15 15l-2-8 6 5zM33 15l2-8-6 5z" fill={dim ? c : '#ffd36b'} />}
      {id === 'bug' && (
        <g stroke={c} strokeWidth={1.6}>
          <path d="M19 15l-4-8M29 15l4-8" />
          <circle cx={15} cy={7} r={2.2} fill={a} stroke="none" />
          <circle cx={33} cy={7} r={2.2} fill={a} stroke="none" />
        </g>
      )}
      <ellipse cx={24} cy={27} rx={14} ry={13} fill={id === 'hedgehog' ? (dim ? c : '#f6dcc0') : c} />
      {id === 'owl' && !dim && (
        <>
          <circle cx={18.5} cy={26} r={5.5} fill={a} />
          <circle cx={29.5} cy={26} r={5.5} fill={a} />
          <path d="M22 31h4l-2 4z" fill="#ffa64d" />
        </>
      )}
      {(id === 'cat' || id === 'wolf' || id === 'dragon') && !dim && <ellipse cx={24} cy={33} rx={6.5} ry={4.5} fill={a} />}
      {id === 'bug' && !dim ? (
        <>
          <rect x={16} y={24} width={5} height={4} rx={1.5} fill={a} />
          <rect x={27} y={24} width={5} height={4} rx={1.5} fill={a} />
        </>
      ) : (
        eyes
      )}
      {(id === 'cat' || id === 'wolf' || id === 'hedgehog') && !dim && <circle cx={24} cy={31.5} r={1.8} fill={id === 'cat' ? '#ff7a8a' : '#22222c'} />}
      {(id === 'cat' || id === 'dragon' || id === 'hedgehog') && !dim && (
        <>
          <ellipse cx={14.5} cy={31} rx={2.4} ry={1.4} fill="#ff9db0" opacity={0.8} />
          <ellipse cx={33.5} cy={31} rx={2.4} ry={1.4} fill="#ff9db0" opacity={0.8} />
        </>
      )}
    </svg>
  );
}

/** Кнопка питомца на главном экране. */
export function PetEntry({ progress, onOpen }: { progress: Progress; onOpen: () => void }) {
  const now = Date.now();
  const lvl = heroLvl(progress);
  const fresh = newPets(progress, lvl).filter((id) => id !== progress.pets?.active).length;
  const id = progress.pets?.active;
  if (!id)
    return (
      <button className="ach-entry pet-entry" onClick={onOpen}>
        <span className="pet-entry-egg" />
        <span className="ach-entry-text">
          {t('Питомец')}
          <small>{fresh ? t('Кто-то ждёт тебя!') : t('Яйцо подарит Мастер Гром после первой победы')}</small>
        </span>
        {fresh > 0 && <span className="ach-entry-new">+{fresh}</span>}
        <span className="chev">›</span>
      </button>
    );
  const L = petLevel(petXp(progress, id));
  const mood = petMood(progress, now);
  const b = bonusText(petBonus(progress, now));
  return (
    <button className="ach-entry pet-entry" onClick={onOpen}>
      <PetFace id={id} size={38} />
      <span className="ach-entry-text">
        {petName(progress, id)} <span className={`pet-mood-dot ${mood}`} />
        <small>
          {t('Ур. {0} · {1}', { 0: L.level, 1: mood === 'sad' ? t('скучает без тренировок') : b })}
        </small>
        <span className="pass-bar">
          <span style={{ display: 'block', width: `${(L.into / L.need) * 100}%`, background: petById(id)!.color }} />
        </span>
      </span>
      {fresh > 0 && <span className="ach-entry-new">+{fresh}</span>}
      <span className="chev">›</span>
    </button>
  );
}
