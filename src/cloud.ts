// Копия прогресса на сервере: при входе берём более свежую (телефон или сервер), дальше отправляем каждое сохранение.
import { useEffect, useState } from 'react';
import { loadProgress, onProgressSaved, Progress, replaceProgress } from './game/progress';
import { guestId, tg } from './telegram';

const auth = () => ({ initData: tg?.initData ?? '', guestId: guestId() });

export const post = (path: string, body: object, keepalive = false) =>
  fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...auth(), ...body }), keepalive }).then(async (r) => {
    if (!r.ok) throw Object.assign(new Error(String(r.status)), { status: r.status, body: await r.json().catch(() => null) });
    return r.json();
  });

// Аккаунт, чей прогресс сейчас в телефоне (server/accounts.ts). Сменился — значит, этот вход привязали к другому герою.
const ACCOUNT_KEY = 'fit-arena-account';
const storedAccount = () => {
  try {
    return localStorage.getItem(ACCOUNT_KEY);
  } catch {
    return null;
  }
};
const storeAccount = (id: string) => {
  try {
    localStorage.setItem(ACCOUNT_KEY, id);
  } catch {
    // Нет хранилища.
  }
};

/** Вход привязан к другому герою: берём его прогресс (или чистый лист) и перезапускаем игру. */
export function switchAccount(id: string, progress: Progress | null): void {
  stopped = true;
  pending = null;
  replaceProgress(progress ?? ({} as Progress));
  storeAccount(id);
  location.reload();
}

export interface Remind {
  hour: number;
  tz: number;
}

// pro — Pro Pass: решает только сервер по id в Telegram.
// raidNotify — бот пишет о рейде клана (по умолчанию да).
// admin — видит статистику (список админов на сервере).
// account — id аккаунта на сервере; linkable — вошёл через мессенджер, можно привязывать другие входы.
type CloudState = { remind: Remind | null; bot: boolean; telegram: boolean; pro: boolean; raidNotify: boolean; admin: boolean; account?: string; linkable: boolean };
let cloud: CloudState | null = null;
const listeners = new Set<(c: CloudState) => void>();

/** Подписка на ответ сервера: настройки могут открыть раньше, чем он придёт. */
export function onCloud(fn: (c: CloudState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
let pending: Progress | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

// После «Удалить мои данные» больше ничего не отправляем, пока приложение не перезапустят.
let stopped = false;

const push = (keepalive = false) => {
  if (stopped) return;
  if (timer) clearTimeout(timer);
  timer = null;
  const p = pending;
  pending = null;
  if (p) post('/api/progress/save', { progress: p, account: cloud?.account }, keepalive).catch((e) => (onSaveError(e) ? null : (pending ??= p)));
};

/** Отправить копию прогресса сейчас и дождаться ответа (перед набегом сервер должен знать войско). */
export async function syncNow(p?: Progress): Promise<void> {
  if (stopped) return;
  if (timer) clearTimeout(timer);
  timer = null;
  const next = p ?? pending;
  pending = null;
  if (!next) return;
  await post('/api/progress/save', { progress: next, account: cloud?.account }).catch((e) => {
    if (!onSaveError(e)) pending ??= next;
    throw e;
  });
}

/** Сервер не принял копию: вход теперь ведёт в другой аккаунт. Тогда перезагружаемся на его прогресс. */
function onSaveError(e: { status?: number; body?: { account?: string } }): boolean {
  if (e.status !== 409 || !e.body?.account) return false;
  const id = e.body.account;
  stopped = true;
  void post('/api/progress/load', {})
    .then((r: { progress: Progress | null }) => switchAccount(id, r.progress))
    .catch(() => switchAccount(id, null));
  return true;
}

/** Запуск синхронизации. onRemote — пришла более свежая копия с сервера. */
export async function startCloud(onRemote: (p: Progress) => void): Promise<void> {
  onProgressSaved((p) => {
    pending = p;
    if (cloud && !timer) timer = setTimeout(push, 1500);
  });
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && push(true));
  try {
    const r = (await post('/api/progress/load', {})) as {
      progress: Progress | null;
      remind: Remind | null;
      bot: boolean;
      telegram: boolean;
      pro?: boolean;
      raidNotify?: boolean;
      admin?: boolean;
      account?: string;
      linkable?: boolean;
    };
    cloud = { remind: r.remind, bot: r.bot, telegram: r.telegram, pro: !!r.pro, raidNotify: r.raidNotify !== false, admin: !!r.admin, account: r.account, linkable: !!r.linkable };
    listeners.forEach((fn) => fn(cloud!));
    // В телефоне прогресс другого аккаунта (вход привязали к другому герою на другой платформе): он здесь больше не нужен.
    const before = storedAccount();
    if (r.account && before && before !== r.account && !before.startsWith('guest:')) return switchAccount(r.account, r.progress);
    if (r.account) storeAccount(r.account);
    const local = loadProgress();
    // Новый телефон: своего прогресса нет, берём серверный, даже если игра уже успела что-то сохранить.
    const empty = !Object.keys(local.stars).length && !Object.keys(local.days).length;
    if (r.progress && (empty || (r.progress.savedAt ?? 0) > (local.savedAt ?? 0))) {
      replaceProgress(r.progress);
      onRemote(loadProgress());
    } else if (!r.progress || (local.savedAt ?? 0) > (r.progress.savedAt ?? 0)) {
      // Сохранения до облака без отметки времени: отправляем как есть, с отметкой «сейчас».
      pending ??= { ...local, savedAt: local.savedAt || Date.now() };
      push();
    }
  } catch {
    // Сервер недоступен: играем на копии в телефоне, отправим в следующий раз.
  }
}

export const cloudState = () => cloud;

/** Есть ли Pro Pass: до ответа сервера — нет. */
export function usePro(): boolean {
  const [pro, setPro] = useState(() => !!cloud?.pro);
  useEffect(() => onCloud((c) => setPro(c.pro)), []);
  return pro;
}

/** Админ ли игрок (по ответу сервера): до ответа — нет. */
export function useAdmin(): boolean {
  const [admin, setAdmin] = useState(() => !!cloud?.admin);
  useEffect(() => onCloud((c) => setAdmin(c.admin)), []);
  return admin;
}

/** Напоминание в боте в заданный час (null — выключить). */
export async function setRemind(hour: number | null): Promise<Remind | null> {
  const r = (await post('/api/remind', { remind: hour == null ? null : { hour, tz: -new Date().getTimezoneOffset() } })) as { remind: Remind | null };
  if (cloud) cloud.remind = r.remind;
  return r.remind;
}

/** Уведомления бота о рейде клана: начало, напоминание, итог. */
export async function setRaidNotify(on: boolean): Promise<boolean> {
  const r = (await post('/api/raid-notify', { on })) as { raidNotify: boolean };
  if (cloud) cloud.raidNotify = r.raidNotify;
  return r.raidNotify;
}

/** Стереть всё о себе на сервере: прогресс, профиль, клан, друзей, следы в статистике. */
export async function deleteMyData(): Promise<void> {
  stopped = true;
  pending = null;
  if (timer) clearTimeout(timer);
  timer = null;
  await post('/api/delete-me', {}).catch((e) => {
    stopped = false;
    throw e;
  });
}

/** Ссылка на страницу статистики для админа (подписана сервером, живёт неделю). */
export const adminStatsUrl = (): Promise<string> => post('/api/admin/link', {}).then((r: { url: string }) => r.url);
