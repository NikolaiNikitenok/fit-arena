import { describe, expect, it } from 'vitest';
import https from 'node:https';
import { join } from 'node:path';
import { parseChangelog } from './channel';
import { sendWithMedia } from './channelMedia';
import { PersonalChannel, personalPrompt, planPersonal } from './personalChannel';
import type { Update } from './bot';

const msk = (iso: string) => Date.parse(`${iso}+03:00`);
const MEDIA = join(__dirname, 'media', 'channel');

function setup(answer: Record<string, unknown>) {
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const uploads: { method: string; fields: Record<string, unknown>; files: string[] }[] = [];
  let id = 100;
  const bot = async (method: string, body: unknown) => (calls.push({ method, body: body as Record<string, unknown> }), { ok: true, result: { message_id: ++id } });
  const ch = new PersonalChannel(null, {
    apiKey: () => '',
    claudeToken: () => 'tok',
    claudeCode: async () => JSON.stringify(answer),
    channel: '@nikitenokN',
    agent: () => new https.Agent(),
    changelog: () => ['Деревня: ночные огни', 'Дуэли: лиги', 'Питомцы: новые'].map((t, i) => `a${i}|${new Date().toISOString()}|${t}`).join('\n'),
    bot,
    upload: async (method, fields, files) => (uploads.push({ method, fields, files: files.map((f) => f.name) }), { ok: true, result: { message_id: ++id, photo: [{ file_id: 'F1' }] } }),
    mediaDir: MEDIA,
    appLink: () => '',
    approvers: () => [42],
    stats: () => 'Игроков: 1',
  });
  return { ch, calls, uploads };
}
const flush = () => new Promise((r) => setTimeout(r, 20));
const replies: string[] = [];
const reply = (_: number, t: string) => replies.push(t);
const answer = () => undefined;

