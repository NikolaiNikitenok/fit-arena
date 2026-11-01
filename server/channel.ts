// Автопостинг в Telegram-канал (@NikitenokArena): два полезных поста в день, 10:00 и 19:00 по Москве.
// Текст пишет Claude по рубрике; приложение упоминается естественно примерно в 1–2 постах из 5.
// Чистая часть (расписание, выбор рубрики, промпт, разбор ответа) проверяется тестами,
// сеть (Claude API, Bot API) — в Channel.run().
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import https from 'node:https';
import Anthropic from '@anthropic-ai/sdk';
import { CHANNEL_MEDIA, mediaCatalogText, type MediaRef, pickMedia, sendWithMedia, type Upload } from './channelMedia';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MSK = 3 * HOUR;
/** Часы выхода постов по Москве. */
export const CHANNEL_HOURS = [10, 19];
// Опоздали больше чем на 3 часа (сервер лежал) — слот пропускаем, чтобы не постить пачкой.
const SLOT_LATE = 3 * HOUR;
export const MODEL = 'claude-opus-5-5';

export type Rubric = 'tip' | 'breakdown' | 'compare' | 'motivation' | 'myth' | 'app' | 'news';

export const RUBRICS: Record<Rubric, string> = {
  tip: 'Совет по тренировке или технике: одна конкретная мысль, которую можно применить сегодня же (дыхание, темп, разминка, восстановление, сон, прогрессия нагрузки).',
  breakdown: 'Разбор одного упражнения: какие мышцы работают, правильная техника по шагам, 2–3 частые ошибки и как их исправить, вариант полегче и посложнее. Упражнения: отжимания и их вариации, приседания и вариации, скручивания и пресс, планка, выпады, берпи, подтягивания, ягодичный мост.',
  compare: 'Сравнение двух упражнений, подходов или методик (например, планка или скручивания, много повторов или вес, утро или вечер, круговая или сплит): честно, с плюсами и минусами, и кому что подходит.',
  motivation: 'Мотивация и привычки без пафоса: как начать и не бросить, что делать, если пропустил, маленькие шаги, серия дней. Опирайся на понятные исследования о привычках, но без занудства.',
  myth: 'Миф или правда: разбери одно популярное заблуждение о тренировках, питании вокруг тренировок или восстановлении, объясни, как на самом деле.',
  app: 'Как работает NikitenokArena: расскажи об одной возможности приложения из списка фактов ниже — что это, зачем и как этим пользоваться. Пиши как автор, который сам этим пользуется, а не как реклама.',
  news: 'Честные новости обновлений NikitenokArena: по списку последних изменений ниже расскажи, что нового появилось для игрока. Выбери 2–4 самых заметных изменения, объясни простыми словами, что изменилось. Не выдумывай того, чего нет в списке; технические мелочи пропусти.',
};
const GENERAL: Rubric[] = ['tip', 'breakdown', 'compare', 'motivation', 'myth'];

/** Факты о приложении: модель рассказывает только о том, что есть на самом деле. */
export const APP_FACTS = `NikitenokArena — Telegram Mini App (бот @ArenaNikitenokBot). Камера телефона считает отжимания, приседания и скручивания (пресс) и засекает планку; проверяется поза, так что «читерские» повторы не засчитываются. Перед первой тренировкой камера калибруется под человека.
- Приключение: три мира (фэнтези, космос, зомби) по 100 уровней, босс каждый 10-й уровень, финальный босс Князь Диван. Каждый повтор бьёт врага. Сила врагов подстраивается под реальную силу игрока.
- Истории и персонажи: наставник Мастер Гром, бабушка Марфа, Лиса и другие. Жизни, серия дней с двумя днями отдыха в неделю, задание дня от персонажа.
- Герой: уровни, оружие и щиты, зелья, питомцы, достижения и титулы, статистика «Твоя сила» с календарём и графиком за 30 дней.
- Дуэли с живыми игроками: кубки, лиги, сезоны по 4 недели, топ-50; спарринг с тренером (Лиса, Гром, Князь Диван).
- Кланы: чат, рейд-босс по выходным, войны кланов, уровни клана.
- Друзья и вызовы, сезонный пропуск, ежемесячный босс-событие.
- Программы тренировок (6 программ), голосовой тренер, напоминания от бота.
- Дневник зала: около 270 упражнений с весами, подходы, рекорды.
- Деревня: повторы дают заряд, им проходят подземелье «три в ряд», добывают ресурсы и строят деревню, есть набеги на деревни других игроков.`;

