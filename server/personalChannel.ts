// Личный канал автора (@nikitenokN): один пост в день, но только после подтверждения.
// В 20:00 по Москве бот пишет черновик и присылает его админам с кнопками «Опубликовать», «Другой вариант», «Пропустить».
// Ответом на черновик можно прислать свой скриншот (заменит картинки) или свой текст (заменит текст).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { type ChannelDeps, type ChannelPost, type ChannelState, type Commit, type Draft, dueSlot, imagesHint, JSON_HINT, parseChangelog, sendPost, telegramHtml, writePost } from './channel';
import { type MediaRef, pickMedia } from './channelMedia';
import type { Update } from './bot';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MSK = 3 * HOUR;
export const PERSONAL_HOURS = [20];

export type PersonalRubric = 'today' | 'status' | 'fact';
export const PERSONAL_RUBRICS: Record<PersonalRubric, string> = {
  today: 'Что сделано сегодня: по списку сегодняшних изменений расскажи, что появилось в NikitenokArena за день, зачем это и что было интересного или сложного. 2–4 главных изменения простыми словами, без технических мелочей.',
  status: 'Как дела у проекта: короткий честный отчёт — что сделано за последние дни, цифры из статистики (если есть, какие есть — без приукрашивания), что дальше по планам. Если цифры скромные, так и пиши: проект только начинается.',
  fact: 'Интересный факт про ИИ, нейросети и автоматизацию: как устроены языковые модели, компьютерное зрение (например, как камера узнаёт позу человека), история ИИ, роботы и автоматизация рутины, необычные применения нейросетей, полезные приёмы работы с ИИ. Один факт — правдивый и проверяемый, объяснённый просто и с примером. Можно одной фразой связать с личным опытом разработки, но не обязательно.',
};

export const PERSONAL_SYSTEM = `Ты пишешь посты для личного Telegram-канала Николая Никитёнка — автора игры NikitenokArena (Telegram Mini App, где камера телефона считает отжимания, приседания и пресс, а каждый повтор бьёт врага). Пиши от первого лица, как сам Николай: живо, просто, с лёгкой самоиронией, без пафоса и без рекламных призывов.

Правила:
- По-русски. Длина 400–900 знаков (пост может уйти подписью к картинке, а там предел 1024). Короткие абзацы, эмодзи — не больше 3.
- Только правда: не придумывай событий из жизни автора, цифр, отзывов и планов, которых нет в данных. Чего не знаешь — не пиши.
- Форматирование — только HTML-теги Telegram: <b>, <i>. Первая строка — заголовок в <b>…</b>. Никакого Markdown, ссылок и хэштегов.
- Не повторяй темы из списка уже опубликованных.
- Никогда не пиши о самом канале: что посты пишутся или публикуются автоматически, что их пишет ИИ, про ботов для постинга.`;

/** Рубрика на сегодня: в основном «факт» про ИИ и автоматизацию, иногда «что сделано» и раз в неделю «как дела». */
export function planPersonal(now: number, state: ChannelState, commits: Commit[]): PersonalRubric {
  const today = commits.filter((c) => now - c.at < DAY);
  const lastOf = (r: string) => [...state.posts].reverse().find((p) => p.rubric === r && !p.skipped)?.at ?? 0;
  // Основное — факты про ИИ и автоматизацию; про игру — только когда за день заметно поменялось (3+ изменения), не чаще раза в 2 дня.
  if (today.length >= 3 && now - lastOf('today') >= 2 * DAY) return 'today';
  if (now - lastOf('status') >= 7 * DAY && state.posts.length >= 5) return 'status';
  return 'fact';
}

export function personalPrompt(o: { now: number; rubric: PersonalRubric; recent: ChannelPost[]; commits: Commit[]; stats: string }): string {
  const date = new Date(o.now + MSK).toISOString().slice(0, 10);
  const lines = [`Сегодня ${date}.`, '', `Рубрика: ${PERSONAL_RUBRICS[o.rubric]}`, ''];
  const recentCommits = o.commits.filter((c) => o.now - c.at < (o.rubric === 'today' ? DAY : 7 * DAY));
  if (o.rubric !== 'fact' && recentCommits.length)
    lines.push('Изменения в игре (тема коммита, от новых к старым):', ...recentCommits.slice(0, 40).map((c) => `- ${new Date(c.at + MSK).toISOString().slice(0, 10)}: ${c.subject}`), '');
  if (o.rubric === 'status' && o.stats) lines.push('Статистика игры за последние дни:', o.stats, '');
  lines.push(o.recent.length ? `Уже опубликованные темы (не повторяй):\n${o.recent.map((p) => `- ${p.topic}`).join('\n')}` : 'Это один из первых постов канала.');
  lines.push('', imagesHint(o.rubric !== 'fact'), '', JSON_HINT);
  return lines.join('\n');
}

