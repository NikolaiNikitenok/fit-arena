// Лента: посты всех игроков или только тех, на кого подписан. Сверху — «Поделись прогрессом»: фото и пара слов
// («день первый — вот так я выгляжу»), через год можно выложить второе и сравнить.
import { useEffect, useRef, useState } from 'react';
import type { FeedTab, PostView } from '../../shared/social';
import { POST_TEXT_MAX } from '../../shared/social';
import { Sheet } from '../Sheet';
import { t } from '../i18n';
import { userName } from '../telegram';
import { Camera, Plus, UserCircle, Users } from '../icons';
import { NotSignedIn, socialApi } from './api';
import { Avatar } from './Avatar';
import { openProfile } from './bus';
import { PostCard } from './PostCard';
import { preparePhoto } from './photo';
import { markFeedSeen } from './useFeedBadge';
import './social.css';

const IDEAS = [t('День 1. Начинаю! 💪'), t('Мой результат сегодня'), t('Было → стало')];

export function FeedScreen({ onClose, onFriends, compose: composeFirst, focus }: { onClose: () => void; onFriends: () => void; compose?: boolean; focus?: string }) {
  const [tab, setTab] = useState<FeedTab>('all');
  const [posts, setPosts] = useState<PostView[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compose, setCompose] = useState(!!composeFirst);
  const seq = useRef(0);

  const load = (tb: FeedTab) => {
    const n = ++seq.current;
    setPosts(null);
    setError(null);
    socialApi
      .feed({ tab: tb })
      .then((r) => {
        if (n !== seq.current) return;
        setPosts(r.posts);
        setMore(r.more);
        if (r.error) setError(r.error);
      })
      .catch((e) => n === seq.current && setError(e instanceof NotSignedIn ? e.message : t('Нет связи с сервером. Попробуй ещё раз')));
  };
  useEffect(() => {
    load(tab);
    markFeedSeen();
  }, [tab]);
  useEffect(() => {
    if (!focus || !posts) return;
    document.getElementById(`post-${focus}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focus, !!posts]);

  const loadMore = () =>
    posts?.length &&
    socialApi.feed({ tab, before: posts[posts.length - 1].at }).then((r) => {
      setPosts([...posts, ...r.posts]);
      setMore(r.more);
    });
  const change = (p: PostView) => setPosts((ps) => ps && ps.map((x) => (x.id === p.id ? p : x)));
  const removed = (id: string) => setPosts((ps) => ps && ps.filter((x) => x.id !== id));

  return (
    <div className="feed-screen">
      <div className="app-head feed-head">
        <button className="pill btn" onClick={onClose}>
          {t('‹ Назад')}
        </button>
        <h1>{t('Лента')}</h1>
        <button className="pill btn icon-only" aria-label={t('Друзья')} onClick={onFriends}>
          <Users size={20} />
        </button>
        <button className="pill btn icon-only" aria-label={t('Мой профиль')} onClick={() => openProfile({ me: true })}>
          <UserCircle size={20} />
        </button>
      </div>

      <button className="feed-compose" onClick={() => setCompose(true)}>
        <Avatar name={userName() || t('Боец')} size={40} />
        <span className="feed-compose-text">
          <b>{t('Поделись прогрессом')}</b>
          <small>{t('Фото сегодня — а через год сравнишь')}</small>
        </span>
        <span className="feed-compose-ico">
          <Camera size={22} />
        </span>
      </button>

      <div className="tabs small feed-tabs">
        <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
          {t('Все')}
        </button>
        <button className={tab === 'following' ? 'active' : ''} onClick={() => setTab('following')}>
          {t('Подписки')}
        </button>
      </div>

      {error && <div className="settings-note">{error}</div>}
      {!error && posts === null && <div className="muted feed-empty">{t('Загружаем…')}</div>}
      {posts && posts.length === 0 && !error && (
        <div className="feed-empty">
          {tab === 'following' ? t('Здесь будут посты тех, на кого ты подписан. Открой профиль игрока в ленте или в рейтинге и нажми «Подписаться».') : t('Лента пока пустая. Будь первым — покажи, с чего начинаешь!')}
        </div>
      )}
      {posts && (
        <div className="feed-list">
          {posts.map((p) => (
            <div key={p.id} id={`post-${p.id}`} className={p.id === focus ? 'post-focus' : ''}>
              <PostCard post={p} onChange={change} onRemoved={removed} />
            </div>
          ))}
          {more && (
            <button className="link" onClick={loadMore}>
              {t('Показать ещё')}
            </button>
          )}
        </div>
      )}

      {compose && (
        <ComposeSheet
          onClose={() => setCompose(false)}
          onPosted={(p) => {
            setCompose(false);
            setPosts((ps) => [p, ...(ps ?? [])]);
          }}
        />
      )}
    </div>
  );
}

function ComposeSheet({ onClose, onPosted }: { onClose: () => void; onPosted: (p: PostView) => void }) {
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setBusy(true);
    preparePhoto(f)
      .then(setPhoto)
      .catch(() => setError(t('Не получилось открыть фото. Попробуй другое')))
      .finally(() => setBusy(false));
  };
  const publish = () => {
    setBusy(true);
    setError(null);
    socialApi
      .publish(text.trim(), photo)
      .then((r) => (r.post ? onPosted(r.post) : setError(r.error ?? t('Не получилось. Попробуй ещё раз'))))
      .catch((e) => setError(e instanceof Error && e.message.length > 4 ? e.message : t('Нет связи с сервером. Попробуй ещё раз')))
      .finally(() => setBusy(false));
  };

  return (
    <Sheet onClose={onClose} bodyClassName="compose">
      <div className="level-title">{t('Новый пост')}</div>
      <input ref={camera} type="file" accept="image/*" capture="user" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {photo ? (
        <div className="compose-photo">
          <img src={photo} alt="" />
          <button className="compose-photo-x" aria-label={t('Убрать фото')} onClick={() => setPhoto(null)}>
            ×
          </button>
        </div>
      ) : (
        <div className="compose-pick">
          <button className="secondary" disabled={busy} onClick={() => camera.current?.click()}>
            <Camera size={20} /> {t('Сфотографировать')}
          </button>
          <button className="secondary" disabled={busy} onClick={() => gallery.current?.click()}>
            <Plus size={20} /> {t('Из галереи')}
          </button>
        </div>
      )}
      <textarea className="compose-text" value={text} maxLength={POST_TEXT_MAX} rows={3} placeholder={t('Например: сегодня первый день, начинаю отжиматься. Вот так я выгляжу')} onChange={(e) => setText(e.target.value)} />
      <div className="compose-ideas">
        {IDEAS.map((i) => (
          <button key={i} className="soc-chip" onClick={() => setText(text ? `${text} ${i}` : i)}>
            {i}
          </button>
        ))}
        <span className="compose-count">
          {text.length}/{POST_TEXT_MAX}
        </span>
      </div>
      {error && <div className="settings-note">{error}</div>}
      <button className="primary" disabled={busy || (!photo && !text.trim())} onClick={publish}>
        {busy ? t('Публикуем…') : t('Опубликовать')}
      </button>
      <div className="muted compose-hint">{t('Пост увидят все игроки. Геометка и данные телефона с фото не уходят.')}</div>
    </Sheet>
  );
}
