// Бот NikitenokArena в Max (https://dev.max.ru/docs-api): /start с кнопкой мини-приложения, приглашения и уведомления.
//   MAX_BOT_TOKEN или файл .max-token рядом с сервером (автодеплой кладёт его из секрета репозитория).
//   MAX_CA_FILE — корневой сертификат Минцифры (Russian Trusted Root CA): им подписан platform-api2.max.ru,
//     а в Node его нет. По умолчанию russian-trusted-root-ca.pem рядом с сервером (его скачивает автодеплой).
//     Доверяем ему только в запросах к Max, не во всём сервере.
// Обновления приходят вебхуком на APP_URL/api/max (секрет в заголовке X-Max-Bot-Api-Secret).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import https from 'node:https';
import { join } from 'node:path';
import tls from 'node:tls';
import { startReply } from './bot';
import type { Lang } from '../src/i18n';

const MAX_API = (process.env.MAX_API_BASE ?? 'https://platform-api2.max.ru').replace(/\/$/, '');

const readFile = (f: string) => {
  try {
    return readFileSync(f, 'utf8').trim();
  } catch {
    return '';
  }
};

export const MAX_TOKEN = readFile(process.env.MAX_TOKEN_FILE ?? join(__dirname, '.max-token')) || process.env.MAX_BOT_TOKEN || '';
const CA = readFile(process.env.MAX_CA_FILE ?? join(__dirname, 'russian-trusted-root-ca.pem'));
const agent = new https.Agent({ keepAlive: true, family: 4, ca: CA ? [...tls.rootCertificates, CA] : undefined });

// Для /api/health: видно, ходит ли сервер в Max, без доступа к логам.
export const maxStatus: { token: boolean; ca: boolean; username: string | null; webhook: boolean; lastOkAt: number | null; lastError: string | null; handled: number } = {
  token: !!MAX_TOKEN,
  ca: !!CA,
  username: null,
  webhook: false,
  lastOkAt: null,
  lastError: null,
  handled: 0,
};

export type MaxReply = { ok: boolean; status: number; body: Record<string, unknown> | null };

/** Вызов Bot API Max: токен в заголовке Authorization (без Bearer). */
export function maxApi(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, timeoutMs = 20_000): Promise<MaxReply> {
  const data = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = https.request(
      `${MAX_API}${path}`,
      { method, agent, timeout: timeoutMs, headers: { Authorization: MAX_TOKEN, ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}) } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          let json: Record<string, unknown> | null = null;
          try {
            json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            // Пустой или не JSON ответ.
          }
          const ok = (res.statusCode ?? 0) < 300;
          if (ok) maxStatus.lastOkAt = Date.now();
          else maxStatus.lastError = `${method} ${path.split('?')[0]}: HTTP ${res.statusCode} ${json?.message ?? ''}`.trim();
          resolve({ ok, status: res.statusCode ?? 0, body: json });
        });
      },
    );
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', (e: NodeJS.ErrnoException) => {
      maxStatus.lastError = `${path.split('?')[0]}: ${e.code ?? ''} ${e.message}`.trim();
      reject(e);
    });
    req.end(data);
  });
}

// Кнопка мини-приложения в Max: имя и id бота из /me.
let me: { username: string; userId: number } | null = null;

/** Адрес из кнопки Telegram (?clan=КОД, ?tab=clan…) → параметр запуска Max (start_param: только буквы, цифры, _ и -). */
export function startPayload(url: string): string {
  const q = new URL(url, 'https://x').searchParams;
  const [key, value] = [...q.entries()][0] ?? [];
  const clean = (s: string) => s.replace(/[^\w-]/g, '').slice(0, 120);
  if (!key) return '';
  if (key === 'room') return clean(value);
  return clean(`${key}-${value}`);
}

/** Кнопка под сообщением: мини-приложение, а пока бот не узнал своё имя — ссылка на сайт. */
export function appButton(text: string, url: string): Record<string, unknown> {
  if (!me) return { type: 'link', text, url };
  const payload = startPayload(url);
  return { type: 'open_app', text, web_app: me.username, contact_id: me.userId, ...(payload ? { payload } : {}) };
}