export interface ChannelPost {
  at: number;
  // Слот: дата и час по Москве, например «2026-10-26 10».
  slot: string;
  // Рубрика: у канала игры — Rubric, у личного канала — свои (server/personalChannel.ts).
  rubric: string;
  topic: string;
  mentionsApp: boolean;
  messageId?: number;
  // Черновик личного канала пропущен (кнопка «Пропустить»): слот занят, но поста нет.
  skipped?: boolean;
  // Последний коммит, о котором уже рассказали (для рубрики новостей).
  commit?: string;
}
export interface ChannelState {
  posts: ChannelPost[];
}

export interface Commit {
  hash: string;
  at: number;
  subject: string;
}

const CHANNEL_WORK = /канал|автопост|channel|админ-клавиатур|меню команд/i;

/** «hash|ISO-дата|тема» по строке — так changelog.txt пишет деплой. */
export function parseChangelog(text: string): Commit[] {
  const out: Commit[] = [];
  for (const line of text.split('\n')) {
    const [hash, date, ...rest] = line.split('|');
    const subject = rest.join('|').trim();
    const at = Date.parse(date ?? '');
    if (!hash?.trim() || !subject || Number.isNaN(at)) continue;
    if (/^merge\b/i.test(subject)) continue;
    // Работа над самими каналами и автопостингом — не новость для читателей.
    if (CHANNEL_WORK.test(subject)) continue;
    out.push({ hash: hash.trim(), at, subject });
  }
  return out;
}

/** Слот, который пора опубликовать сейчас, или null. */
export function dueSlot(now: number, state: ChannelState, hours = CHANNEL_HOURS): string | null {
  const d = new Date(now + MSK);
  const day = d.toISOString().slice(0, 10);
  for (const h of [...hours].reverse()) {
    const at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h) - MSK;
    if (now < at) continue;
    if (now - at > SLOT_LATE) return null;
    const slot = `${day} ${String(h).padStart(2, '0')}`;
    return state.posts.some((p) => p.slot === slot) ? null : slot;
  }
  return null;
}

/** Изменения, о которых ещё не рассказывали. */
export function freshCommits(commits: Commit[], state: ChannelState): Commit[] {
  const told = [...state.posts].reverse().find((p) => p.commit)?.commit;
  const idx = told ? commits.findIndex((c) => c.hash === told) : -1;
  // changelog.txt идёт от новых к старым.
  return idx >= 0 ? commits.slice(0, idx) : commits;
}

/** Что публикуем: рубрика и можно ли упомянуть приложение. */
export function planPost(now: number, state: ChannelState, commits: Commit[]): { rubric: Rubric; mentionsApp: boolean } {
  const posts = state.posts;
  const lastOf = (r: string) => [...posts].reverse().find((p) => p.rubric === r)?.at ?? 0;
  const evening = new Date(now + MSK).getUTCHours() >= 15;
  // Новости — вечером, не чаще раза в 3 дня и только если накопилось хотя бы 3 изменения.
  if (evening && freshCommits(commits, state).length >= 3 && now - lastOf('news') >= 3 * DAY) return { rubric: 'news', mentionsApp: true };
  // Про возможности приложения — раз в неделю.
  if (now - lastOf('app') >= 6.5 * DAY && posts.length >= 2) return { rubric: 'app', mentionsApp: true };
  // Остальные — по кругу, давно не бывшая рубрика первой; две одинаковые подряд не ставим.
  const rubric = [...GENERAL].sort((a, b) => lastOf(a) - lastOf(b) || GENERAL.indexOf(a) - GENERAL.indexOf(b))[0];
  // Упоминание в обычном посте — только если в последних 4 его не было: в сумме выходит 1–2 из 5.
  const mentionsApp = !posts.slice(-4).some((p) => p.mentionsApp);
  return { rubric, mentionsApp };
}

