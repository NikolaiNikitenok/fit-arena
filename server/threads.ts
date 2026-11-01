// Посты в Threads (Meta) для аккаунта игры NikitenokArena: голос игры, а посты о создании игры — от первого лица автора.
// Claude пишет короткий пост (до 500 знаков — предел Threads), бот присылает его админу с кнопками
// «Опубликовать в Threads», «Другой вариант», «Пропустить». Ответом на черновик можно прислать свой текст.
// Режим «авто» (/threads_auto on) публикует сам, без вопросов, два раза в день.
// Публикация — через Threads API (graph.threads.net) с токеном из секрета THREADS_TOKEN (→ .threads-token);
// сервер сам продлевает токен раз в неделю (живёт 60 дней) и хранит продлённый в data/threads.json.
// Пока токена нет, черновики всё равно приходят — их можно выложить руками.
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { type ChannelDeps, type ChannelPost, type ChannelState, type Commit, type Draft, dueSlot, imagesHint, parseChangelog, sendPost, tagLinks, writePost } from './channel';
import { pickMedia } from './channelMedia';
import type { Update } from './bot';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MSK = 3 * HOUR;
// С вопросом — один черновик в день, в авто — два поста.
export const THREADS_ASK_HOURS = [12];
export const THREADS_AUTO_HOURS = [12, 19];
export const THREADS_LIMIT = 500;
const API = 'https://graph.threads.net/v1.0';
export const APP_LINK = 'https://t.me/ArenaNikitenokBot?start=src-threads';

export type ThreadsRubric = 'question' | 'hot' | 'challenge' | 'tip' | 'myth' | 'build' | 'author' | 'app';
export const THREADS_RUBRICS: Record<ThreadsRubric, string> = {
  question: 'Вопрос к читателям про тренировки, чтобы захотелось ответить: короткая личная подводка (1–2 фразы) и простой вопрос, на который у каждого есть ответ («сколько отжиманий вы делаете за раз?», «что вас бросает тренироваться?»).',
  hot: 'Спорное, но честное мнение про домашние тренировки или фитнес-привычки — то, с чем часть людей не согласится. Без вреда для здоровья и без оскорблений. Коротко аргументируй и спроси, согласны ли.',
  challenge: 'Мини-челлендж на сегодня: одно простое упражнение с весом тела и понятная цель (например, максимум отжиманий за минуту или планка до отказа). Позови отписаться результатом в ответах.',
  tip: 'Один практичный совет по технике или привычке (отжимания, приседания, пресс, планка): что делать и почему. Конкретно, без воды.',
  myth: 'Популярный миф о тренировках и как на самом деле — коротко и с объяснением, без запугивания.',
  build: 'Пишет автор: что сегодня поменялось в NikitenokArena (по списку изменений ниже), что было сложно или смешно, какое решение пришлось принять. Можно спросить мнения читателей. Только факты из списка.',
  author: 'Пишет автор: «я создал игру» — одна история о создании NikitenokArena: зачем вообще делать фитнес-игру, как научить камеру считать отжимания и отличать честный повтор от читерского, почему каждый повтор бьёт врага, как один человек делает игру с героями, кланами и деревней. Только то, что есть в фактах об игре, без выдуманных случаев и цифр.',
  app: 'Про NikitenokArena: одна фишка игры и зачем она — как камера считает повторы, дуэли, рейды клана, деревня, приключение. Говори как автор, а не как реклама. В конце — ссылка на бота.',
};
// Тема Threads (topic_tag) по рубрике, если Claude не предложил свою.
const DEFAULT_TAG: Record<ThreadsRubric, string> = {
  question: 'Тренировки дома',
  hot: 'Фитнес',
  challenge: 'Челлендж',
  tip: 'Тренировки дома',
  myth: 'Фитнес',
  build: 'Разработка игр',
  author: 'Разработка игр',
  app: 'Фитнес',
};
// Круг рубрик: о приложении — 2 поста из 10, от автора — 1–2, остальное — польза и разговоры.
const CYCLE: ThreadsRubric[] = ['question', 'tip', 'app', 'hot', 'challenge', 'author', 'myth', 'build', 'question', 'app'];