/** Сообщение игроку Max с одной кнопкой. */
export function maxSend(userId: number, text: string, button?: { text: string; url: string }): Promise<MaxReply> {
  const attachments = button ? [{ type: 'inline_keyboard', payload: { buttons: [[appButton(button.text, button.url)]] } }] : undefined;
  return maxApi('POST', `/messages?user_id=${userId}`, { text: text.slice(0, 4000), attachments });
}

/** Ссылка, открывающая мини-приложение в Max с параметром (приглашения из игры, запущенной в Max). */
export const maxAppLink = (payload: string) => (me ? `https://max.ru/${me.username}?startapp=${payload}` : null);
export const maxUsername = () => me?.username ?? null;

/** Секрет вебхука: Max присылает его в X-Max-Bot-Api-Secret. */
export const maxWebhookSecret = () => createHash('sha256').update(`max-webhook:${MAX_TOKEN}`).digest('hex').slice(0, 40);

export interface MaxUpdate {
  update_type?: string;
  user?: { user_id?: number; first_name?: string; name?: string; username?: string };
  payload?: string | null;
  message?: { sender?: { user_id?: number; first_name?: string; name?: string; username?: string }; recipient?: { chat_type?: string; chat_id?: number }; body?: { text?: string | null } };
}

export interface MaxHandlers {
  appUrl: string;
  clanByCode: Parameters<typeof startReply>[2];
  /** Язык игрока Max (выбранный в игре); без него — русский. */
  langOf?: (userId: number) => Lang;
  /** Игрок написал боту: снова можно писать ему (вход max:ID). */
  onUser?: (userId: number) => void;
  /** Не команда: пересылаем разработчику, возвращаем ответ игроку или null. */
  onText?: (from: { id: number; name: string; username?: string }, text: string) => string | null;
}

/** Разобрать обновление вебхука и ответить. */
export async function onMaxUpdate(u: MaxUpdate, h: MaxHandlers): Promise<void> {
  if (u.update_type === 'bot_started') {
    const id = u.user?.user_id;
    if (!id) return;
    h.onUser?.(id);
    const r = startReply(`/start ${u.payload ?? ''}`.trim(), h.appUrl, h.clanByCode, h.langOf?.(id));
    if (r) await maxSend(id, r.text, { text: r.button, url: r.url }).catch(() => null);
    maxStatus.handled++;
    return;
  }
  if (u.update_type !== 'message_created') return;
  const m = u.message;
  const id = m?.sender?.user_id;
  const text = m?.body?.text?.trim();
  // Только личка с ботом: в группах молчим.
  if (!id || !text || (m?.recipient?.chat_type && m.recipient.chat_type !== 'dialog')) return;
  h.onUser?.(id);
  const r = startReply(text, h.appUrl, h.clanByCode, h.langOf?.(id));
  if (r) await maxSend(id, r.text, { text: r.button, url: r.url }).catch(() => null);
  else if (!text.startsWith('/')) {
    const answer = h.onText?.({ id, name: m?.sender?.first_name ?? m?.sender?.name ?? 'Игрок', username: m?.sender?.username }, text);
    if (answer) await maxSend(id, answer).catch(() => null);
  }
  maxStatus.handled++;
}

/** Запуск: узнать имя бота и подписаться на вебхук. Повторяем, пока Max не ответит. */
export async function startMaxBot(appUrl: string): Promise<void> {
  if (!MAX_TOKEN) return;
  const url = `${appUrl.replace(/\/$/, '')}/api/max`;
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await maxApi('GET', '/me');
      const username = r.body?.username;
      const userId = Number(r.body?.user_id);
      if (r.ok && typeof username === 'string' && userId) {
        me = { username, userId };
        maxStatus.username = username;
        const s = await maxApi('POST', '/subscriptions', { url, update_types: ['bot_started', 'message_created'], secret: maxWebhookSecret() });
        maxStatus.webhook = s.ok;
        if (s.ok) return;
      }
    } catch {
      // Ошибка уже в maxStatus.lastError.
    }
    await new Promise((res) => setTimeout(res, Math.min(10 * 60_000, 15_000 * 2 ** attempt)).unref?.());
  }
}
