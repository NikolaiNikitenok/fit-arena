// Бот NikitenokArena: отвечает на /start кнопкой, которая открывает мини-приложение.
// Приглашения ведут сюда (t.me/<бот>?start=clan-КОД): после «Старт» игрок входит в приложение
// уже под своим аккаунтом Telegram, а код клана передаётся в адресе приложения.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import { join } from 'node:path';
import tls from 'node:tls';
import { paySupportText } from './proSales';
import { type Lang, langOfCode, tl } from '../src/i18n';

export interface StartReply {
  text: string;
  button: string;
  url: string;
  // Картинка над текстом: приветствие показывает игру.
  photo?: string;
}

export const welcomeText = (l: Lang) =>
  tl(l, 'Привет! Это NikitenokArena, игра, в которой тренировка становится приключением.\n\n📷 Камера телефона сама считает отжимания, приседания и пресс. Видео никуда не уходит.\n⚔️ Каждый повтор бьёт врага: 300 уровней в трёх мирах, боссы и коварный Князь Диван.\n🥊 Дуэли с живыми соперниками, лиги и сезоны.\n🛡 Клан с друзьями и рейд-босс по выходным.\n🔥 Серия дней, задания от жителей и напоминания, чтобы не бросить.\n\nНажми «Играть», и Мастер Гром проведёт тебя через первое испытание. Поставь телефон сбоку, чтобы камера видела тебя целиком.');

/** Ответ на /help: как играть, приватность и связь с разработчиком. */
export const helpText = (base: string, l: Lang = 'ru') =>
  tl(l, 'NikitenokArena: камера телефона считает отжимания, приседания, пресс и планку, а каждый повтор бьёт врага.\n\n📷 Видео с камеры обрабатывается только на телефоне и никуда не отправляется.\n🔒 Политика конфиденциальности: {0}/privacy.html\n🗑 Удалить свои данные: в игре «Настройки» → «Удалить мои данные».\n✉️ Вопрос или ошибка — просто напиши сюда сообщением, его прочитает разработчик NikitenokArena.', { 0: base });

// «Что умеет этот бот?» до нажатия «Старт» и короткое описание в профиле бота (Telegram показывает их на языке игрока).
export const botDescription = (l: Lang) => tl(l, 'NikitenokArena: отжимания, приседания и пресс под камеру телефона. Каждый повтор бьёт врага: приключение на 300 уровней, дуэли, кланы и рейд-боссы. Нажми «Старт», чтобы начать.');
export const botShortDescription = (l: Lang) => tl(l, 'Тренировка-приключение: камера считает повторы, а каждый повтор бьёт врага.');