export const SYSTEM_PROMPT = `Ты ведёшь Telegram-канал NikitenokArena о домашних тренировках с весом тела: отжимания, приседания, пресс, планка и всё вокруг них. Читатели — обычные люди, от новичков до любителей, тренируются дома и иногда в зале.

Как писать:
- По-русски, живо и по делу, на «ты». Польза в каждом абзаце, без воды и канцелярита.
- Честно: никаких чудо-обещаний («кубики за неделю»), никаких медицинских диагнозов. Если тема касается боли или травм — советуй обратиться к врачу.
- Это не реклама. Не используй призывы «скачай», «жми», «успей», не хвали приложение превосходными степенями.
- Длина 600–950 знаков (пост может уйти подписью к картинке, а там предел 1024). Короткие абзацы, можно список из 3–5 пунктов.
- Оформление — HTML-теги Telegram: <b>жирный</b> для заголовка и ключевых мыслей, <i>курсив</i> для акцентов и терминов, <blockquote>цитата</blockquote> для главного вывода, правила или короткой цитаты (одна на пост), <u>подчёркнутый</u> и <tg-spoiler>спойлер</tg-spoiler> — изредка, например для ответа в «миф или правда». Заголовок — первая строка в <b>…</b>. Оформляй умеренно: 2–4 выделения на пост, не каждое предложение.
- Эмодзи: 3–5 на пост, по смыслу — в начале заголовка и пунктов списка (например, 💪 🔥 ✅ ❌ 💡 ⚡), не в каждой строке.
- Никакого Markdown (звёздочек, решёток), других тегов и хэштегов.
- Не повторяй темы из списка уже опубликованных; бери новый угол или новое упражнение.`;

export function userPrompt(o: { now: number; rubric: Rubric; mentionsApp: boolean; recent: ChannelPost[]; commits: Commit[] }): string {
  const date = new Date(o.now + MSK).toISOString().slice(0, 10);
  const lines = [`Сегодня ${date}.`, '', `Рубрика: ${RUBRICS[o.rubric]}`, ''];
  if (o.rubric === 'news') {
    lines.push('Последние изменения (тема коммита, от новых к старым):', ...o.commits.slice(0, 40).map((c) => `- ${new Date(c.at + MSK).toISOString().slice(0, 10)}: ${c.subject}`), '');
  }
  if (o.rubric === 'app' || o.rubric === 'news' || o.mentionsApp) lines.push('Факты о приложении (ничего сверх них не придумывай):', APP_FACTS, '');
  if (o.rubric !== 'app' && o.rubric !== 'news')
    lines.push(
      o.mentionsApp
        ? 'В этом посте можно один раз естественно упомянуть NikitenokArena, если это к месту (например, что камера в приложении следит за глубиной приседа). Одно предложение в конце или по ходу, без призывов. Если к месту не выходит — не упоминай.'
        : 'В этом посте приложение не упоминай вовсе.',
      '',
    );
  lines.push(o.recent.length ? `Уже опубликованные темы (не повторяй):\n${o.recent.map((p) => `- ${p.topic}`).join('\n')}` : 'Это один из первых постов канала.');
  const aboutApp = o.rubric === 'app' || o.rubric === 'news' || o.mentionsApp;
  lines.push(
    '',
    aboutApp
      ? 'Ссылка: там, где речь о приложении, можно один раз сделать ссылку на игру — <a href="https://t.me/ArenaNikitenokBot?start=src-channel">@ArenaNikitenokBot</a> (бот игры, метка src-channel — по ней статистика считает пришедших из канала). Других ссылок не ставь.'
      : 'Ссылок в этом посте не ставь.',
  );
  lines.push('', imagesHint(aboutApp));
  lines.push('', JSON_HINT);
  return lines.join('\n');
}

export const JSON_HINT = 'Верни JSON: topic — тема поста в 3–8 словах (для списка опубликованного), text — готовый текст поста, mentions_app — упомянуто ли приложение, images — имена 0–2 скриншотов из списка (или пустой список).';

/** Подсказка про скриншоты: к постам о приложении — 1–2 подходящих, к остальным — никаких. */
export const imagesHint = (aboutApp: boolean): string =>
  aboutApp
    ? `К посту можно приложить 1–2 скриншота приложения, если они прямо показывают то, о чём пост. Доступные скриншоты (имя — что на нём):\n${mediaCatalogText()}`
    : 'Скриншоты к этому посту не нужны: images — пустой список.';