export const APP_FACTS_SHORT = `NikitenokArena — Telegram Mini App (бот @ArenaNikitenokBot). Камера телефона считает отжимания, приседания и пресс и засекает планку, проверяет позу — читерские повторы не засчитываются. Каждый повтор бьёт врага: приключение «Атлетия» (3 мира по 100 уровней с боссами), дуэли с живыми соперниками и лиги, кланы с рейдом выходного дня и войнами кланов, своя деревня, питомцы, сезонный пропуск, дневник зала. Бесплатно, работает прямо в Telegram.`;

export const THREADS_SYSTEM = `Ты пишешь посты для аккаунта NikitenokArena в Threads. NikitenokArena — фитнес-игра в Telegram, где камера считает отжимания, приседания и пресс, а каждый повтор бьёт врага.

Голос: по умолчанию пишет сама игра — «мы» или безлично, живо, по-человечески, с лёгкой иронией, как друг, который любит тренировки (не корпоративно и не рекламно). В рубриках, где сказано «пишет автор», пишет от первого лица Николай Никитёнок, создатель игры: «я сделал», «я понял» — так, будто автор зашёл в аккаунт своей игры. Threads — это разговор, а не реклама.

Правила:
- По-русски. Длина 150–450 знаков, жёсткий предел — ${THREADS_LIMIT} знаков вместе со ссылкой. 1–3 коротких абзаца.
- Первая строка цепляет: мысль, вопрос или неожиданный факт — без заголовков и без «Привет, друзья».
- Часто заканчивай вопросом к читателям, чтобы хотелось ответить.
- Только правда: не придумывай событий из жизни автора, цифр, отзывов и планов. Чего нет в данных — не пиши.
- Простой текст: никакого HTML и Markdown (звёздочек, решёток), без хэштегов. Эмодзи — 0–2 на пост.
- Название игры пиши только так: NikitenokArena.
- Ссылка — только в постах про игру и от автора, одна, в самом конце: ${APP_LINK}
- Не повторяй темы из списка уже опубликованных.
- Никогда не пиши о том, как ведётся аккаунт: что посты пишутся автоматически, что их пишет ИИ, про ботов для постинга.

Факты об игре (для постов про неё):
${APP_FACTS_SHORT}`;

export const THREADS_JSON = 'Верни JSON: topic — тема поста в 3–8 словах (для списка опубликованного), text — готовый текст поста, mentions_app — упомянута ли игра, images — имя 0–1 скриншота из списка (или пустой список), tag — тема Threads для поста: 1–3 слова без решётки (например «Тренировки дома», «Фитнес», «Разработка игр»).';

/** Рубрика по кругу; «сделал сегодня» — только если в игре что-то поменялось за сутки, иначе следующая. */
export function planThreads(state: ChannelState, commits: Commit[], now: number): ThreadsRubric {
  const done = state.posts.filter((p) => !p.skipped).length;
  for (let i = 0; i < CYCLE.length; i++) {
    const r = CYCLE[(done + i) % CYCLE.length];
    if (r === 'build' && !commits.some((c) => now - c.at < DAY)) continue;
    return r;
  }
  return 'tip';
}