describe('личный канал', () => {
  it('рубрика: в основном факты, «что сделано» — при 3+ изменениях за день, «как дела» — раз в неделю; работа над каналами не в счёт', () => {
    const now = msk('2026-10-25T20:00:00');
    const channelWork = parseChangelog(['a|2026-10-25T15:00:00+03:00|Канал: автопостинг', 'b|2026-10-25T16:00:00+03:00|Каналы: скриншоты', 'c|2026-10-25T17:00:00+03:00|Бот: админ-клавиатура'].join('\n'));
    expect(channelWork).toEqual([]);
    const fresh = parseChangelog(['a|2026-10-25T15:00:00+03:00|Деревня: огни', 'b|2026-10-25T16:00:00+03:00|Дуэли: лиги', 'c|2026-10-25T17:00:00+03:00|Питомцы'].join('\n'));
    const old = parseChangelog(`x|2026-10-20T15:00:00+03:00|Деревня`);
    const post = (rubric: string, ago: number) => ({ at: now - ago * 86400_000, slot: 's', rubric, topic: 't', mentionsApp: false });
    expect(planPersonal(now, { posts: [] }, fresh)).toBe('today');
    expect(planPersonal(now, { posts: [] }, old)).toBe('fact');
    const five = [1, 2, 3, 4, 5].map((d) => post('fact', d));
    expect(planPersonal(now, { posts: five }, old)).toBe('status');
    expect(planPersonal(now, { posts: [...five, post('status', 3)] }, old)).toBe('fact');
    const p = personalPrompt({ now, rubric: 'status', recent: [], commits: old, stats: 'Игроков: 7' });
    expect(p).toContain('Игроков: 7');
    expect(p).toContain('Деревня');
    expect(p).toContain('village-night');
  });

  it('черновик приходит админу со скриншотом и кнопками, в канал — только после «Опубликовать»', async () => {
    const { ch, calls, uploads } = setup({ topic: 'Ночная деревня', text: '<b>Сегодня</b>\n\nДобавил огни.', mentions_app: true, images: ['village-night', 'нет-такой'] });
    await ch.propose('2026-10-25 20', msk('2026-10-25T20:00:00'));
    expect(uploads).toEqual([{ method: 'sendPhoto', fields: expect.objectContaining({ chat_id: 42, caption: '<b>Сегодня</b>\n\nДобавил огни.', parse_mode: 'HTML' }), files: ['village-night.jpg'] }]);
    const control = calls.find((c) => c.method === 'sendMessage');
    expect(JSON.stringify(control?.body.reply_markup)).toContain('pc:ok:');
    // Чужой не опубликует.
    const data = (control!.body.reply_markup as { inline_keyboard: { callback_data: string }[][] }).inline_keyboard[0][0].callback_data;
    const cb = (from: number, d = data): Update => ({ update_id: 1, callback_query: { id: 'q', from: { id: from }, data: d } });
    expect(ch.onUpdate(cb(7), reply, answer)).toBe(true);
    expect(ch.state.pending).toBeTruthy();
    // Админ публикует: картинка уже загружена, шлём file_id.
    expect(ch.onUpdate(cb(42), reply, answer)).toBe(true);
    await flush();
    const sent = calls.filter((c) => c.method === 'sendPhoto');
    expect(sent.at(-1)?.body).toMatchObject({ chat_id: '@nikitenokN', photo: 'F1' });
    expect(ch.state.pending).toBeNull();
    expect(ch.state.posts[0]).toMatchObject({ topic: 'Ночная деревня', rubric: 'today' });
    expect(calls.some((c) => c.method === 'editMessageText' && String(c.body.text).includes('Опубликовано'))).toBe(true);
  });

  it('ответ своим фото заменяет картинки, «Пропустить» — без поста до завтра', async () => {
    const { ch, calls } = setup({ topic: 'Факт', text: 'Текст', mentions_app: false, images: [] });
    await ch.propose('2026-10-25 20', msk('2026-10-25T20:00:00'));
    const preview = ch.state.pending!.previews[0];
    const photo: Update = { update_id: 2, message: { message_id: 500, chat: { id: 42, type: 'private' }, photo: [{ file_id: 'small', width: 1, height: 1 }, { file_id: 'BIG', width: 9, height: 9 }], reply_to_message: { message_id: preview } } };
    expect(ch.onUpdate(photo, reply, answer)).toBe(true);
    expect(ch.state.pending!.draft.media).toEqual([{ fileId: 'BIG' }]);
    await flush();
    expect(calls.some((c) => c.method === 'sendPhoto' && c.body.photo === 'BIG')).toBe(true);
    const id = ch.state.pending!.id;
    expect(ch.onUpdate({ update_id: 3, callback_query: { id: 'q', from: { id: 42 }, data: `pc:skip:${id}` } }, reply, answer)).toBe(true);
    await flush();
    expect(ch.state.pending).toBeNull();
    expect(ch.state.posts[0].skipped).toBe(true);
    // Сегодня второго черновика не будет.
    ch.tick(msk('2026-10-25T20:30:00'));
    expect(ch.busy).toBe(false);
    // Обычное сообщение боту — не наше.
    expect(ch.onUpdate({ update_id: 4, message: { chat: { id: 42, type: 'private' }, text: 'привет' } }, reply, answer)).toBe(false);
  });
});

