import { describe, expect, it } from 'vitest';
import https from 'node:https';
import { join } from 'node:path';
import { planThreads, Threads, threadsPublish, threadsTag, threadsText, THREADS_LIMIT } from './threads';
import type { Update } from './bot';

const MEDIA = join(__dirname, 'media', 'channel');
const flush = () => new Promise((r) => setTimeout(r, 20));

type Call = { url: string; body: string };
/** Поддельный graph.threads.net: отвечает по пути и запоминает запросы. */
function fakeApi(opts: { rejectTag?: boolean } = {}) {
  const calls: Call[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const body = String(init?.body ?? '');
    calls.push({ url, body });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (url.includes('/me/threads_publish')) return json({ id: 'P1' });
    if (url.includes('/me/threads')) return opts.rejectTag && body.includes('topic_tag') ? json({ error: { message: 'Invalid parameter topic_tag' } }, 400) : json({ id: 'C1' });
    if (url.includes('refresh_access_token')) return json({ access_token: 'NEW', token_type: 'bearer', expires_in: 5_184_000 });
    if (url.includes('/C1?')) return json({ status: 'FINISHED' });
    if (url.includes('/P1?')) return json({ permalink: 'https://www.threads.com/@n/post/abc' });
    return json({ error: { message: 'unknown' } }, 404);
  }) as typeof fetch;
  return { f, calls };
}

function setup(answer: Record<string, unknown>, token = 'TOK') {
  const sent: { method: string; body: Record<string, unknown> }[] = [];
  let id = 100;
  const api = fakeApi();
  const th = new Threads(null, {
    apiKey: () => '',
    claudeToken: () => 'tok',
    claudeCode: async () => JSON.stringify(answer),
    channel: 'Threads',
    agent: () => new https.Agent(),
    changelog: () => '',
    bot: async (method, body) => (sent.push({ method, body: body as Record<string, unknown> }), { ok: true, result: { message_id: ++id } }),
    upload: async () => ({ ok: true, result: { message_id: ++id, photo: [{ file_id: 'F' }] } }),
    mediaDir: MEDIA,
    appLink: () => '',
    approvers: () => [42],
    threadsToken: () => token,
    threadsFetch: api.f,
    mediaUrl: (n) => `https://arena.nikitenok.ru/api/threads/media/${n}.jpg`,
  });
  return { th, sent, api };
}
const replies: string[] = [];
const reply = (_: number, t: string) => replies.push(t);
const answer = () => undefined;

