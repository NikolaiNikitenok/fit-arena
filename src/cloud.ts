// Копия прогресса на сервере: при входе берём более свежую (телефон или сервер), дальше отправляем каждое сохранение.
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

let cloud: { remind: Remind | null; bot: boolean; telegram: boolean } | null = null;
let pending: Progress | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const push = (keepalive = false) => {
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
    const r = (await post('/api/progress/load', {})) as { progress: Progress | null; remind: Remind | null; bot: boolean; telegram: boolean };
    cloud = { remind: r.remind, bot: r.bot, telegram: r.telegram };
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

/** Напоминание в боте в заданный час (null — выключить). */
export async function setRemind(hour: number | null): Promise<Remind | null> {
  const r = (await post('/api/remind', { remind: hour == null ? null : { hour, tz: -new Date().getTimezoneOffset() } })) as { remind: Remind | null };
  if (cloud) cloud.remind = r.remind;
  return r.remind;
}
