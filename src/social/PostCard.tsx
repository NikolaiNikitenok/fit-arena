// Карточка поста: автор (тап — профиль), фото, текст, «респект» 💪 и меню: пожаловаться или удалить свой.
import { useState } from 'react';
import type { PostView } from '../../shared/social';
import { locale, t } from '../i18n';
import { socialApi } from './api';
import { openProfile } from './bus';
import { Avatar } from './Avatar';
import { Send } from '../icons';
import { SharePost } from './SharePost';

/** «только что», «5 мин», «3 ч», «вчера», «12 окт.». */
export function agoText(at: number, now = Date.now()): string {
  const m = Math.floor((now - at) / 60_000);
  if (m < 1) return t('только что');
  if (m < 60) return t('{0} мин', { 0: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('{0} ч', { 0: h });
  if (h < 48) return t('вчера');
  const d = new Date(at);
  return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) });
}

export function PostCard({ post, onChange, onRemoved, noAuthorLink }: { post: PostView; onChange: (p: PostView) => void; onRemoved: (id: string) => void; noAuthorLink?: boolean }) {
  const [menu, setMenu] = useState<'closed' | 'open' | 'delete'>('closed');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pop, setPop] = useState(false);
  const [sharing, setSharing] = useState(false);
  const author = () => !noAuthorLink && openProfile({ pid: post.author.pid });
  const like = () => {
    const on = !post.liked;
    // Сразу на экране, сервер догоняет.
    onChange({ ...post, liked: on, likes: post.likes + (on ? 1 : -1) });
    if (on) {
      setPop(true);
      window.setTimeout(() => setPop(false), 450);
    }
    socialApi
      .like(post.id, on)
      .then((r) => r.post && onChange(r.post))
      .catch(() => onChange(post));
  };
  const act = (p: Promise<{ error?: string; note?: string; ok?: boolean }>, done?: () => void) => {
    setBusy(true);
    p.then((r) => {
      if (r.error) return setNote(r.error);
      setNote(r.note ?? null);
      setMenu('closed');
      done?.();
    })
      .catch(() => setNote(t('Нет связи с сервером. Попробуй ещё раз')))
      .finally(() => setBusy(false));
  };
  return (
    <article className={`post ${post.hidden ? 'is-hidden' : ''}`}>
      <header className="post-head">
        <button className="post-author" onClick={author} disabled={noAuthorLink}>
          <Avatar name={post.author.name} pro={post.author.pro} size={38} />
          <span className="post-who">
            <b className={post.author.pro ? 'pro-name' : ''}>{post.author.name}</b>
            <small>
              {t('ур. {0}', { 0: post.author.level })} · {agoText(post.at)}
            </small>
          </span>
        </button>
        <button className="post-more" aria-label={t('Ещё')} onClick={() => setMenu(menu === 'closed' ? 'open' : 'closed')}>
          ⋯
        </button>
      </header>
      {post.hidden && <div className="post-hidden-note">{t('Пост скрыт по жалобам, пока его не посмотрит модератор. Другие игроки его не видят.')}</div>}
      {menu !== 'closed' && (
        <div className="post-menu">
          {menu === 'open' && post.mine && (
            <button className="small-btn ghost danger-text" disabled={busy} onClick={() => setMenu('delete')}>
              {t('Удалить пост')}
            </button>
          )}
          {menu === 'open' && !post.mine && (
            <button className="small-btn ghost" disabled={busy} onClick={() => act(socialApi.report(post.id))}>
              {t('Пожаловаться')}
            </button>
          )}
          {menu === 'delete' && (
            <>
              <span className="muted">{t('Удалить пост вместе с фото? Вернуть не получится.')}</span>
              <button className="small-btn danger" disabled={busy} onClick={() => act(socialApi.remove(post.id), () => onRemoved(post.id))}>
                {t('Удалить')}
              </button>
            </>
          )}
        </div>
      )}
      {note && <div className="settings-note">{note}</div>}
      {post.photo && (
        <div className="post-photo" style={{ aspectRatio: post.w && post.h ? `${post.w} / ${Math.min(post.h, post.w * 1.35)}` : '4 / 5' }} onDoubleClick={() => !post.liked && like()}>
          <img src={post.photo} alt="" loading="lazy" decoding="async" />
        </div>
      )}
      {post.text && <p className="post-text">{post.text}</p>}
      <footer className="post-foot">
        <button className={`post-like ${post.liked ? 'on' : ''} ${pop ? 'pop' : ''}`} onClick={like} aria-pressed={post.liked}>
          <span className="post-like-ico">💪</span>
          <span>{post.likes > 0 ? post.likes : t('Респект')}</span>
        </button>
        {!post.hidden && (
          <button className="post-share" onClick={() => setSharing(true)}>
            <Send size={16} /> {t('Поделиться')}
          </button>
        )}
      </footer>
      {sharing && <SharePost post={post} onClose={() => setSharing(false)} />}
    </article>
  );
}