describe('Threads', () => {
  it('текст: без HTML и Markdown, чужие ссылки убраны, не длиннее 500 знаков, своя ссылка в конце сохраняется', () => {
    expect(threadsText('<b>Привет</b> **мир** https://evil.com и https://t.me/ArenaNikitenokBot?start=src-threads')).toBe('Привет мир  и https://t.me/ArenaNikitenokBot?start=src-threads');
    const long = `${'Короткая фраза про отжимания. '.repeat(30)}\n\nhttps://t.me/ArenaNikitenokBot?start=src-threads`;
    const t = threadsText(long);
    expect([...t].length).toBeLessThanOrEqual(THREADS_LIMIT);
    expect(t.endsWith('https://t.me/ArenaNikitenokBot?start=src-threads')).toBe(true);
    expect(t).toMatch(/\.\n\nhttps/);
  });

  it('тема: без решёток, по умолчанию — по рубрике', () => {
    expect(threadsTag('#Фитнес', 'tip')).toBe('Фитнес');
    expect(threadsTag('', 'build')).toBe('Разработка игр');
  });

  it('рубрики идут по кругу, «делаю игру» — только если за сутки были изменения', () => {
    const now = Date.now();
    const posts = (n: number) => ({ posts: Array.from({ length: n }, () => ({ at: 0, slot: '', rubric: 'x', topic: 't', mentionsApp: false })) });
    expect(planThreads(posts(0), [], now)).toBe('question');
    expect(planThreads(posts(2), [], now)).toBe('app');
    expect(planThreads(posts(5), [], now)).toBe('author');
    expect(planThreads(posts(7), [], now)).toBe('question');
    expect(planThreads(posts(7), [{ hash: 'a', at: now - 1000, subject: 'Деревня' }], now)).toBe('build');
  });

  it('публикация: контейнер, проверка статуса, публикация, ссылка; если тема не принята — повтор без неё', async () => {
    const { f, calls } = fakeApi({ rejectTag: true });
    const r = await threadsPublish(f, 'T', { text: 'Привет', tag: 'Фитнес' }, async () => undefined);
    expect(r).toEqual({ id: 'P1', permalink: 'https://www.threads.com/@n/post/abc' });
    const creates = calls.filter((c) => c.url.endsWith('/me/threads'));
    expect(creates).toHaveLength(2);
    expect(creates[1].body).not.toContain('topic_tag');
    expect(creates[1].body).toContain('media_type=TEXT');
    expect(calls.some((c) => c.url.endsWith('/me/threads_publish') && c.body.includes('creation_id=C1'))).toBe(true);
  });

  it('черновик приходит админу с кнопкой, «Опубликовать» выкладывает пост с картинкой по публичному адресу', async () => {
    const { th, sent, api } = setup({ topic: 'Как камера считает отжимания', text: 'Камера видит 33 точки тела.\n\nhttps://t.me/ArenaNikitenokBot?start=src-threads', mentions_app: true, images: ['duel'], tag: 'Фитнес' });
    th.state.posts = Array.from({ length: 2 }, () => ({ at: 0, slot: '', rubric: 'x', topic: 't', mentionsApp: false }));
    await th.propose('s1');
    const control = sent.find((c) => JSON.stringify(c.body.reply_markup ?? '').includes('th:ok:'));
    expect(control?.body.text).toContain('Черновик для Threads');
    const id = th.state.pending!.id;
    expect(th.onUpdate({ update_id: 1, callback_query: { id: 'q', from: { id: 42 }, data: `th:ok:${id}` } } as Update, reply, answer)).toBe(true);
    await flush();
    const create = api.calls.find((c) => c.url.endsWith('/me/threads'));
    expect(create?.body).toContain('media_type=IMAGE');
    expect(create?.body).toContain(encodeURIComponent('https://arena.nikitenok.ru/api/threads/media/duel.jpg'));
    expect(th.state.pending).toBeNull();
    expect(th.state.posts.at(-1)?.topic).toBe('Как камера считает отжимания');
    expect(sent.some((c) => c.method === 'editMessageText' && String(c.body.text).includes('threads.com'))).toBe(true);
  });

  it('без токена — черновик без кнопки «Опубликовать»; ответ своим текстом заменяет текст', async () => {
    const { th, sent } = setup({ topic: 'Миф про пресс', text: 'Пресс не сжигает жир на животе.', mentions_app: false, images: [] }, '');
    await th.propose('s1');
    expect(sent.some((c) => JSON.stringify(c.body.reply_markup ?? '').includes('th:ok:'))).toBe(false);
    const preview = th.state.pending!.previews[0];
    const u = { update_id: 2, message: { message_id: 9, chat: { id: 42, type: 'private' }, text: 'Мой текст', reply_to_message: { message_id: preview } } } as unknown as Update;
    expect(th.onUpdate(u, reply, answer)).toBe(true);
    expect(th.state.pending!.draft.plain).toBe('Мой текст');
  });

  it('токен продлевается, а новый секрет важнее продлённого', async () => {
    let secret = 'OLD';
    const { th } = setup({});
    (th as unknown as { d: { threadsToken: () => string } }).d.threadsToken = () => secret;
    await th.maybeRefresh();
    expect(th.token()).toBe('NEW');
    secret = 'FRESH';
    expect(th.token()).toBe('FRESH');
  });

  it('/threads_auto on включает авто-режим', () => {
    const { th } = setup({});
    const out: string[] = [];
    expect(th.command(42, '/threads_auto on', (t) => out.push(t))).toBe(true);
    expect(th.state.auto).toBe(true);
    expect(out[0]).toContain('Авто-режим включён');
  });
});
