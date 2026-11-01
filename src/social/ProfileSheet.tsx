// Профиль игрока: кто он, когда заходил, что у него лучше всего получается, рекорды, посты.
// Подписаться на его посты, позвать в друзья, пожаловаться или заблокировать (как в клане и у друзей).
import { useEffect, useState } from 'react';
import type { PostView, ProfileView } from '../../shared/social';
import { leagueOf } from '../../shared/rating';
import { heroTitle } from '../game/progress';
import { amountText, EXERCISE_LABELS } from '../repCounter';
import { Sheet } from '../Sheet';
import { PlayerMenu } from '../moderation/PlayerMenu';
import { locale, t } from '../i18n';
import { Check, UserPlus } from '../icons';
import { NotSignedIn, type ProfileRef, socialApi } from './api';
import { Avatar } from './Avatar';
import { closeProfile, openFeed, useOpenProfile } from './bus';
import { PostCard } from './PostCard';
import './social.css';

const dateText = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });

/** «в сети», «был в игре сегодня», «вчера», «5 дн. назад». */
export function seenText(p: Pick<ProfileView, 'online' | 'lastSeen'>, now = Date.now()): string {
  if (p.online) return t('в сети');
  if (!p.lastSeen) return t('давно не в игре');
  const today = new Date(now).toISOString().slice(0, 10);
  const days = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${p.lastSeen}T12:00:00Z`)) / 86_400_000);
  if (days <= 0) return t('в игре сегодня');
  if (days === 1) return t('в игре вчера');
  return t('в игре {0} дн. назад', { 0: days });
}

/** Лист профиля: один на всё приложение (App), открывается через openProfile(). */
export function ProfileHost() {
  const ref = useOpenProfile();
  if (!ref) return null;
  return <ProfileSheet key={JSON.stringify(ref)} target={ref} onClose={closeProfile} />;
}

export function ProfileSheet({ target, onClose }: { target: ProfileRef; onClose: () => void }) {
  const [p, setP] = useState<ProfileView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [posts, setPosts] = useState<PostView[] | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    socialApi
      .profile(target)
      .then((r) => (r.profile ? setP(r.profile) : setError(r.error ?? t('Игрок не найден'))))
      .catch((e) => setError(e instanceof NotSignedIn ? e.message : t('Нет связи с сервером. Попробуй ещё раз')));
  }, []);
  useEffect(() => {
    if (!p?.pid) return;
    socialApi
      .feed({ author: p.pid })
      .then((r) => {
        setPosts(r.posts);
        setMore(r.more);
      })
      .catch(() => setPosts([]));
  }, [p?.pid]);

  const act = (q: Promise<{ profile?: ProfileView; error?: string; note?: string }>) => {
    setBusy(true);
    setNote(null);
    q.then((r) => {
      if (r.profile) setP(r.profile);
      setNote(r.error ?? r.note ?? null);
    })
      .catch(() => setNote(t('Нет связи с сервером. Попробуй ещё раз')))
      .finally(() => setBusy(false));
  };
  const loadMore = () =>
    p &&
    posts?.length &&
    socialApi.feed({ author: p.pid, before: posts[posts.length - 1].at }).then((r) => {
      setPosts([...posts, ...r.posts]);
      setMore(r.more);
    });

  if (!p)
    return (
      <Sheet onClose={onClose} bodyClassName="profile">
        <div className={error ? 'settings-note' : 'muted profile-loading'}>{error ?? t('Загружаем…')}</div>
      </Sheet>
    );

  const league = leagueOf(p.cups);
  const ref = { pid: p.pid };
  const favBest = p.best.find((b) => b.exercise === p.favorite);
  return (
    <Sheet onClose={onClose} bodyClassName="profile">
      <div className={`profile-head ${p.pro ? 'pro' : ''}`}>
        <Avatar name={p.name} pro={p.pro} size={72} />
        <div className="profile-id">
          <div className="profile-name">
            <span className={p.pro ? 'pro-name' : ''}>{p.name}</span>
            {p.pro && <span className="pro-chip">PRO</span>}
          </div>
          <div className="profile-sub">
            {t('ур. {0}', { 0: p.level })} · {heroTitle(p.level)}
          </div>
          <div className={`profile-seen ${p.online ? 'online' : ''}`}>
            <i />
            {seenText(p)}
          </div>
        </div>
      </div>

      <div className="profile-chips">
        {p.clan && (
          <span className="soc-chip">
            [{p.clan.tag}] {p.clan.name}
          </span>
        )}
        {p.city && <span className="soc-chip">📍 {p.city}</span>}
        {p.cups > 0 && (
          <span className="soc-chip" style={{ color: league.color }}>
            {league.name} · {p.cups} 🏆
          </span>
        )}
      </div>

      <div className="profile-counts">
        <div>
          <b>{p.posts}</b>
          <small>{t('постов')}</small>
        </div>
        <div>
          <b>{p.followers}</b>
          <small>{t('подписчиков')}</small>
        </div>
        <div>
          <b>{p.following}</b>
          <small>{t('подписок')}</small>
        </div>
      </div>

      {!p.me && !p.blocked && (
        <div className="profile-actions">
          <button className={p.iFollow ? 'secondary' : 'primary'} disabled={busy} onClick={() => act(socialApi.follow(ref, !p.iFollow))}>
            {p.iFollow ? t('Вы подписаны') : t('Подписаться')}
          </button>
          {p.friend === 'friends' ? (
            <button className="secondary" disabled>
              <Check size={16} /> {t('Друзья')}
            </button>
          ) : p.friend === 'requested' ? (
            <button className="secondary" disabled>
              {t('Заявка отправлена')}
            </button>
          ) : (
            <button className="secondary" disabled={busy} onClick={() => act(socialApi.friend(ref))}>
              <UserPlus size={16} /> {p.friend === 'incoming' ? t('Принять в друзья') : t('В друзья')}
            </button>
          )}
          <button className="secondary profile-dots" aria-label={t('Ещё')} onClick={() => setMenu(true)}>
            ⋯
          </button>
        </div>
      )}
      {p.blocked && <div className="settings-note">{t('Игрок в твоём чёрном списке. Снять блок можно в настройках.')}</div>}
      {note && <div className="settings-note">{note}</div>}

      {p.favorite && (
        <div className="profile-fav">
          <span className="profile-fav-ico">⭐</span>
          <span>
            <small>{t('Лучше всего получается')}</small>
            <b>
              {EXERCISE_LABELS[p.favorite]}
              {favBest && ` · ${t('рекорд')} ${amountText(favBest.exercise, favBest.reps)}`}
            </b>
          </span>
        </div>
      )}

      <div className="section-title">{t('Рекорды за подход')}</div>
      {p.best.length ? (
        <div className="profile-best">
          {p.best.map((b) => (
            <div key={b.exercise} className={b.exercise === p.favorite ? 'fav' : ''}>
              <b>{amountText(b.exercise, b.reps)}</b>
              <small>{EXERCISE_LABELS[b.exercise]}</small>
            </div>
          ))}
        </div>
      ) : (
        <div className="muted">{t('Рекордов пока нет.')}</div>
      )}

      <div className="profile-stats">
        <div>
          <b>{p.totalReps.toLocaleString(locale())}</b>
          <small>{t('повторов всего')}</small>
        </div>
        <div>
          <b>{p.activeDays}</b>
          <small>{t('дней тренировок')}</small>
        </div>
        <div>
          <b>🔥 {p.streak}</b>
          <small>{t('серия дней')}</small>
        </div>
      </div>
      {p.since && <div className="muted profile-since">{t('Тренируется с {0}', { 0: dateText(p.since) })}</div>}

      <div className="section-title">{p.me ? t('Мои посты') : t('Посты')}</div>
      {posts === null ? (
        <div className="muted">{t('Загружаем…')}</div>
      ) : posts.length === 0 ? (
        <div className="profile-empty">
          {p.me ? t('Здесь будут твои посты. Сфотографируйся сегодня — через год будет с чем сравнить.') : t('Пока ни одного поста.')}
          {p.me && (
            <button
              className="small-btn"
              onClick={() => {
                onClose();
                openFeed({ compose: true });
              }}
            >
              {t('Написать пост')}
            </button>
          )}
        </div>
      ) : (
        <div className="feed-list">
          {posts.map((x) => (
            <PostCard key={x.id} post={x} noAuthorLink onChange={(n) => setPosts(posts.map((y) => (y.id === n.id ? n : y)))} onRemoved={(id) => setPosts(posts.filter((y) => y.id !== id))} />
          ))}
          {more && (
            <button className="link" onClick={loadMore}>
              {t('Показать ещё')}
            </button>
          )}
        </div>
      )}

      {menu && <PlayerMenu target={{ id: `pid:${p.pid}`, name: p.name, where: 'profile' }} onBlocked={() => setP({ ...p, blocked: true, iFollow: false })} onClose={() => setMenu(false)} />}
    </Sheet>
  );
}
