// Отчёты об ошибках и анонимная статистика на наш сервер (server/telemetry.ts).
// Уходит: версия сборки, платформа Telegram, браузер, размер экрана, «экономия батареи»,
// откуда открыли (метка ссылки), анонимный id (хеш, shared/anon.ts) и короткие события. Ни id в Telegram, ни имени, ни видео.
import { anonId } from '../shared/anon';
import { getSettings } from './settings';
import { appSource, guestId, tg } from './telegram';

declare const __APP_VERSION__: string;
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

/** События — тот же список, что на сервере (EVENTS в server/telemetry.ts). */
export type TrackEvent = 'app_open' | 'onb_step' | 'onb_done' | 'mission_start' | 'mission_win' | 'mission_lose' | 'camera_granted' | 'camera_denied' | 'duel_start' | 'raid_start' | 'program_start' | 'event_start' | 'dungeon_start' | 'dungeon_win' | 'dungeon_lose' | 'recap_open' | 'recap_share' | 'home_shortcut' | 'share_chat' | 'emoji_status';

export type ErrorKind = 'error' | 'promise' | 'react' | 'camera' | 'model' | 'webgl';

interface QueuedError {
  kind: ErrorKind;
  message: string;
  stack: string;
  count: number;
}

const ENDPOINT = '/api/telemetry';
// За сессию отправляем не больше 60 разных ошибок: зациклившийся рендер не зальёт сервер.
const MAX_ERRORS_PER_SESSION = 60;

let events: { n: TrackEvent; p?: number | string }[] = [];
const errors = new Map<string, QueuedError>();
let errorsSent = 0;
let anon: Promise<string> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
const once = new Set<string>();

const playerId = () => {
  const id = tg?.initDataUnsafe.user?.id;
  return id ? `tg:${id}` : `guest:${guestId()}`;
};

const schedule = (ms = 8000) => {
  if (!started || timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, ms);
};

/** Событие для статистики. p — номер уровня, шаг знакомства и т. п. */
export function track(n: TrackEvent, p?: number | string): void {
  events.push(p == null ? { n } : { n, p });
  if (events.length > 100) events = events.slice(-100);
  schedule();
}

/** То же, но не чаще раза за сессию (камера разрешена и т. п.). */
export function trackOnce(n: TrackEvent, p?: number | string): void {
  const key = `${n}:${p ?? ''}`;
  if (once.has(key)) return;
  once.add(key);
  track(n, p);
}

/** Ошибка в отчёт. Одинаковые склеиваются в одну запись со счётчиком. */
export function reportError(kind: ErrorKind, err: unknown, extra?: string): void {
  const e = err instanceof Error ? err : null;
  const name = e?.name && e.name !== 'Error' ? `${e.name}: ` : '';
  const message = (name + (e?.message ?? (typeof err === 'string' ? err : safeString(err)))).slice(0, 500) || 'без сообщения';
  const stack = [e?.stack ?? '', extra ?? ''].filter(Boolean).join('\n--\n').slice(0, 1200);
  const key = `${kind}|${message}|${stack.split('\n')[1] ?? ''}`;
  const q = errors.get(key);
  if (q) q.count++;
  else {
    if (errorsSent + errors.size >= MAX_ERRORS_PER_SESSION) return;
    errors.set(key, { kind, message, stack, count: 1 });
  }
  // Ошибки — быстрее, чем события: телефон могут закрыть сразу после сбоя.
  schedule(2000);
}

function safeString(v: unknown): string {
  try {
    return typeof v === 'object' ? JSON.stringify(v).slice(0, 300) : String(v);
  } catch {
    return String(v);
  }
}

/** Ошибка камеры или модели: отказ в доступе — это событие, остальное — ошибка в отчёт. */
export function reportCameraFailure(e: unknown, stage: 'camera' | 'model'): void {
  const name = e instanceof Error ? e.name : '';
  if (stage === 'camera' && (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError')) return trackOnce('camera_denied');
  reportError(stage, e);
}

/** Отправить накопленное. sendBeacon доходит, даже если мини-приложение закрывают. */
export async function flush(): Promise<void> {
  if (!events.length && !errors.size) return;
  const batch = { events, errors: [...errors.values()] };
  events = [];
  errorsSent += errors.size;
  errors.clear();
  let id = '';
  try {
    id = await (anon ??= anonId(playerId()));
  } catch {
    // Без crypto.subtle (не https) статистику не шлём.
    return;
  }
  const s = getSettings();
  const body = JSON.stringify({
    anon: id,
    v: APP_VERSION,
    platform: (tg as { platform?: string } | undefined)?.platform ?? 'browser',
    tgv: (tg as { version?: string } | undefined)?.version ?? '',
    ua: navigator.userAgent,
    screen: `${screen.width}x${screen.height}@${Math.round((devicePixelRatio || 1) * 10) / 10}`,
    lowPower: s.lowPower,
    path: location.pathname + location.search.replace(/initData=[^&]*/g, ''),
    src: appSource(),
    ...batch,
  });
  try {
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
  } catch {
    // Некоторые WebView запрещают beacon — пробуем обычный запрос.
  }
  fetch(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => null);
}

/** Слушатели ошибок и первое событие. Вызывается один раз из main.tsx. */
export function initTelemetry(): void {
  if (started) return;
  started = true;
  window.addEventListener('error', (e) => {
    // Не загрузился скрипт или картинка: у события нет error, есть target.
    if (!e.error && e.target && e.target !== window) return;
    reportError('error', e.error ?? e.message, e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined);
  });
  window.addEventListener('unhandledrejection', (e) => reportError('promise', e.reason));
  // Потеря WebGL: событие не всплывает, ловим на перехвате. Сцена, которую закрыли, теряет
  // контекст нарочно (three освобождает видеопамять) — такие пропускаем: холста уже нет на странице.
  window.addEventListener(
    'webglcontextlost',
    (e) => {
      const canvas = e.target as HTMLCanvasElement | null;
      setTimeout(() => canvas?.isConnected && document.visibilityState === 'visible' && reportError('webgl', 'WebGL context lost', `canvas ${canvas.width}x${canvas.height}`), 1000);
    },
    true,
  );
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void flush());
  window.addEventListener('pagehide', () => void flush());
  track('app_open');
  schedule(3000);
}