/** Ответ на «/start [параметр]»: clan-КОД — клан, friend-ТОКЕН — друг, src-МЕТКА — вход с меткой источника, иначе код дуэли или просто вход. */
export function startReply(text: string, appUrl: string, clanByCode: (code: string) => { name: string; tag: string; members: number } | undefined, l: Lang = 'ru'): StartReply | null {
  const m = /^\/(start|help|paysupport)(?:@\w+)?(?:\s+(\S+))?/.exec(text.trim());
  if (!m) return null;
  const param = (m[2] ?? '').replace(/[^\w-]/g, '').slice(0, 40);
  const base = appUrl.replace(/\/$/, '');
  if (m[1] === 'paysupport') return { text: paySupportText(l), button: tl(l, 'Открыть пропуск'), url: `${base}/?tab=pass` };
  if (m[1] === 'help') return { text: helpText(base, l), button: tl(l, 'Играть'), url: `${base}/` };
  if (param.startsWith('clan-')) {
    const code = param.slice(5).toUpperCase();
    const clan = clanByCode(code);
    if (clan)
      return {
        text: tl(l, 'Тебя зовут в клан «{0}» [{1}] — в нём уже {2}. По выходным клан бьёт огромного рейд-босса, а каждый твой повтор — удар по нему.\n\nНажми кнопку, и ты сразу окажешься в клане.', { 0: clan.name, 1: clan.tag, 2: clan.members }),
        button: tl(l, 'Вступить в клан'),
        url: `${base}/?clan=${code}`,
      };
    return { text: tl(l, 'Это приглашение устарело или клан распущен. Открой NikitenokArena и найди клан по названию.'), button: tl(l, 'Открыть NikitenokArena'), url: `${base}/` };
  }
  // Ссылка друга (friend-ТОКЕН): после «Старт» приложение само добавит его в друзья.
  if (param.startsWith('friend-')) {
    const token = param.slice(7).toUpperCase().replace(/[^A-Z0-9]/g, '');
    return {
      text: tl(l, 'Тебя зовут в друзья в NikitenokArena! Друзья видят, кто тренировался сегодня, и вызывают друг друга на дуэль в один тап.\n\nНажми кнопку — и вы сразу станете друзьями.'),
      button: tl(l, 'Добавить в друзья'),
      url: `${base}/?friend=${token}`,
    };
  }
  if (/^[A-Z0-9]{4,8}$/i.test(param)) return { text: tl(l, 'Тебя вызвали на дуэль! Нажми кнопку, чтобы войти в комнату боя.'), button: tl(l, 'Принять вызов'), url: `${base}/?room=${param.toUpperCase()}` };
  // Метка источника (реклама, пост, блогер): t.me/<бот>?start=src-МЕТКА — статистика покажет, сколько пришло.
  const src = param.startsWith('src-') ? param.slice(4).replace(/[^\w-]/g, '').slice(0, 24) : '';
  return { text: welcomeText(l), button: tl(l, 'Играть'), url: src ? `${base}/?src=${src}` : `${base}/`, photo: `${base}/bot/welcome.jpg` };
}

export interface TgMessage {
  message_id?: number;
  chat: { id: number; type: string };
  from?: { id?: number; first_name?: string; username?: string; language_code?: string };
  text?: string;
  caption?: string;
  photo?: { file_id: string; width: number; height: number }[];
  media_group_id?: string;
  reply_to_message?: { message_id: number };
  // Оплата звёздами прошла (Pro Pass, server/proSales.ts).
  successful_payment?: { currency: string; total_amount: number; invoice_payload: string; telegram_payment_charge_id: string };
}
export interface Update {
  update_id: number;
  message?: TgMessage;
  // Нажатие кнопки под сообщением бота (черновики постов для канала).
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { message_id: number; chat: { id: number } } };
  // Игрок нажал «Оплатить»: за 10 секунд нужно подтвердить или отказать.
  pre_checkout_query?: { id: string; from: { id: number; first_name?: string; language_code?: string }; currency: string; total_amount: number; invoice_payload: string };
}

type TgReply = { ok: boolean; result?: unknown; description?: string; error_code?: number; parameters?: { retry_after?: number } };

// Адрес Bot API: если с сервера Telegram недоступен напрямую, можно указать свой прокси-адрес.
const TG_API = (process.env.TG_API_BASE ?? 'https://api.telegram.org').replace(/\/$/, '');
// На части VPS нет рабочего IPv6, а fetch пробует его первым и падает с «fetch failed». Ходим по IPv4.
const direct = new https.Agent({ keepAlive: true, family: 4 });

/**
 * Прокси до Telegram (VPN на сервере): http://host:port или socks5://host:port.
 * Берём TG_PROXY, потом HTTPS_PROXY/ALL_PROXY, потом файл .tg-proxy рядом с сервером.
 */
