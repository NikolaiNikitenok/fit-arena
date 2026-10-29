// Запросы экрана друзей к серверу (server/friendsApi.ts).
import type { ChallengeView, FriendsState } from '../../shared/protocol';
import type { Exercise } from '../repCounter';
import { guestId, tg, userName } from '../telegram';
import { t, tErr } from '../i18n';

export type FriendsReply = FriendsState & { error?: string; added?: string; requested?: string; room?: string; note?: 'app' | 'bot' | 'quiet' | 'off' };

/** Сервер не пустил: друзья только у игроков Telegram. */
export class NotTelegram extends Error {}

async function post<T>(path: string, body: object = {}): Promise<T> {
  const r = await fetch(`/api/friends${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: tg?.initData ?? '', guestId: guestId(), name: userName(), ...body }),
  });
  if (r.status === 401) throw new NotTelegram();
  if (!r.ok) throw new Error(String(r.status));
  return tErr(await r.json());
}

export const friendsApi = {
  state: () => post<FriendsReply>(''),
  add: (q: { code?: string; invite?: string }) => post<FriendsReply>('/add', q),
  answer: (id: string, accept: boolean) => post<FriendsReply>('/answer', { id, accept }),
  remove: (id: string) => post<FriendsReply>('/remove', { id }),
  notify: (on: boolean) => post<FriendsReply>('/notify', { on }),
  challenge: (id: string, exercise: Exercise) => post<FriendsReply>('/challenge', { id, exercise }),
  inbox: () => post<{ challenges: ChallengeView[] }>('/inbox'),
  decline: (challenge: string) => post<{ challenges: ChallengeView[] }>('/decline', { challenge }),
};

/** «Был сегодня», «вчера», «3 дн. назад» — по местной дате телефона. */
export function lastDayText(day: string | null, now = Date.now()): string {
  if (!day) return t('ещё не тренировался');
  const today = new Date(now);
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (day === key(today)) return t('тренировался сегодня');
  const days = Math.round((Date.parse(`${key(today)}T12:00:00`) - Date.parse(`${day}T12:00:00`)) / 86_400_000);
  if (days === 1) return t('тренировался вчера');
  return days > 0 ? t('тренировался {0} дн. назад', { 0: days }) : t('тренировался сегодня');
}