export function threadsPrompt(o: { now: number; rubric: ThreadsRubric; recent: ChannelPost[]; commits: Commit[]; idea?: string }): string {
  const date = new Date(o.now + MSK).toISOString().slice(0, 10);
  const lines = [`Сегодня ${date}.`, ''];
  if (o.idea) lines.push(`Тема от автора: «${o.idea}». Пиши именно об этом; если это событие из жизни — опирайся только на сказанное. Голос выбери по теме: если речь о создании игры или о самом авторе — от первого лица автора, иначе — голосом игры.`, '');
  else lines.push(`Рубрика: ${THREADS_RUBRICS[o.rubric]}`, '');
  if (o.rubric === 'build' || o.idea) {
    const fresh = o.commits.filter((c) => o.now - c.at < 3 * DAY).slice(0, 25);
    if (fresh.length) lines.push('Изменения в игре за последние дни (от новых к старым):', ...fresh.map((c) => `- ${c.subject}`), '');
  }
  lines.push(o.recent.length ? `Уже опубликованные темы (не повторяй):\n${o.recent.map((p) => `- ${p.topic}`).join('\n')}` : 'Это один из первых постов.');
  lines.push('', imagesHint(o.rubric === 'app' || o.rubric === 'build' || o.rubric === 'author' || !!o.idea), '', THREADS_JSON);
  return lines.join('\n');
}

/** Чистим ответ модели под Threads: без HTML/Markdown, ссылки — только на бота, не длиннее 500 знаков. */
export function threadsText(raw: string): string {
  let t = raw
    .replace(/<\/?[a-z-]+[^>]*>/gi, '')
    .replace(/\*\*|__|^#+\s*/gm, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // Чужие ссылки убираем: в пост попадает только своя.
  t = t.replace(/https?:\/\/\S+/g, (u) => (u.startsWith('https://t.me/ArenaNikitenokBot') || u.startsWith('https://arena.nikitenok.ru') ? u : '')).replace(/[ \t]+\n/g, '\n').trim();
  if ([...t].length <= THREADS_LIMIT) return t;
  // Длинный — режем по последнему концу предложения, ссылку в конце сохраняем.
  const link = /(\n*)(https:\/\/\S+)$/.exec(t);
  const body = link ? t.slice(0, link.index).trim() : t;
  const room = THREADS_LIMIT - (link ? link[2].length + 2 : 0);
  const cut = [...body].slice(0, room).join('');
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('\n'));
  const short = (end > room * 0.5 ? cut.slice(0, end + 1) : cut).trim();
  return link ? `${short}\n\n${link[2]}` : short;
}

export const threadsTag = (raw: unknown, rubric: ThreadsRubric): string => {
  const t = typeof raw === 'string' ? raw.replace(/[#.&]/g, '').replace(/\s+/g, ' ').trim() : '';
  return t && t.length <= 50 ? t : DEFAULT_TAG[rubric];
};

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// --- Threads API ---

type ApiFetch = typeof fetch;
async function call(f: ApiFetch, method: 'GET' | 'POST', path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams(params);
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const res = method === 'GET' ? await f(`${url}?${qs}`) : await f(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: qs.toString() });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok || body.error) throw new Error(`Threads: ${body.error?.message ?? `HTTP ${res.status}`}`);
  return body;
}

/**
 * Публикация: контейнер → ждём, пока Threads его обработает → публикуем → берём ссылку.
 * Если Threads не принял тему (topic_tag) — пробуем ещё раз без неё.
 */
export async function threadsPublish(
  f: ApiFetch,
  token: string,
  post: { text: string; imageUrl?: string; tag?: string },
  wait = (ms: number) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ id: string; permalink?: string }> {
  const base: Record<string, string> = { access_token: token, text: post.text, media_type: post.imageUrl ? 'IMAGE' : 'TEXT' };
  if (post.imageUrl) base.image_url = post.imageUrl;
  let created: Record<string, unknown>;
  try {
    created = await call(f, 'POST', '/me/threads', post.tag ? { ...base, topic_tag: post.tag } : base);
  } catch (e) {
    if (!post.tag || !/topic|tag|param/i.test((e as Error).message)) throw e;
    created = await call(f, 'POST', '/me/threads', base);
  }
  const creation = String(created.id ?? '');
  if (!creation) throw new Error('Threads не вернул id черновика');
  // Картинку Threads скачивает и проверяет: ждём статус FINISHED (обычно до 30 секунд).
  for (let i = 0; i < 20; i++) {
    const s = await call(f, 'GET', `/${creation}`, { fields: 'status,error_message', access_token: token }).catch(() => ({}) as Record<string, unknown>);
    if (s.status === 'FINISHED' || s.status === undefined) break;
    if (s.status === 'ERROR' || s.status === 'EXPIRED') throw new Error(`Threads не принял пост: ${s.error_message ?? s.status}`);
    await wait(post.imageUrl ? 5000 : 2000);
  }
  const published = await call(f, 'POST', '/me/threads_publish', { creation_id: creation, access_token: token });
  const id = String(published.id ?? '');
  const info = await call(f, 'GET', `/${id}`, { fields: 'permalink', access_token: token }).catch(() => ({}) as Record<string, unknown>);
  return { id, permalink: typeof info.permalink === 'string' ? info.permalink : undefined };
}

