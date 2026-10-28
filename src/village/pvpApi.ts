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
import { t } from '../i18n';

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

export const OFFLINE = t('Нужен интернет');
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
  if (!r.ok) throw new PvpError(data.error ?? (r.status === 401 ? t('Набеги на игроков — только в Telegram') : t('Сервер не ответил. Попробуй позже.')), r.status);
  return data;
}

export const NO_SERVER = t('Нет связи с сервером');

/**
 * Сервер на связи? Короткий запрос с таймаутом: перед набегом лучше знать заранее,
 * что итог не дойдёт, чем узнать после боя.
 */
export async function pingServer(ms = 5000): Promise<boolean> {
  if (!isOnline()) return false;
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), ms);
  try {
    const r = await fetch('/api/health', { cache: 'no-store', signal: ctl?.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Свежая копия прогресса на сервере: по ней он проверяет войско. Не дошла — в набег не идём. */
async function syncFirst(): Promise<void> {
  try {
    await syncNow();
  } catch {
    throw new PvpError(t('{0}: войско не сохранилось на сервере, итог набега не засчитали бы. Проверь интернет и попробуй ещё раз.', { 0: NO_SERVER }), 0);
  }
}

/** Найти соперника. Перед поиском отправляем свежую копию прогресса: сервер проверяет войско по ней. */
export async function findTarget(): Promise<TargetView> {
  if (!isOnline()) throw new PvpError(OFFLINE, 0);
  await syncFirst();
  return call<TargetView>('/api/village/find');
}

export async function revengeTarget(attackId: string): Promise<TargetView> {
  if (!isOnline()) throw new PvpError(OFFLINE, 0);
  await syncFirst();
  return call<TargetView>('/api/village/revenge', { attackId });
}

/** Отправить набег: результат — только серверный. */
export const submitAttack = (a: AttackSubmit) => call<AttackOutcome>('/api/village/attack', a);

/** Сбой связи или сервера (стоит повторить), а не отказ проверки. */
export const isTransient = (e: unknown) => !(e instanceof PvpError) || e.status === 0 || e.status >= 500;

/**
 * Отправить итог с повторами: связь в метро и лифте пропадает на секунды. Сервер принимает
 * тот же бой повторно и отдаёт тот же итог, так что повтор награду не удвоит.
 */
export async function submitWithRetry(a: AttackSubmit, onRetry?: (attempt: number) => void, tries = 4): Promise<AttackOutcome> {
  for (let k = 1; ; k++) {
    try {
      return await submitAttack(a);
    } catch (e) {
      if (k >= tries || !isTransient(e)) throw e;
      onRetry?.(k);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** (k - 1)));
    }
  }
}

// Итог набега, который не удалось отправить: лежит на телефоне, пока не дойдёт (или не устареет).
const PENDING_KEY = 'fit-arena-pvp-pending';
const PENDING_MS = 18 * 60_000;
export interface PendingAttack extends AttackSubmit {
  at: number;
  revengeOf?: string;
}
export function savePending(a: PendingAttack): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(a));
  } catch {
    // Хранилище недоступно — повторить можно только сейчас.
  }
}
export function loadPending(now = Date.now()): PendingAttack | null {
  try {
    const a = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as PendingAttack | null;
    if (a && now - a.at < PENDING_MS) return a;
    if (a) localStorage.removeItem(PENDING_KEY);
  } catch {
    // Нет хранилища или мусор в нём.
  }
  return null;
}
export function clearPending(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // Нет хранилища.
  }
}
export const fetchInbox = () => call<PvpInbox>('/api/village/inbox');
export const fetchTop = () => call<{ top: PvpTopRow[]; me: PvpMe | null }>('/api/village/top');
export const setPvpNotify = (on: boolean) => call<PvpMe>('/api/village/notify', { on });

/** Журнал обороны: набеги Князя и игроков уже лежат в прогрессе (набеги игроков приходят через inbox). */
export async function defenseLog(local: DefenseEntry[]): Promise<DefenseEntry[]> {
  return local;
}