// Теги HTML, которые понимает Telegram и которые разрешаем в постах.
const TAGS = 'b|i|u|s|code|blockquote|tg-spoiler';
const ALLOWED_TAG = new RegExp(`^</?(?:${TAGS})>$`);
const LINK_OPEN = /^<a href="([^"<>]+)">$/;
// Ссылки — только на свои места: модель не выдумает адрес, а чужой адрес из ответа не попадёт в канал.
const LINK_HOSTS = ['t.me', 'arena.nikitenok.ru'];
export const safeLink = (href: string): boolean => {
  try {
    const u = new URL(href);
    return u.protocol === 'https:' && LINK_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
};
/**
 * Своя метка у каждого поста: ссылка на бота src-channel → src-ch-РУБРИКА (src-threads → src-th-РУБРИКА).
 * Статистика (/api/admin/stats, «Контент») показывает по рубрикам, кто пришёл и остался, а не лайки.
 */
export function tagLinks(text: string, from: string, tag: string): string {
  const clean = tag.replace(/[^\w-]/g, '').slice(0, 24);
  return text.split(`start=src-${from}`).join(`start=src-${clean}`);
}

/** Ссылки, которые можно ставить в посты: подсказка для промпта. */
export const LINKS_HINT = `Ссылки: можно 0–1 ссылку на пост, только если она к месту, тегом <a href="адрес">текст</a>, и только эти адреса:
- https://t.me/NikitenokArena — канал NikitenokArena
- https://t.me/ArenaNikitenokBot?start=src-channel — бот игры NikitenokArena (через него открывается игра; метка src-channel нужна статистике)
Другие адреса не используй.`;
/** Чистим текст под HTML Telegram: экранируем всё, кроме разрешённых тегов и своих ссылок, и ограничиваем длину. */
export function telegramHtml(text: string): string {
  const parts = text.trim().split(new RegExp(`(</?(?:${TAGS})>|<a href="[^"<>]*">|</a>)`, 'g'));
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Ссылку с чужим адресом убираем, текст внутри оставляем.
  let link = 'none' as 'none' | 'kept' | 'dropped';
  let html = parts
    .map((p) => {
      if (ALLOWED_TAG.test(p)) return p;
      const a = LINK_OPEN.exec(p);
      if (a && link === 'none') return safeLink(a[1]) ? ((link = 'kept'), `<a href="${a[1].replace(/&(?!amp;)/g, '&amp;')}">`) : ((link = 'dropped'), '');
      if (p === '</a>' && link !== 'none') {
        const close = link === 'kept' ? '</a>' : '';
        link = 'none';
        return close;
      }
      return esc(p);
    })
    .join('');
  if (link === 'kept') html += '</a>';
  // Пост в канале — до 4096 знаков; длиннее режем по абзацу.
  if (html.length > 3800) html = html.slice(0, html.lastIndexOf('\n\n', 3800)).trim();
  return html;
}
export const plainText = (html: string) =>
  html
    .replace(new RegExp(`</?(?:${TAGS})>|<a href="[^"]*">|</a>`, 'g'), '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** JSON из ответа модели: берём от первой { до последней }, даже если вокруг есть текст. */
export type Written = { topic?: string; text?: string; mentions_app?: boolean; images?: unknown };
export function parseJson(text: string): Written {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Claude ответил не JSON');
  return JSON.parse(text.slice(a, b + 1));
}

export interface Draft {
  rubric: string;
  topic: string;
  text: string;
  mentionsApp: boolean;
  commit?: string;
  media: MediaRef[];
}

/** fetch через https.Agent (прокси SOCKS/HTTP из bot.ts): Anthropic, как и Telegram, может быть недоступен с сервера напрямую. */
export function agentFetch(agent: () => https.Agent): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
      const req = https.request(url, { method: init?.method ?? 'GET', headers, agent: agent(), timeout: 180_000 }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const h = new Headers();
          for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) h.set(k, Array.isArray(v) ? v.join(', ') : v);
          resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 500, headers: h }));
        });
        res.on('error', reject);
      });
      init?.signal?.addEventListener('abort', () => req.destroy(new Error('aborted')));
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      req.end(typeof init?.body === 'string' ? init.body : init?.body ? Buffer.from(init.body as ArrayBuffer) : undefined);
    })) as typeof fetch;
}