export function proxyAgent(url: string): https.Agent {
  const u = new URL(url);
  const host = u.hostname;
  const port = Number(u.port || (u.protocol.startsWith('socks') ? 1080 : 8080));
  const agent = new https.Agent({ keepAlive: true });
  // Соединение с прокси, через которое потом идёт TLS до api.telegram.org.
  (agent as unknown as { createConnection: unknown }).createConnection = (opts: { host: string; port: number; servername?: string }, cb: (err: Error | null, sock?: tls.TLSSocket) => void) => {
    const sock = net.connect(port, host);
    const fail = (e: Error) => cb(e);
    sock.once('error', fail);
    const ready = () => {
      sock.removeListener('error', fail);
      cb(null, tls.connect({ socket: sock, servername: opts.servername ?? opts.host }));
    };
    let buf = Buffer.alloc(0);
    if (u.protocol.startsWith('socks')) {
      let step = 0;
      sock.once('connect', () => sock.write(Buffer.from([5, 1, 0])));
      sock.on('data', function onData(d: Buffer) {
        buf = Buffer.concat([buf, d]);
        if (step === 0 && buf.length >= 2) {
          if (buf[1] !== 0) return fail(new Error('SOCKS: нужен вход без пароля'));
          buf = buf.subarray(2);
          step = 1;
          const name = Buffer.from(opts.host);
          sock.write(Buffer.concat([Buffer.from([5, 1, 0, 3, name.length]), name, Buffer.from([opts.port >> 8, opts.port & 255])]));
        }
        if (step === 1 && buf.length >= 10) {
          sock.removeListener('data', onData);
          if (buf[1] !== 0) return fail(new Error(`SOCKS: отказ ${buf[1]}`));
          ready();
        }
      });
    } else {
      sock.once('connect', () => sock.write(`CONNECT ${opts.host}:${opts.port} HTTP/1.1\r\nHost: ${opts.host}:${opts.port}\r\n\r\n`));
      sock.on('data', function onData(d: Buffer) {
        buf = Buffer.concat([buf, d]);
        const end = buf.indexOf('\r\n\r\n');
        if (end < 0) return;
        sock.removeListener('data', onData);
        const status = /^HTTP\/1\.\d (\d+)/.exec(buf.toString('latin1'))?.[1];
        if (status !== '200') return fail(new Error(`прокси ответил ${status ?? '?'}`));
        ready();
      });
    }
  };
  return agent;
}

const readFile = (f: string) => {
  try {
    return readFileSync(f, 'utf8').trim();
  } catch {
    return '';
  }
};
export const TG_PROXY = process.env.TG_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy || readFile(join(__dirname, '.tg-proxy'));
let agent: https.Agent = TG_PROXY ? proxyAgent(TG_PROXY) : direct;
/** Текущее соединение до внешних API (прямое или через прокси): им же ходим к Claude. */
export const currentAgent = () => agent;
export const useProxy = (url: string | null) => {
  agent = url ? proxyAgent(url) : direct;
  botStatus.proxy = url ? new URL(url).host : null;
};

/** Вызов Bot API. Ошибка сети приходит с кодом (ETIMEDOUT, ECONNREFUSED…), чтобы её было видно в /api/health. */
export const botApi = (token: string) => (method: string, body: unknown, timeoutMs = 65_000) => tgRequest(token, method, Buffer.from(JSON.stringify(body)), 'application/json', timeoutMs);

/** Отправка файла (multipart): Telegram не всегда может сам скачать картинку с нашего сайта. */
export function botUpload(token: string, method: string, fields: Record<string, unknown>, file: { field: string; name: string; type: string; data: Buffer }): Promise<TgReply> {
  return botUploadFiles(token, method, fields, [file]);
}

/** Несколько файлов в одном запросе: альбом (sendMediaGroup) ссылается на них как attach://поле. */
export function botUploadFiles(token: string, method: string, fields: Record<string, unknown>, files: { field: string; name: string; type: string; data: Buffer }[]): Promise<TgReply> {
  const boundary = `----atletia${Date.now().toString(16)}`;
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${typeof v === 'string' ? v : JSON.stringify(v)}\r\n`));
  for (const file of files) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`), file.data, Buffer.from('\r\n'));
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return tgRequest(token, method, Buffer.concat(parts), `multipart/form-data; boundary=${boundary}`, 120_000);
}