describe('личный канал: тема от автора', () => {
  it('в 20:00 бот спрашивает тему, фраза админа становится темой черновика, «Другой вариант» — на ту же тему', async () => {
    const prompts: string[] = [];
    const { ch, calls } = setup({ topic: 'Камера и поза', text: 'Текст про <a href="https://t.me/ArenaNikitenokBot?startapp">игру</a>', mentions_app: false, images: [] });
    (ch as unknown as { d: { claudeCode: (system: string, prompt: string) => Promise<string> } }).d.claudeCode = async (_, prompt) => (prompts.push(prompt), JSON.stringify({ topic: 'Камера и поза', text: 'Текст', images: [] }));
    ch.tick(msk('2026-10-25T20:01:00'));
    await flush();
    expect(ch.state.asking).toBeTruthy();
    expect(ch.state.pending).toBeFalsy();
    const q = calls.find((c) => c.method === 'sendMessage');
    expect(String(q?.body.text)).toContain('О чём написать пост');
    expect(JSON.stringify(q?.body.reply_markup)).toContain('pc:auto:');
    // Кнопка меню — не тема.
    const ignoring = setup({});
    expect(ignoring.ch.onUpdate({ update_id: 1, message: { chat: { id: 42, type: 'private' }, text: '/channel' } }, reply, answer)).toBe(false);
    // Фраза админа — тема.
    expect(ch.onUpdate({ update_id: 2, message: { chat: { id: 42, type: 'private' }, text: 'как нейросеть видит позу' } }, reply, answer)).toBe(true);
    await flush();
    expect(ch.state.asking).toBeNull();
    expect(ch.state.pending?.idea).toBe('как нейросеть видит позу');
    expect(prompts[0]).toContain('Фраза автора: «как нейросеть видит позу»');
    const id = ch.state.pending!.id;
    expect(ch.onUpdate({ update_id: 3, callback_query: { id: 'q', from: { id: 42 }, data: `pc:redo:${id}` } }, reply, answer)).toBe(true);
    await flush();
    expect(prompts[1]).toContain('как нейросеть видит позу');
    expect(ch.state.pending?.draft.rubric).toBe('idea');
  });

  it('«Пусть Claude выберет» и тишина 3 часа — тему выбирает Claude; «Сегодня без поста» — до завтра', async () => {
    const { ch } = setup({ topic: 'Факт', text: 'Текст', images: [] });
    await ch.ask('s1', msk('2026-10-25T20:00:00'));
    ch.onUpdate({ update_id: 1, callback_query: { id: 'q', from: { id: 42 }, data: `pc:auto:${ch.state.asking!.id}` } }, reply, answer);
    await flush();
    expect(ch.state.pending?.draft.rubric).toMatch(/^(today|fact|status)$/);

    const b = setup({ topic: 'Факт', text: 'Текст', images: [] });
    await b.ch.ask('s2', msk('2026-10-25T20:00:00'));
    b.ch.tick(msk('2026-10-25T21:00:00'));
    expect(b.ch.state.asking).toBeTruthy();
    b.ch.tick(msk('2026-10-25T23:01:00'));
    await flush();
    expect(b.ch.state.pending?.draft.rubric).toMatch(/^(today|fact|status)$/);

    const c = setup({});
    await c.ch.ask('s3', msk('2026-10-25T20:00:00'));
    c.ch.onUpdate({ update_id: 1, callback_query: { id: 'q', from: { id: 42 }, data: `pc:none:${c.ch.state.asking!.id}` } }, reply, answer);
    expect(c.ch.state.asking).toBeNull();
    expect(c.ch.state.posts[0].skipped).toBe(true);
  });

  it('/channel_me фраза — сразу черновик по фразе', async () => {
    const { ch } = setup({ topic: 'Деревня', text: 'Текст', images: [] });
    expect(ch.command(42, '/channel_me сегодня доделал деревню', () => undefined)).toBe(true);
    await flush();
    expect(ch.state.pending?.idea).toBe('сегодня доделал деревню');
  });
});

describe('картинки в постах', () => {
  it('длинный текст: альбом без подписи, потом текст с кнопкой', async () => {
    const calls: { method: string; fields: Record<string, unknown> }[] = [];
    const r = await sendWithMedia({
      bot: async (method, body) => (calls.push({ method, fields: body as Record<string, unknown> }), { ok: true, result: { message_id: 9 } }),
      upload: async (method, fields) => (calls.push({ method, fields }), { ok: true, result: [{ message_id: 1 }, { message_id: 2 }] }),
      dir: MEDIA,
      chatId: '@c',
      html: 'x'.repeat(1200),
      plain: 'x'.repeat(1200),
      media: [{ file: 'cover' }, { file: 'duel' }],
      replyMarkup: { inline_keyboard: [] },
    });
    expect(calls.map((c) => c.method)).toEqual(['sendMediaGroup', 'sendMessage']);
    expect(JSON.stringify(calls[0].fields.media)).not.toContain('caption');
    expect(calls[1].fields.reply_markup).toBeTruthy();
    expect(r.messageId).toBe(9);
  });
});