export interface ChannelDeps {
  apiKey: () => string;
  // Токен подписки из `claude setup-token`: если есть, пишем через Claude Code, ключ API — запасной путь.
  claudeToken?: () => string;
  // Запуск Claude Code (server/claudeCode.ts): системный промпт и запрос → текст ответа.
  claudeCode?: (system: string, prompt: string) => Promise<string>;
  channel: string;
  agent: () => https.Agent;
  changelog: () => string;
  // Отправка в Bot API; возвращает ответ Telegram.
  bot: (method: string, body: unknown) => Promise<{ ok: boolean; result?: unknown; description?: string }>;
  // Ссылка на бота для кнопки под постом; tag — метка рубрики (ch-РУБРИКА).
  appLink: (tag?: string) => string;
  // Загрузка картинок (multipart) и папка со скриншотами.
  upload?: Upload;
  mediaDir?: string;
  log?: (msg: string) => void;
  // Для тестов: свой fetch вместо https через прокси.
  fetch?: typeof fetch;
}

/** Подписка через Claude Code, если есть токен; не вышло — API-ключ, если он есть. */
export async function writePost(d: ChannelDeps, system: string, prompt: string): Promise<Written> {
  const errors: string[] = [];
  if (d.claudeToken?.() && d.claudeCode) {
    try {
      const text = await d.claudeCode(system, `${prompt}\n\nОтветь только JSON-объектом, без пояснений и без \`\`\`.`);
      return parseJson(text);
    } catch (e) {
      errors.push((e as Error).message);
      if (!d.apiKey()) throw e;
    }
  }
  if (!d.apiKey()) throw new Error('нет ни токена подписки, ни ключа API');
  const client = new Anthropic({ apiKey: d.apiKey(), fetch: d.fetch ?? agentFetch(d.agent), maxRetries: 2 });
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: 'medium',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: { topic: { type: 'string' }, text: { type: 'string' }, mentions_app: { type: 'boolean' }, images: { type: 'array', items: { type: 'string' } } },
          required: ['topic', 'text', 'mentions_app', 'images'],
          additionalProperties: false,
        },
      },
    },
    system,
    messages: [{ role: 'user', content: prompt }],
  } as Anthropic.Beta.MessageCreateParamsNonStreaming);
  if (res.stop_reason === 'refusal') throw new Error('Claude отказался писать пост');
  if (res.stop_reason === 'max_tokens') throw new Error('Claude не уложился в лимит');
  const block = res.content.find((b) => b.type === 'text');
  if (errors.length) d.log?.(`channel: подписка не сработала (${errors[0]}), пост написан через API`);
  return parseJson(block && block.type === 'text' ? block.text : '');
}

/** Пост в чат: с картинками или текстом. Если HTML не прошёл — шлём простым текстом. */
export async function sendPost(d: ChannelDeps, chatId: string | number, draft: Draft, reply_markup?: unknown): Promise<number | undefined> {
  if (draft.media.length && d.upload && d.mediaDir) {
    const r = await sendWithMedia({ bot: d.bot, upload: d.upload, dir: d.mediaDir, chatId, html: draft.text, plain: plainText(draft.text), media: draft.media, replyMarkup: reply_markup });
    if (r.ok) return r.messageId;
    d.log?.(`channel: картинки не ушли (${r.description}), шлю текстом`);
  }
  let r = await d.bot('sendMessage', { chat_id: chatId, text: draft.text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup });
  if (!r.ok && /parse|entit/i.test(r.description ?? '')) r = await d.bot('sendMessage', { chat_id: chatId, text: plainText(draft.text), link_preview_options: { is_disabled: true }, reply_markup });
  if (!r.ok) throw new Error(`Telegram: ${r.description ?? 'ошибка'}`);
  return (r.result as { message_id?: number } | undefined)?.message_id;
}

export class Channel {
  state: ChannelState = { posts: [] };
  busy = false;
  lastError: string | null = null;
  private tries = new Map<string, number>();
  private nextTry = 0;

  constructor(
    private file: string | null,
    private d: ChannelDeps,
  ) {
    if (!file) return;
    try {
      this.state = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      /* первый запуск */
    }
  }