interface Pending {
  id: string;
  slot: string;
  draft: Draft;
  // Сообщения с кнопками у админов: после решения кнопки убираем.
  controls: { chatId: number; messageId: number }[];
  // Сообщения-превью: ответ на любое из них меняет картинки или текст.
  previews: number[];
  at: number;
  // Альбом, которым ответили на черновик: фото одного альбома приходят отдельными сообщениями.
  album?: string;
}
interface PersonalState extends ChannelState {
  pending?: Pending | null;
}

export interface PersonalDeps extends ChannelDeps {
  approvers: () => number[];
  stats: () => string;
}

export class PersonalChannel {
  state: PersonalState = { posts: [] };
  busy = false;
  lastError: string | null = null;
  private tries = new Map<string, number>();

  constructor(
    private file: string | null,
    private d: PersonalDeps,
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
    const last = [...this.state.posts].reverse().find((p) => !p.skipped);
    return [
      `Личный канал: ${this.d.channel}, черновик в ${PERSONAL_HOURS.map((h) => `${h}:00`).join(', ')} МСК, публикация после «Опубликовать»`,
      `Постов: ${this.state.posts.filter((p) => !p.skipped).length}${last ? `, последний — ${last.topic}` : ''}${this.state.pending ? '. Черновик ждёт решения' : ''}`,
      this.lastError ? `Последняя ошибка: ${this.lastError}` : 'Ошибок нет',
      'Команда: /channel_me — черновик для личного канала прямо сейчас',
    ].join('\n');
  }

  /** Раз в минуту: в 20:00 готовим черновик, если сегодня его ещё не было. Неотвеченный черновик живёт сутки. */
  tick(now = Date.now()): void {
    const p = this.state.pending;
    if (p && now - p.at > DAY) {
      this.state.pending = null;
      this.save();
    }
    if (this.busy || this.state.pending || !(this.d.apiKey() || this.d.claudeToken?.()) || !this.d.approvers().length) return;
    // Сегодня уже был пост (например, по /channel_me) или черновик пропустили — второй не предлагаем.
    const day = (t: number) => new Date(t + MSK).toISOString().slice(0, 10);
    if (this.state.posts.some((x) => day(x.at) === day(now))) return;
    const slot = dueSlot(now, this.state, PERSONAL_HOURS);
    if (!slot || (this.tries.get(slot) ?? 0) >= 3) return;
    this.tries.set(slot, (this.tries.get(slot) ?? 0) + 1);
    this.propose(slot, now).catch((e: Error) => {
      this.lastError = e.message;
      this.d.log?.(`personal: ${e.message}`);
    });
  }

  async draft(now = Date.now()): Promise<Draft> {
    const commits = parseChangelog(this.d.changelog());
    const rubric = planPersonal(now, this.state, commits);
    const prompt = personalPrompt({ now, rubric, recent: this.state.posts.filter((p) => !p.skipped).slice(-60), commits, stats: rubric === 'status' ? this.d.stats() : '' });
    const out = await writePost(this.d, PERSONAL_SYSTEM, prompt);
    if (!out.text || !out.topic) throw new Error('пустой ответ Claude');
    const media: MediaRef[] = rubric !== 'fact' && this.d.upload && this.d.mediaDir ? pickMedia(out.images).slice(0, 2).map((file) => ({ file })) : [];
    return { rubric, topic: out.topic.slice(0, 120), text: telegramHtml(out.text), mentionsApp: false, media };
  }

  /** Новый черновик для слота: пишем и рассылаем админам. */
  async propose(slot: string, now = Date.now()): Promise<void> {
    this.busy = true;
    try {
      const draft = await this.draft(now);
      await this.offer({ id: Date.now().toString(36), slot, draft, controls: [], previews: [], at: Date.now() });
      this.lastError = null;
    } finally {
      this.busy = false;
    }
  }

  /** Превью поста (ровно как будет в канале) и под ним сообщение с кнопками. */
  private async offer(p: Pending): Promise<void> {
    await this.clearControls();
    p.controls = [];
    p.previews = [];
    for (const chatId of this.d.approvers()) {
      const preview = await sendPost(this.d, chatId, p.draft).catch(() => undefined);
      if (preview) p.previews.push(preview);
      const keyboard = {
        inline_keyboard: [
          [{ text: '✅ Опубликовать', callback_data: `pc:ok:${p.id}` }],
          [
            { text: '🔄 Другой вариант', callback_data: `pc:redo:${p.id}` },
            { text: '✖️ Пропустить', callback_data: `pc:skip:${p.id}` },
          ],
        ],
      };
      const r = await this.d.bot('sendMessage', {
        chat_id: chatId,
        text: `Черновик для ${this.d.channel}. Опубликовать?\n\nМожно ответить на пост своим скриншотом — он заменит картинки, или своим текстом — он заменит текст.`,
        reply_markup: keyboard,
      });
      const id = (r.result as { message_id?: number } | undefined)?.message_id;
      if (r.ok && id) p.controls.push({ chatId, messageId: id });
    }
    this.state.pending = p;
    this.save();
  }

