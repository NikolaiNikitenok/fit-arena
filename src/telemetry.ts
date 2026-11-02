// Отчёты об ошибках и анонимная статистика на наш сервер (server/telemetry.ts).
// Уходит: версия сборки, платформа Telegram, браузер, размер экрана, «экономия батареи»,
// откуда открыли (метка ссылки), анонимный id (хеш, shared/anon.ts) и короткие события. Ни id в Telegram, ни имени, ни видео.
import { anonId } from '../shared/anon';
import { getSettings } from './settings';
import { appSource, guestId, tg } from './telegram';

declare const __APP_VERSION__: string;
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

/** События — тот же список, что на сервере (EVENTS в server/telemetry.ts). */
export type TrackEvent = 'app_open' | 'onb_step' | 'onb_done' | 'mission_start' | 'mission_win' | 'mission_lose' | 'camera_granted' | 'camera_denied' | 'duel_start' | 'raid_start' | 'program_start' | 'event_start' | 'dungeon_start' | 'dungeon_win' | 'dungeon_lose' | 'recap_open' | 'recap_share' | 'home_shortcut' | 'share_chat' | 'emoji_status' | 'manual_start' | 'first_rep' | 'unlock' | 'letter_open' | 'gift_claim' | 'weekly_card' | 'ghost_fight' | 'village_th2' | 'balance' | 'group_join' | 'group_create' | 'invite_card' | 'offer_seen' | 'buy_tap' | 'buy_result' | 'offer_popup' | 'warmup' | 'post_share' | 'morning' | 'auto_post' | 'channel_offer';

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

// Время до первого засчитанного повтора у новичка: от первого открытия знакомства до повтора.
const FIRST_OPEN_KEY = 'fit-arena-first-open';
const FIRST_REP_KEY = 'fit-arena-first-rep';

/** Знакомство открыто впервые: запоминаем время (только у новичков — у старых игроков отсчёта нет). */
export function markFirstOpen(at = Date.now()): void {
  try {
    if (!localStorage.getItem(FIRST_OPEN_KEY)) localStorage.setItem(FIRST_OPEN_KEY, String(at));
  } catch {
    // Без хранилища времени не узнаем.
  }
}

/** Секунды до первого повтора, по корзинам: 30, 60, 120, 300 и 999 (дольше пяти минут). */
export const firstRepBucket = (sec: number): number => [30, 60, 120, 300].find((b) => sec <= b) ?? 999;

/** Первый засчитанный повтор новичка: событие один раз за всё время. */
export function trackFirstRep(): void {
  try {
    const opened = Number(localStorage.getItem(FIRST_OPEN_KEY));
    if (!opened || localStorage.getItem(FIRST_REP_KEY)) return;
    localStorage.setItem(FIRST_REP_KEY, '1');
    track('first_rep', firstRepBucket((Date.now() - opened) / 1000));
  } catch {
    // Без хранилища — без события.
  }
}

const TH2_KEY = 'fit-arena-th2';
/** Ратуша деревни впервые стала 2-го уровня: через сколько дней от первой тренировки (цель — 1–2 дня). */
export function trackVillageTh2(th: number, days: Record<string, number>): void {
  try {
    // Только настоящий переход с 1-го уровня на этом телефоне: старые игроки с ратушей 2+ цифру не портят.
    if (th < 2) {
      if (!localStorage.getItem(TH2_KEY)) localStorage.setItem(TH2_KEY, 'th1');
      return;
    }
    if (localStorage.getItem(TH2_KEY) !== 'th1') return localStorage.setItem(TH2_KEY, '1');
    localStorage.setItem(TH2_KEY, '1');
    const first = Object.keys(days).sort()[0];
    const n = first ? Math.max(0, Math.round((Date.now() - Date.parse(`${first}T12:00:00`)) / 86_400_000)) : 0;
    track('village_th2', Math.min(n, 99));
  } catch {
    // Без хранилища — без события.
  }
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