  private save(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.state));
    renameSync(`${this.file}.tmp`, this.file);
  }

  status(): string {
    const last = this.state.posts.at(-1);
    return [
      `Канал: ${this.d.channel}, подписка Claude: ${this.d.claudeToken?.() ? 'есть' : 'нет'}, ключ API: ${this.d.apiKey() ? 'есть' : 'нет'}`,
      `Постов: ${this.state.posts.length}${last ? `, последний ${new Date(last.at + MSK).toISOString().slice(0, 16).replace('T', ' ')} МСК — ${last.rubric}: ${last.topic}` : ''}`,
      this.lastError ? `Последняя ошибка: ${this.lastError}` : 'Ошибок нет',
      'Команды: /channel_draft — черновик тебе, /channel_post — опубликовать сейчас',
    ].join('\n');
  }

  /** Раз в минуту из index.ts: публикуем, если наступил слот. До трёх попыток с паузой 10 минут. */
  tick(now = Date.now()): void {
    if (this.busy || now < this.nextTry || !(this.d.apiKey() || this.d.claudeToken?.())) return;
    const slot = dueSlot(now, this.state);
    if (!slot || (this.tries.get(slot) ?? 0) >= 3) return;
    this.tries.set(slot, (this.tries.get(slot) ?? 0) + 1);
    this.publish(slot, now).catch((e: Error) => {
      this.lastError = e.message;
      this.nextTry = Date.now() + 10 * 60_000;
      this.d.log?.(`channel: ${e.message}`);
    });
  }

  async draft(now = Date.now()): Promise<Draft> {
    const commits = parseChangelog(this.d.changelog());
    const plan = planPost(now, this.state, commits);
    const fresh = freshCommits(commits, this.state);
    const prompt = userPrompt({ now, ...plan, recent: this.state.posts.slice(-60), commits: fresh });
    const out = await writePost(this.d, SYSTEM_PROMPT, prompt);
    if (!out.text || !out.topic) throw new Error('пустой ответ Claude');
    const aboutApp = plan.rubric === 'app' || plan.rubric === 'news' || (plan.mentionsApp && !!out.mentions_app);
    return {
      rubric: plan.rubric,
      topic: out.topic.slice(0, 120),
      text: tagLinks(telegramHtml(out.text), 'channel', `ch-${plan.rubric}`),
      mentionsApp: plan.mentionsApp && !!out.mentions_app,
      commit: plan.rubric === 'news' ? commits[0]?.hash : undefined,
      media: aboutApp && this.d.upload && this.d.mediaDir ? pickMedia(out.images).slice(0, 2).map((file) => ({ file })) : [],
    };
  }

  /** Отправка поста в чат (канал или админу для проверки). Если HTML не прошёл — шлём простым текстом. */
  async send(chatId: string | number, draft: Draft): Promise<number | undefined> {
    const reply_markup = draft.mentionsApp ? { inline_keyboard: [[{ text: '🤖 Бот NikitenokArena', url: this.d.appLink(`ch-${draft.rubric}`) }]] } : undefined;
    return sendPost(this.d, chatId, draft, reply_markup);
  }

  async publish(slot: string, now = Date.now()): Promise<ChannelPost> {
    this.busy = true;
    try {
      const draft = await this.draft(now);
      const messageId = await this.send(this.d.channel, draft);
      const post: ChannelPost = { at: Date.now(), slot, rubric: draft.rubric, topic: draft.topic, mentionsApp: draft.mentionsApp, messageId, commit: draft.commit };
      this.state.posts.push(post);
      this.state.posts = this.state.posts.slice(-300);
      this.save();
      this.lastError = null;
      return post;
    } finally {
      this.busy = false;
    }
  }

  /** Команды админа в личке бота. Ответ приходит позже, поэтому сообщаем через reply. */
  command(chatId: number, text: string, reply: (t: string) => void): boolean {
    const t = text.trim();
    if (/^\/channel_draft\b/.test(t)) {
      reply('Пишу черновик, это займёт до минуты…');
      this.draft()
        .then((d) => this.send(chatId, d).then(() => reply(`Рубрика: ${d.rubric}, тема: ${d.topic}. В канал не ушло.`)))
        .catch((e: Error) => reply(`Не вышло: ${e.message}`));
      return true;
    }
    if (/^\/channel_post\b/.test(t)) {
      if (this.busy) return reply('Пост уже готовится.'), true;
      reply('Пишу и публикую пост…');
      this.publish(`ручной ${new Date().toISOString()}`)
        .then((p) => reply(`Опубликовано: ${p.rubric}, «${p.topic}».`))
        .catch((e: Error) => reply(`Не вышло: ${(this.lastError = e.message)}`));
      return true;
    }
    if (/^\/channel\b/.test(t)) return reply(this.status()), true;
    return false;
  }
}