  private async clearControls(note?: string): Promise<void> {
    for (const c of this.state.pending?.controls ?? [])
      await this.d.bot('editMessageText', { chat_id: c.chatId, message_id: c.messageId, text: note ?? 'Черновик заменён новым.' }).catch(() => null);
  }

  private async publish(): Promise<ChannelPost> {
    const p = this.state.pending;
    if (!p) throw new Error('черновика нет');
    const messageId = await sendPost(this.d, this.d.channel, p.draft);
    const post: ChannelPost = { at: Date.now(), slot: p.slot, rubric: p.draft.rubric, topic: p.draft.topic, mentionsApp: false, messageId };
    this.state.posts.push(post);
    this.state.posts = this.state.posts.slice(-300);
    await this.clearControls(`✅ Опубликовано в ${this.d.channel}: «${p.draft.topic}».`);
    this.state.pending = null;
    this.save();
    return post;
  }

  /**
   * Кнопки под черновиком и ответы на превью. true — обновление наше и разобрано.
   * Только от админов; ответы — только на превью текущего черновика.
   */
  onUpdate(u: Update, reply: (chatId: number, text: string) => void, answer: (id: string, text?: string) => void): boolean {
    const cb = u.callback_query;
    if (cb?.data?.startsWith('pc:')) {
      const [, action, id] = cb.data.split(':');
      const p = this.state.pending;
      if (!this.d.approvers().includes(cb.from.id)) return answer(cb.id, 'Только для админов'), true;
      if (!p || p.id !== id) return answer(cb.id, 'Этот черновик уже неактуален'), true;
      if (this.busy) return answer(cb.id, 'Подожди, я ещё пишу'), true;
      const chat = cb.from.id;
      this.busy = true;
      const done = () => (this.busy = false);
      if (action === 'ok') {
        answer(cb.id, 'Публикую…');
        this.publish()
          .catch((e: Error) => reply(chat, `Не вышло опубликовать: ${(this.lastError = e.message)}`))
          .finally(done);
      } else if (action === 'redo') {
        answer(cb.id, 'Пишу другой вариант…');
        this.draft()
          .then((draft) => this.offer({ ...p, id: Date.now().toString(36), draft, at: Date.now() }))
          .catch((e: Error) => reply(chat, `Не вышло: ${(this.lastError = e.message)}`))
          .finally(done);
      } else if (action === 'skip') {
        answer(cb.id, 'Пропускаю');
        this.state.posts.push({ at: Date.now(), slot: p.slot, rubric: p.draft.rubric, topic: p.draft.topic, mentionsApp: false, skipped: true });
        this.clearControls('✖️ Черновик пропущен, сегодня без поста.')
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
    if (!msg || !p || !to || msg.chat.type !== 'private' || !this.d.approvers().includes(msg.chat.id)) return false;
    if (!p.previews.includes(to) && !p.controls.some((c) => c.messageId === to)) return false;
    if (msg.photo?.length) {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      // Фото из одного альбома копим (до трёх), новое фото без альбома заменяет картинки.
      const sameAlbum = !!msg.media_group_id && msg.media_group_id === p.album;
      p.draft.media = (sameAlbum ? [...p.draft.media, { fileId }] : [{ fileId }]).slice(0, 3);
      p.album = msg.media_group_id;
      if (msg.caption) p.draft.text = telegramHtml(msg.caption);
      this.save();
      // Альбом приходит пачкой: превью обновляем, когда фото перестанут приходить.
      clearTimeout(this.refresh);
      this.refresh = setTimeout(() => void this.offer(p).catch(() => null), msg.media_group_id ? 2500 : 0);
      reply(msg.chat.id, 'Картинки заменил, вот обновлённый черновик 👇');
      return true;
    }
    if (msg.text && !msg.text.startsWith('/')) {
      p.draft.text = telegramHtml(msg.text);
      this.save();
      reply(msg.chat.id, 'Текст заменил, вот обновлённый черновик 👇');
      void this.offer(p).catch(() => null);
      return true;
    }
    return false;
  }
  private refresh?: ReturnType<typeof setTimeout>;

  /** /channel_me — черновик прямо сейчас (публикация всё равно только по кнопке). */
  command(chatId: number, text: string, reply: (t: string) => void): boolean {
    if (!/^\/channel_me\b/.test(text.trim())) return false;
    if (this.busy) return reply('Черновик уже пишется.'), true;
    reply('Пишу черновик для личного канала…');
    this.propose(`ручной ${new Date().toISOString()}`).catch((e: Error) => reply(`Не вышло: ${(this.lastError = e.message)}`));
    return true;
  }
}
