import { useState } from 'react';
import { Coin } from '../icons';
import { type AchIcon, type AchTier, achDone, type Achievement, visibleAchievements } from './achievements';
import type { Progress } from './progress';
import { Sheet } from '../Sheet';
import { locale, t } from '../i18n';
import { cloudState } from '../cloud';
import { canSetEmojiStatus, setEmojiStatus } from '../telegram';
import { track } from '../telemetry';

const GLYPH: Record<AchIcon, string> = {
  flame: 'M12 22c4.2 0 7-2.8 7-6.8 0-3.2-1.8-5.6-3.6-7.6-.4 1.9-1.4 3.2-2.6 3.8.3-3.4-1-6.6-3.8-9.4-.2 3.4-1.8 5.4-3.4 7.4C4.3 11.1 5 13.4 5 15.2 5 19.2 7.8 22 12 22z',
  rep: 'M2 9h2V6.5h3V11h10V6.5h3V9h2v6h-2v2.5h-3V13H7v4.5H4V15H2z',
  crown: 'M3 7l4.5 4.5L12 4l4.5 7.5L21 7l-2 12H5z',
  skull: 'M12 2a8 8 0 0 0-8 8c0 2.6 1.2 4.6 3 5.8V19a1 1 0 0 0 1 1h1v2h2v-2h2v2h2v-2h1a1 1 0 0 0 1-1v-3.2c1.8-1.2 3-3.2 3-5.8a8 8 0 0 0-8-8zm-3 7.5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zm6 0a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z',
  star: 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z',
  map: 'M9 3L3 5.5v15.5l6-2.5 6 2.5 6-2.5V3l-6 2.5zM9 5.2l6 2.5v11.1l-6-2.5z',
  arm: 'M7 21c-2.5-2-3.5-5-2.6-8.4L6.6 5c.4-1.4 1.8-2.2 3.2-1.8l1.4.4-1 3.6 2.2 1.2c1.8-1.6 4.6-1.8 6.6-.4 2.4 1.7 2.9 5 1.1 7.4C17.4 18.8 12 21 7 21z',
  leg: 'M9 2h5v8.5l2.5 6.5H20v4H9.5L8 12.5z',
  core: 'M8 3h8v18H8zM8 8.5h8M8 14h8M12 3v18',
  banner: 'M5 2h2v20H5zM8 3h11l-3 4 3 4H8z',
  gem: 'M6 3h12l4 6-10 12L2 9zm1.2 2L5 8.5h4.2L10.4 5zm9.6 0h-3.2l1.2 3.5H19z',
  scroll: 'M6 3h11a3 3 0 0 1 3 3v1h-3v11a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-1h3zm3 5v2h6V8zm0 4v2h6v-2z',
};
const TIER: Record<AchTier, { ring: string; fill: string; name: string }> = {
  bronze: { ring: '#d08a52', fill: '#5a3a24', name: t('бронза') },
  silver: { ring: '#dfe6ef', fill: '#4a5262', name: t('серебро') },
  gold: { ring: '#ffd36b', fill: '#6e5113', name: t('золото') },
  legend: { ring: '#c9a6ff', fill: '#3d2470', name: t('легенда') },
};

/** Картинка значка для emoji-статуса (те же PNG, что в наборе эмодзи бота). */
const badgeUrl = (id: string) => `${import.meta.env.BASE_URL}emoji/${id}.png`;

