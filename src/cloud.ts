// Копия прогресса на сервере: при входе берём более свежую (телефон или сервер), дальше отправляем каждое сохранение.
import { useEffect, useState } from 'react';
import { loadProgress, onProgressSaved, Progress, replaceProgress } from './game/progress';
import { guestId, tg } from './telegram';

const auth = () => ({ initData: tg?.initData ?? '', guestId: guestId() });

const post = (path: string, body: object, keepalive = false) =>
  fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...auth(), ...body }), keepalive }).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  });

export interface Remind {
  hour: number;
  tz: number;
}

// pro — Pro Pass: решает только сервер по id в Telegram.
// raidNotify — бот пишет о рейде клана (по умолчанию да).
// admin — видит статистику (список админов на сервере).
type CloudState = { remind: Remind | null; bot: boolean; telegram: boolean; pro: boolean; raidNotify: boolean; admin: boolean };
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
  if (p) post('/api/progress/save', { progress: p }, keepalive).catch(() => (pending ??= p));
};

/** Запуск синхронизации. onRemote — пришла более свежая копия с сервера. */
export async function startCloud(onRemote: (p: Progress) => void): Promise<void> {
  onProgressSaved((p) => {
    pending = p;
    if (cloud && !timer) timer = setTimeout(push, 1500);
  });
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && push(true));
  try {
    const r = (await post('/api/progress/load', {})) as { progress: Progress | null; remind: Remind | null; bot: boolean; telegram: boolean; pro?: boolean; raidNotify?: boolean; admin?: boolean };
    cloud = { remind: r.remind, bot: r.bot, telegram: r.telegram, pro: !!r.pro, raidNotify: r.raidNotify !== false, admin: !!r.admin };
    listeners.forEach((fn) => fn(cloud!));
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