/** Продление долгого токена: ещё 60 дней. Работает, если токену больше суток и он не истёк. */
export async function threadsRefresh(f: ApiFetch, token: string): Promise<{ token: string; expiresIn: number }> {
  const r = await call(f, 'GET', 'https://graph.threads.net/refresh_access_token', { grant_type: 'th_refresh_token', access_token: token });
  if (typeof r.access_token !== 'string') throw new Error('Threads не продлил токен');
  return { token: r.access_token, expiresIn: Number(r.expires_in ?? 0) };
}

// --- Черновики и публикация ---

interface ThreadsDraft extends Draft {
  plain: string;
  tag: string;
}
interface Pending {
  id: string;
  slot: string;
  draft: ThreadsDraft;
  controls: { chatId: number; messageId: number }[];
  previews: number[];
  at: number;
  idea?: string;
}
interface ThreadsState extends ChannelState {
  pending?: Pending | null;
  auto?: boolean;
  // Продлённый токен и отпечаток токена из секрета, от которого он продлён: новый секрет важнее.
  token?: string;
  base?: string;
  refreshedAt?: number;
  expiresAt?: number;
}

export interface ThreadsDeps extends ChannelDeps {
  approvers: () => number[];
  // Токен из секрета (файл .threads-token).
  threadsToken: () => string;
  // fetch до graph.threads.net (через прокси сервера).
  threadsFetch: ApiFetch;
  // Публичный адрес картинки из библиотеки: её скачивает сам Threads.
  mediaUrl: (name: string) => string;
  ignoreText?: (text: string) => boolean;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

export class Threads {
  state: ThreadsState = { posts: [] };
  busy = false;
  lastError: string | null = null;
  private tries = new Map<string, number>();

  constructor(
    private file: string | null,
    private d: ThreadsDeps,
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
    // В файле может лежать токен Threads — читать его может только сервер.
    chmodSync(`${this.file}.tmp`, 0o600);
    renameSync(`${this.file}.tmp`, this.file);
  }

  /** Текущий токен: продлённый, если он продлён от того же секрета; иначе — сам секрет. */
  token(): string {
    const file = this.d.threadsToken();
    if (this.state.token && (!file || this.state.base === sha(file))) return this.state.token;
    return file;
  }

  status(): string {
    const last = [...this.state.posts].reverse().find((p) => !p.skipped);
    const days = this.state.expiresAt ? Math.round((this.state.expiresAt - Date.now()) / DAY) : null;
    return [
      `Threads: ${this.token() ? `подключён${days !== null ? `, токен ещё ${days} дн.` : ''}` : 'не подключён (нет секрета THREADS_TOKEN) — черновики приходят, выкладывать руками'}`,
      this.state.auto ? `Режим: авто, посты в ${THREADS_AUTO_HOURS.map((h) => `${h}:00`).join(' и ')} МСК` : `Режим: черновик в ${THREADS_ASK_HOURS.map((h) => `${h}:00`).join(', ')} МСК, публикация по кнопке`,
      `Постов: ${this.state.posts.filter((p) => !p.skipped).length}${last ? `, последний — ${last.topic}` : ''}${this.state.pending ? '. Черновик ждёт решения' : ''}`,
      this.lastError ? `Последняя ошибка: ${this.lastError}` : 'Ошибок нет',
      'Команды: /threads — черновик сейчас, /threads тема — черновик на тему, /threads_auto on|off',
    ].join('\n');
  }