function tgRequest(token: string, method: string, data: Buffer, contentType: string, timeoutMs: number): Promise<TgReply> {
  return new Promise<TgReply>((resolve, reject) => {
    const req = https.request(`${TG_API}/bot${token}/${method}`, { method: 'POST', agent, headers: { 'Content-Type': contentType, 'Content-Length': data.length }, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', (e: NodeJS.ErrnoException) => reject(new Error(e.code ? `${e.code} ${e.message}` : e.message)));
    req.end(data);
  });
}

// Состояние бота для /api/health: видно без доступа к логам сервера (без токена).
export const botStatus: { proxy: string | null; polling: boolean; webhook: boolean; webhookAt: number | null; lastOkAt: number | null; lastError: string | null; handled: number } = {
  proxy: TG_PROXY ? new URL(TG_PROXY).host : null,
  polling: false,
  webhook: false,
  webhookAt: null,
  lastOkAt: null,
  lastError: null,
  handled: 0,
};

/** Секрет вебхука: Telegram присылает его в заголовке, так чужие запросы к /api/tg отсекаются. */
export const webhookSecret = (token: string) => createHash('sha256').update(`webhook:${token}`).digest('hex').slice(0, 40);

/** Команды в меню бота. */
export const botCommands = (l: Lang) => [
  { command: 'start', description: tl(l, 'Начать игру') },
  { command: 'help', description: tl(l, 'Помощь и приватность') },
  { command: 'paysupport', description: tl(l, 'Вопрос об оплате') },
];

/** Кнопка меню в чате: общая — «Играть»; англоязычному игроку ставим свою, «Play». */
export const menuButton = (appUrl: string, l: Lang) => ({ type: 'web_app', text: tl(l, 'Играть'), web_app: { url: `${appUrl.replace(/\/$/, '')}/` } });

/** Язык, на котором отвечать написавшему: index.ts знает выбранный в игре, иначе — язык Telegram. */
export type LangOf = (from: TgMessage['from']) => Lang;
export const langOfFrom: LangOf = (from) => langOfCode(from?.language_code);

/**
 * Ответ на обновление из вебхука. Если с сервера Telegram недоступен, ответить можно прямо
 * в теле ответа на вебхук: Telegram сам выполнит этот метод.
 */
export function webhookReply(update: Update, appUrl: string, clanByCode: Parameters<typeof startReply>[2], langOf: LangOf = langOfFrom): Record<string, unknown> | null {
  const msg = update.message;
  if (!msg?.text || msg.chat.type !== 'private') return null;
  const reply = startReply(msg.text, appUrl, clanByCode, langOf(msg.from));
  if (!reply) return null;
  const reply_markup = { inline_keyboard: [[{ text: reply.button, web_app: { url: reply.url } }]] };
  return reply.photo ? { method: 'sendPhoto', chat_id: msg.chat.id, photo: reply.photo, caption: reply.text, reply_markup } : { method: 'sendMessage', chat_id: msg.chat.id, text: reply.text, reply_markup };
}

// Картинка приветствия лежит рядом с сервером; после первой отправки Telegram даёт file_id, дальше шлём его.
let welcomeFileId: string | null = null;
async function sendWelcomePhoto(token: string, chat_id: number, url: string, caption: string, reply_markup: unknown): Promise<TgReply | null> {
  const fields = { chat_id, caption, reply_markup };
  try {
    if (welcomeFileId) {
      const r = await botApi(token)('sendPhoto', { ...fields, photo: welcomeFileId });
      if (r.ok) return r;
    }
    const data = readFileSync(join(__dirname, 'welcome.jpg'));
    const r = await botUpload(token, 'sendPhoto', fields, { field: 'photo', name: 'welcome.jpg', type: 'image/jpeg', data });
    const sizes = (r.result as { photo?: { file_id: string }[] } | undefined)?.photo;
    if (r.ok && sizes?.length) welcomeFileId = sizes[sizes.length - 1].file_id;
    if (!r.ok) botStatus.lastError = `sendPhoto: ${r.description}`;
    return r;
  } catch (e) {
    botStatus.lastError = `sendPhoto: ${e instanceof Error ? e.message : e}`;
    // Файла нет рядом с сервером — пусть Telegram попробует скачать по ссылке.
    return botApi(token)('sendPhoto', { ...fields, photo: url }).catch(() => null);
  }
}

/** Долгий опрос Telegram. onChat — игрок написал боту (например, перезапустил его после остановки). onCommand — свои команды (модерация, канал): вернуть ответ, пустую строку (ответит сам) или null. onUpdate — обновление разобрано целиком (кнопки черновиков). Если включён вебхук (Telegram отвечает 409), опрос останавливается: обновления придут на /api/tg. */
export function runBot(token: string, appUrl: string, clanByCode: Parameters<typeof startReply>[2], onChat?: (chatId: number) => void, onText?: (msg: NonNullable<Update['message']>) => void, onCommand?: (chatId: number, text: string) => string | null, onUpdate?: (u: Update) => boolean, langOf: LangOf = langOfFrom): void {
  const api = botApi(token);
  let offset = 0;
  const loop = async () => {
    // Без языка — для всех (по-русски), с language_code: 'en' — для тех, у кого Telegram по-английски.
    for (const [l, language_code] of [['ru', undefined], ['en', 'en']] as const) {
      await api('setMyDescription', { description: botDescription(l), language_code }).catch(() => null);
      await api('setMyShortDescription', { short_description: botShortDescription(l), language_code }).catch(() => null);
      await api('setMyCommands', { commands: botCommands(l), language_code }).catch(() => null);
    }
    await api('setChatMenuButton', { menu_button: menuButton(appUrl, 'ru') }).catch(() => null);
    for (;;) {
      try {
        const r = await api('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query', 'pre_checkout_query'] });
        if (r.error_code === 409) {
          botStatus.webhook = true;
          botStatus.polling = false;
          return;
        }
        if (!r.ok) throw new Error(`${r.error_code ?? ''} ${r.description ?? ''}`.trim());
        botStatus.polling = true;
        botStatus.lastOkAt = Date.now();
        botStatus.lastError = null;
        for (const u of (r.result as Update[]) ?? []) {
          offset = u.update_id + 1;
          // Кнопки и ответы на черновики постов разбирает index.ts.
          if (onUpdate?.(u)) {
            botStatus.handled++;
            continue;
          }
          const msg = u.message;
          if (!msg?.text || msg.chat.type !== 'private') continue;
          // Игрок написал боту: значит, снова можно ему писать.
          onChat?.(msg.chat.id);
          const own = onCommand?.(msg.chat.id, msg.text);
          // Пустая строка — команда уже обработана (ответ придёт позже).
          if (own != null) {
            botStatus.handled++;
            if (own) await api('sendMessage', { chat_id: msg.chat.id, text: own });
            continue;
          }
          const l = langOf(msg.from);
          const reply = startReply(msg.text, appUrl, clanByCode, l);
          if (reply && l === 'en') await api('setChatMenuButton', { chat_id: msg.chat.id, menu_button: menuButton(appUrl, l) }).catch(() => null);
          // Не команда: это сообщение разработчику.
          if (!reply) {
            onText?.(msg);
            continue;
          }
          const reply_markup = { inline_keyboard: [[{ text: reply.button, web_app: { url: reply.url } }]] };
          const sent = reply.photo ? await sendWelcomePhoto(token, msg.chat.id, reply.photo, reply.text, reply_markup) : null;
          // Картинка не ушла — шлём просто текст.
          botStatus.handled++;
          if (!sent?.ok) await api('sendMessage', { chat_id: msg.chat.id, text: reply.text, reply_markup });
        }
      } catch (e) {
        botStatus.polling = false;
        botStatus.lastError = (e instanceof Error ? e.message : String(e)).replace(token, '***').slice(0, 200);
        console.error('bot:', botStatus.lastError);
        await new Promise((res) => setTimeout(res, 5000));
      }
    }
  };
  void loop();
}