/** Медаль достижения: цвет рамки — редкость, внутри знак. Невыполненные — серые. */
export function AchBadge({ ach, done, size = 48 }: { ach: Achievement; done: boolean; size?: number }) {
  const tm = TIER[ach.tier];
  return (
    <svg className={`ach-badge ${done ? ach.tier : 'locked'}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path d="M24 2l18 10v24L24 46 6 36V12z" fill={done ? tm.fill : '#232634'} stroke={done ? tm.ring : '#3a3e50'} strokeWidth={3} strokeLinejoin="round" />
      <path d="M24 7l14 8v18L24 41 10 33V15z" fill="none" stroke={done ? tm.ring : '#2e3242'} strokeOpacity={0.45} strokeWidth={1.2} />
      <path d={GLYPH[ach.icon]} transform="translate(12 12)" fill={done ? tm.ring : '#4a4f63'} fillRule="evenodd" stroke={ach.icon === 'core' ? (done ? tm.fill : '#232634') : 'none'} strokeWidth={1.4} />
    </svg>
  );
}

/** Все достижения: забрать награду, выбрать титул под именем героя. */
export function AchievementsSheet({ progress, now, onClaim, onTitle, onClose }: { progress: Progress; now: number; onClaim: (a: Achievement) => void; onTitle: (id: string | undefined) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'all' | 'done'>('all');
  const all = visibleAchievements(progress, now);
  // Значки достижений для emoji-статуса: номера эмодзи даёт сервер, когда админ создал набор.
  const emoji = cloudState()?.emoji ?? {};
  const badges = canSetEmojiStatus() && Object.keys(emoji).length > 0;
  const [note, setNote] = useState<string | null>(null);
  const done = all.filter((x) => achDone(x, progress, now));
  // Сначала те, что можно забрать, потом выполненные, потом ближайшие к цели.
  const list = [...(tab === 'done' ? done : all)].sort((x, y) => {
    const rank = (a: Achievement) => (achDone(a, progress, now) ? (progress.achClaimed?.includes(a.id) ? 1 : 0) : 2);
    return rank(x) - rank(y) || Math.min(1, y.value(progress, now) / y.goal) - Math.min(1, x.value(progress, now) / x.goal);
  });
  return (
    <Sheet onClose={onClose}>
      <div className="level-title">
        {t('Достижения')} <span className="muted">{t('{0} из {1}', { 0: done.length, 1: all.length })}</span>
      </div>
      <div className="muted ach-hint">{t('За каждое — монеты и титул. Титул виден под именем героя; нажми на полученный, чтобы надеть.')}</div>
      {badges && <div className="muted ach-hint">{t('✨ За многие достижения — значок, который можно поставить рядом со своим именем в Telegram (нужен Telegram Premium).')}</div>}
      <div className="tabs">
        <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
          {t('Все')}
        </button>
        <button className={tab === 'done' ? 'active' : ''} onClick={() => setTab('done')}>
          {t('Полученные')}
        </button>
      </div>
      {note && <div className="muted ach-hint">{note}</div>}
      <div className="ach-list">
        {list.map((x) => {
          const ok = achDone(x, progress, now);
          const claimed = progress.achClaimed?.includes(x.id);
          const worn = progress.title === x.id;
          const v = Math.min(x.goal, x.value(progress, now));
          return (
            <div key={x.id} className={`ach-row ${ok ? 'done' : ''} ${worn ? 'worn' : ''}`} onClick={() => claimed && onTitle(worn ? undefined : x.id)}>
              <AchBadge ach={x} done={ok} size={46} />
              <div className="ach-meta">
                <div className="ach-title">
                  {x.title} <span className={`ach-tier ${x.tier}`}>{TIER[x.tier].name}</span>
                </div>
                <div className="muted">{x.text}</div>
                {badges && emoji[x.id] &&
                  (ok && claimed ? (
                    <button
                      className="ach-status"
                      onClick={(e) => {
                        e.stopPropagation();
                        void setEmojiStatus(emoji[x.id]).then((set) => {
                          if (set) track('emoji_status', x.id);
                          setNote(set ? t('Значок «{0}» теперь у твоего имени в Telegram', { 0: x.title }) : t('Не вышло: emoji-статус есть только у Telegram Premium'));
                        });
                      }}
                    >
                      <img src={badgeUrl(x.id)} alt="" /> {t('Поставить значок у имени в Telegram')}
                    </button>
                  ) : (
                    <div className="ach-status-hint">
                      <img src={badgeUrl(x.id)} alt="" /> {ok ? t('Забери награду — и этот значок можно поставить у имени в Telegram') : t('Даст значок у имени в Telegram')}
                    </div>
                  ))}
                {!ok && x.goal > 1 && (
                  <div className="ach-progress">
                    <div className="bar">
                      <div className="bar-fill" style={{ width: `${(v / x.goal) * 100}%`, background: TIER[x.tier].ring }} />
                    </div>
                    <span>
                      {v.toLocaleString(locale())} / {x.goal.toLocaleString(locale())}
                    </span>
                  </div>
                )}
              </div>
              {ok && !claimed ? (
                <button
                  className="small-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClaim(x);
                  }}
                >
                  <Coin size={13} /> {x.coins}
                </button>
              ) : (
                worn && <span className="ach-worn">{t('титул')}</span>
              )}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