  tick(now = Date.now()): void {
    const p = this.state.pending;
    if (p && now - p.at > DAY) {
      this.state.pending = null;
      this.save();
    }
    void this.maybeRefresh(now);
    if (this.busy || this.state.pending || !(this.d.apiKey() || this.d.claudeToken?.()) || !this.d.approvers().length) return;
    const auto = !!this.state.auto && !!this.token();
    const slot = dueSlot(now, this.state, auto ? THREADS_AUTO_HOURS : THREADS_ASK_HOURS);
    if (!slot || (this.tries.get(slot) ?? 0) >= 3) return;
    this.tries.set(slot, (this.tries.get(slot) ?? 0) + 1);
    this.busy = true;
    (auto ? this.autoPost(slot, now) : this.propose(slot, now))
      .catch((e: Error) => {
        this.lastError = e.message;
        this.d.log?.(`threads: ${e.message}`);
      })
      .finally(() => (this.busy = false));
  }

  /** Раз в неделю продлеваем токен (живёт 60 дней), чтобы он не истёк. */
  private refreshing = false;
  async maybeRefresh(now = Date.now()): Promise<void> {
    const token = this.token();
    if (!token || this.refreshing || (this.state.refreshedAt && now - this.state.refreshedAt < 7 * DAY)) return;
    this.refreshing = true;
    let ok = false;
    try {
      const r = await threadsRefresh(this.d.threadsFetch, token);
      const file = this.d.threadsToken();
      this.state.token = r.token;
      this.state.base = file ? sha(file) : this.state.base;
      this.state.expiresAt = r.expiresIn ? now + r.expiresIn * 1000 : undefined;
      ok = true;
    } catch (e) {
      this.d.log?.(`threads refresh: ${(e as Error).message}`);
    } finally {
      // Не вышло (токену меньше суток и т. п.) — повторим завтра, а не каждую минуту.
      this.state.refreshedAt = ok ? now : now - 6 * DAY;
      this.refreshing = false;
      this.save();
    }
  }

  async draft(now = Date.now(), idea?: string): Promise<ThreadsDraft> {
    const commits = parseChangelog(this.d.changelog());
    const rubric: ThreadsRubric = idea ? 'question' : planThreads(this.state, commits, now);
    const prompt = threadsPrompt({ now, rubric, recent: this.state.posts.filter((p) => !p.skipped).slice(-60), commits, idea });
    const out = await writePost(this.d, THREADS_SYSTEM, prompt);
    if (!out.text || !out.topic) throw new Error('пустой ответ Claude');
    // Метка рубрики в ссылке — до обрезки по длине, чтобы предел считался уже с ней.
    const plain = threadsText(tagLinks(out.text, 'threads', `th-${idea ? 'idea' : rubric}`));
    const media = (rubric === 'app' || rubric === 'build' || rubric === 'author' || idea) && this.d.mediaDir ? pickMedia(out.images).slice(0, 1).map((file) => ({ file })) : [];
    return { rubric: idea ? 'idea' : rubric, topic: out.topic.slice(0, 120), text: escHtml(plain), plain, mentionsApp: !!out.mentions_app, media, tag: threadsTag((out as { tag?: unknown }).tag, rubric) };
  }

  async propose(slot: string, now = Date.now(), idea?: string): Promise<void> {
    const draft = await this.draft(now, idea);
    await this.offer({ id: Date.now().toString(36), slot, draft, controls: [], previews: [], at: Date.now(), idea });
    this.lastError = null;
  }

