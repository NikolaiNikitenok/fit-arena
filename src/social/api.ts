// Запросы ленты и профилей к серверу (server/socialApi.ts).
import type { FeedReply, FeedTab, PostView, ProfileReply } from '../../shared/social';
import { guestId, tg, userName } from '../telegram';
import { t, tErr } from '../i18n';

/** Сервер не пустил: лента — для тех, кто вошёл (Telegram, Max, Яндекс). */
export class NotSignedIn extends Error {}

async function post<T>(path: string, body: object = {}): Promise<T> {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: tg?.initData ?? '', guestId: guestId(), name: userName(), ...body }),
  });
  if (r.status === 401) throw new NotSignedIn(t('Лента и профили — для тех, кто вошёл через Telegram, Max или Яндекс'));
  if (r.status === 404) return tErr((await r.json().catch(() => ({ error: 'Игрок не найден' }))) as T);
  if (r.status === 413) throw new Error(t('Фото слишком большое'));
  if (!r.ok) throw new Error(String(r.status));
  return tErr(await r.json());
}

/** Чей профиль: по публичному pid (топы, лента) или по id (друзья и клан и так его знают). */
export type ProfileRef = { pid: string } | { id: string } | { me: true };
const refBody = (r: ProfileRef) => ('pid' in r ? { pid: r.pid } : 'id' in r ? { id: r.id } : {});

export const socialApi = {
  profile: (r: ProfileRef) => post<ProfileReply>('/api/profile', refBody(r)),
  feed: (q: { tab?: FeedTab; author?: string; before?: number }) => post<FeedReply>('/api/feed', q),
  badge: () => post<{ latest: number }>('/api/feed/badge'),
  publish: (text: string, photo: string | null) => post<{ post?: PostView; error?: string }>('/api/feed/post', { text, photo }),
  remove: (id: string) => post<{ ok?: boolean; error?: string }>('/api/feed/delete', { post: id }),
  like: (id: string, on: boolean) => post<{ post?: PostView; error?: string }>('/api/feed/like', { post: id, on }),
  report: (id: string) => post<{ note?: string; error?: string }>('/api/feed/report', { post: id }),
  follow: (r: ProfileRef, on: boolean) => post<ProfileReply>('/api/feed/follow', { ...refBody(r), on }),
  friend: (r: ProfileRef) => post<ProfileReply>('/api/feed/friend', refBody(r)),
};
