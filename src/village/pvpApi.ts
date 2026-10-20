/**
 * Набеги на деревни других игроков. Судья — сервер (server/villages.ts):
 *   findTarget()       → POST /api/village/find: соперник близкого уровня ратуши и кубков (или деревня-бот,
 *                        если живых нет), seed боя и бронь цели на время боя.
 *   revengeTarget(id)  → POST /api/village/revenge: обидчик из журнала обороны, без поиска.
 *   submitAttack()     → POST /api/village/attack: сервер сам проверяет войско и высадки и считает бой.
 *                        Добычу в запасы телефон кладёт только из этого ответа (applyWin, src/village/pvp.ts).
 *   fetchInbox()       → POST /api/village/inbox: набеги на меня (applyDefense) и мои незачтённые победы.
 *   fetchTop()         → POST /api/village/top: топ-50 по кубкам.
 * Без сети набеги на игроков недоступны (кнопка «Нужен интернет»), лагеря Князя работают как обычно.
 */
import type { AttackOutcome, AttackSubmit, PvpInbox, PvpMe, PvpTopRow, TargetView } from '../../shared/villagePvp';
import { syncNow } from '../cloud';
import { guestId, tg, userName } from '../telegram';
import type { DefenseEntry } from './types';

export type { AttackOutcome, AttackSubmit, TargetView } from '../../shared/villagePvp';

/** Ошибка, которую можно показать игроку как есть. status 0 — нет сети. */
export class PvpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const OFFLINE = 'Нужен интернет';
export const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

async function call<T>(path: string, body: object = {}): Promise<T> {
  if (!isOnline()) throw new PvpError(OFFLINE, 0);
  let r: Response;
  try {
    r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: tg?.initData ?? '', guestId: guestId(), name: userName(), ...body }) });
  } catch {
    throw new PvpError(OFFLINE, 0);
  }
  const data = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new PvpError(data.error ?? (r.status === 401 ? 'Набеги на игроков — только в Telegram' : 'Сервер не ответил. Попробуй позже.'), r.status);
  return data;
}

/** Найти соперника. Перед поиском отправляем свежую копию прогресса: сервер проверяет войско по ней. */
export async function findTarget(): Promise<TargetView> {
  if (!isOnline()) throw new PvpError(OFFLINE, 0);
  await syncNow().catch(() => null);
  return call<TargetView>('/api/village/find');
}

export async function revengeTarget(attackId: string): Promise<TargetView> {
  if (!isOnline()) throw new PvpError(OFFLINE, 0);
  await syncNow().catch(() => null);
  return call<TargetView>('/api/village/revenge', { attackId });
}

/** Отправить набег: результат — только серверный. */
export const submitAttack = (a: AttackSubmit) => call<AttackOutcome>('/api/village/attack', a);
export const fetchInbox = () => call<PvpInbox>('/api/village/inbox');
export const fetchTop = () => call<{ top: PvpTopRow[]; me: PvpMe | null }>('/api/village/top');
export const setPvpNotify = (on: boolean) => call<PvpMe>('/api/village/notify', { on });

/** Журнал обороны: набеги Князя и игроков уже лежат в прогрессе (набеги игроков приходят через inbox). */
export async function defenseLog(local: DefenseEntry[]): Promise<DefenseEntry[]> {
  return local;
}