  /** Авто-режим: пишем и сразу публикуем, админу — ссылка на пост. */
  async autoPost(slot: string, now = Date.now()): Promise<void> {
    const draft = await this.draft(now);
    const post = await this.publishDraft(slot, draft);
    for (const chatId of this.d.approvers()) await this.d.bot('sendMessage', { chat_id: chatId, text: `🧵 В Threads вышел пост «${post.topic}»${post.link ? `\n${post.link}` : ''}` }).catch(() => null);
    this.lastError = null;
  }

  private async offer(p: Pending): Promise<void> {
    await this.clearControls();
    p.controls = [];
    p.previews = [];
    const canPost = !!this.token();
    for (const chatId of this.d.approvers()) {
      const preview = await sendPost(this.d, chatId, p.draft).catch(() => undefined);
      if (preview) p.previews.push(preview);
      const rows = [
        ...(canPost ? [[{ text: '✅ Опубликовать в Threads', callback_data: `th:ok:${p.id}` }]] : []),
        [
          { text: '🔄 Другой вариант', callback_data: `th:redo:${p.id}` },
          { text: '✖️ Пропустить', callback_data: `th:skip:${p.id}` },
        ],
      ];
      const r = await this.d.bot('sendMessage', {
        chat_id: chatId,
        text: [
          `🧵 Черновик для Threads (${[...p.draft.plain].length}/${THREADS_LIMIT} знаков, тема «${p.draft.tag}»${p.draft.media.length ? ', с картинкой' : ''}).`,
          canPost ? 'Опубликовать?' : 'Threads ещё не подключён: скопируй текст и выложи сам, или подключи — тогда здесь будет кнопка «Опубликовать».',
          '',
          'Ответь на пост своим текстом — он заменит текст.',
        ].join('\n'),
        reply_markup: { inline_keyboard: rows },
      });
      const id = (r.result as { message_id?: number } | undefined)?.message_id;
      if (r.ok && id) p.controls.push({ chatId, messageId: id });
    }
    if (!p.controls.length && !p.previews.length) throw new Error('не удалось отправить черновик админам');
    this.state.pending = p;
    this.save();
  }

  private async clearControls(note?: string): Promise<void> {
    for (const c of this.state.pending?.controls ?? [])
      await this.d.bot('editMessageText', { chat_id: c.chatId, message_id: c.messageId, text: note ?? 'Черновик заменён новым.' }).catch(() => null);
  }

  private async publishDraft(slot: string, draft: ThreadsDraft): Promise<ChannelPost & { link?: string }> {
    const token = this.token();
    if (!token) throw new Error('Threads не подключён: нет секрета THREADS_TOKEN');
    const img = draft.media.find((m): m is { file: string } => 'file' in m);
    const r = await threadsPublish(this.d.threadsFetch, token, { text: draft.plain, imageUrl: img ? this.d.mediaUrl(img.file) : undefined, tag: draft.tag });
    const post: ChannelPost = { at: Date.now(), slot, rubric: draft.rubric, topic: draft.topic, mentionsApp: draft.mentionsApp };
    this.state.posts.push(post);
    this.state.posts = this.state.posts.slice(-300);
    this.save();
    return { ...post, link: r.permalink };
  }

  private async publish(): Promise<void> {
    const p = this.state.pending;
    if (!p) throw new Error('черновика нет');
    const post = await this.publishDraft(p.slot, p.draft);
    await this.clearControls(`✅ Опубликовано в Threads: «${p.draft.topic}»${post.link ? `\n${post.link}` : ''}`);
    this.state.pending = null;
    this.save();
  }

