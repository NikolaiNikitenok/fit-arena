// Новая версия на сервере: сборка кладёт version.json (vite.config.ts), открытая игра время от времени его проверяет.
// «Обновить» сначала отправляет несохранённый прогресс на сервер, потом перезагружает страницу на новую сборку.
import { useSyncExternalStore } from 'react';
import { syncNow } from '../cloud';
import { hasHero, loadProgress } from '../game/progress';
import { APP_VERSION } from '../telemetry';
import { ChangeEntry, CHANGELOG, LATEST_CHANGE } from './changelog';

export interface Remote {
  version: string;
  changelog: ChangeEntry[];
}

const SEEN_KEY = 'fit-arena-seen-changes';
const TRIED_KEY = 'fit-arena-update-tried';
const CHECK_EVERY = 3 * 60_000;

let remote: Remote | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Вышедшая версия новее этой или null. */
export const useRemoteUpdate = (): Remote | null => useSyncExternalStore(subscribe, () => remote);

const session = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      // Нет хранилища.
    }
  },
};

export async function checkUpdate(): Promise<void> {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const v = (await r.json()) as Remote;
    if (!v?.version || v.version === APP_VERSION) return;
    // Уже перезагружались на эту версию, а пришла старая (телефон отдал страницу из кеша): не зацикливаемся.
    if (session.get(TRIED_KEY) === v.version) return;
    if (remote?.version === v.version) return;
    remote = { version: v.version, changelog: Array.isArray(v.changelog) ? v.changelog : [] };
    emit();
  } catch {
    // Нет сети: проверим позже.
  }
}

/** Пункты для плашки: записи новее тех, что знает эта сборка. Пусто — значит, мелкие исправления. */
export const newEntries = (r: Remote): ChangeEntry[] => r.changelog.filter((e) => e.n > LATEST_CHANGE);

let reloading = false;
/** Сохранить прогресс и открыть новую сборку. Адрес с меткой версии: так телефон не возьмёт старую страницу из кеша. */
export async function applyUpdate(version = remote?.version ?? String(Date.now())): Promise<void> {
  if (reloading) return;
  reloading = true;
  session.set(TRIED_KEY, version);
  // Прогресс уже в телефоне (сохраняется сразу). На сервер отправляем то, что ещё не ушло, но долго не ждём.
  await Promise.race([syncNow().catch(() => null), new Promise((r) => setTimeout(r, 3000))]);
  const q = new URLSearchParams(location.search);
  q.set('v', version.replace(/[^\w-]/g, ''));
  location.replace(`${location.pathname}?${q}${location.hash}`);
}

/** Какие записи «Что нового» игрок ещё не видел в этой сборке (обновился, просто перезапустив игру). */
export function unseenEntries(): ChangeEntry[] {
  let seen: number | null = null;
  try {
    const s = localStorage.getItem(SEEN_KEY);
    seen = s === null ? null : Number(s) || 0;
  } catch {
    return [];
  }
  // Новый игрок ничего не пропустил. Тот, кто играл до появления плашек, видит последнюю запись.
  if (seen === null) seen = hasHero(loadProgress()) ? LATEST_CHANGE - 1 : LATEST_CHANGE;
  return CHANGELOG.filter((e) => e.n > seen!);
}

export function markSeen(n = LATEST_CHANGE): void {
  try {
    if (Number(localStorage.getItem(SEEN_KEY) ?? 0) < n) localStorage.setItem(SEEN_KEY, String(n));
  } catch {
    // Нет хранилища.
  }
}

let started = false;
export function initUpdates(): void {
  if (started) return;
  started = true;
  // Старых файлов сборки на сервере уже нет (выкладка их удаляет): экран не загрузился — значит, пора на новую версию.
  window.addEventListener('vite:preloadError', () => {
    const last = Number(session.get('fit-arena-preload-reload') ?? 0);
    if (Date.now() - last < 60_000) return;
    session.set('fit-arena-preload-reload', String(Date.now()));
    void applyUpdate(remote?.version);
  });
  if (!import.meta.env.PROD) return;
  setTimeout(checkUpdate, 15_000);
  setInterval(() => document.visibilityState === 'visible' && checkUpdate(), CHECK_EVERY);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkUpdate());
}