  /** Кнопки под черновиком (th:*) и ответ своим текстом на превью. true — обновление наше. */
  onUpdate(u: Update, reply: (chatId: number, text: string) => void, answer: (id: string, text?: string) => void): boolean {
    const cb = u.callback_query;
    if (cb?.data?.startsWith('th:')) {
      const [, action, id] = cb.data.split(':');
      const p = this.state.pending;
      if (!this.d.approvers().includes(cb.from.id)) return answer(cb.id, 'Только для админов'), true;
      if (!p || p.id !== id) return answer(cb.id, 'Этот черновик уже неактуален'), true;
      if (this.busy) return answer(cb.id, 'Подожди, я ещё работаю'), true;
      const chat = cb.from.id;
      this.busy = true;
      const done = () => (this.busy = false);
      if (action === 'ok') {
        answer(cb.id, 'Публикую в Threads…');
        this.publish()
          .catch((e: Error) => reply(chat, `Не вышло опубликовать в Threads: ${(this.lastError = e.message)}`))
          .finally(done);
      } else if (action === 'redo') {
        answer(cb.id, 'Пишу другой вариант…');
        this.draft(Date.now(), p.idea)
          .then((draft) => this.offer({ ...p, id: Date.now().toString(36), draft, at: Date.now() }))
          .catch((e: Error) => reply(chat, `Не вышло: ${(this.lastError = e.message)}`))
          .finally(done);
      } else if (action === 'skip') {
        answer(cb.id, 'Пропускаю');
        this.state.posts.push({ at: Date.now(), slot: p.slot, rubric: p.draft.rubric, topic: p.draft.topic, mentionsApp: false, skipped: true });
        this.clearControls('✖️ Черновик для Threads пропущен.')
          .then(() => {
            this.state.pending = null;
            this.save();
          })
          .finally(done);
      } else done();
      return true;
    }
    const msg = u.message;
    const p = this.state.pending;
    const to = msg?.reply_to_message?.message_id;
    if (!msg?.text || !p || !to || msg.chat.type !== 'private' || !this.d.approvers().includes(msg.chat.id) || msg.text.startsWith('/')) return false;
    if (!p.previews.includes(to) && !p.controls.some((c) => c.messageId === to)) return false;
    const plain = threadsText(msg.text);
    p.draft = { ...p.draft, plain, text: escHtml(plain) };
    this.save();
    reply(msg.chat.id, [...msg.text.trim()].length > THREADS_LIMIT ? `Текст длиннее ${THREADS_LIMIT} знаков — обрезал по предложению. Вот черновик 👇` : 'Текст заменил, вот обновлённый черновик 👇');
    void this.offer(p).catch(() => null);
    return true;
  }

  /** /threads — черновик сейчас; /threads тема — черновик на тему; /threads_auto on|off — режим. */
  command(chatId: number, text: string, reply: (t: string) => void): boolean {
    const auto = /^\/threads_auto(?:@\w+)?\s*(on|off|вкл|выкл)?\s*$/i.exec(text.trim());
    if (auto) {
      if (!auto[1]) return reply(this.status()), true;
      this.state.auto = /^(on|вкл)$/i.test(auto[1]);
      this.save();
      reply(
        this.state.auto
          ? `Авто-режим включён: сам публикую в Threads в ${THREADS_AUTO_HOURS.map((h) => `${h}:00`).join(' и ')} МСК и присылаю ссылку.${this.token() ? '' : ' Но Threads ещё не подключён — пока буду присылать черновики.'}`
          : `Авто-режим выключен: черновик в ${THREADS_ASK_HOURS.map((h) => `${h}:00`).join(', ')} МСК, публикация по кнопке.`,
      );
      return true;
    }
    const m = /^\/threads(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(text.trim());
    if (!m) return false;
    if (this.busy) return reply('Черновик для Threads уже пишется.'), true;
    const idea = (m[1] ?? '').trim().slice(0, 500) || undefined;
    reply(idea ? 'Пишу пост для Threads на твою тему…' : 'Пишу пост для Threads…');
    this.busy = true;
    this.propose(`ручной ${new Date().toISOString()}`, Date.now(), idea)
      .catch((e: Error) => reply(`Не вышло: ${(this.lastError = e.message)}`))
      .finally(() => (this.busy = false));
    return true;
  }
}
