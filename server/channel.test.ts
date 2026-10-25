import { describe, expect, it } from 'vitest';
import https from 'node:https';
import { Channel, type ChannelPost, type ChannelState, dueSlot, freshCommits, parseChangelog, planPost, telegramHtml, userPrompt } from './channel';

const msk = (iso: string) => Date.parse(`${iso}+03:00`);
const post = (at: number, rubric: ChannelPost['rubric'], mentionsApp = false, extra: Partial<ChannelPost> = {}): ChannelPost => ({ at, slot: String(at), rubric, topic: `тема ${rubric}`, mentionsApp, ...extra });
const LOG = ['c3|2026-10-25T10:00:00+03:00|Деревня ночью: огни в окнах', 'c2|2026-10-24T10:00:00+03:00|Merge branch x', 'c1|2026-10-23T10:00:00+03:00|Village: decor sizes', 'c0|2026-10-22T10:00:00+03:00|Ловушки и хранитель'].join('\n');

describe('канал: расписание', () => {
  it('слоты 10:00 и 19:00 по Москве, раз в слот, поздно — пропуск', () => {
    const s: ChannelState = { posts: [] };
    expect(dueSlot(msk('2026-10-26T09:59:00'), s)).toBeNull();
    expect(dueSlot(msk('2026-10-26T10:00:00'), s)).toBe('2026-10-26 10');
    expect(dueSlot(msk('2026-10-26T12:30:00'), s)).toBe('2026-10-26 10');
    expect(dueSlot(msk('2026-10-26T13:30:00'), s)).toBeNull();
    expect(dueSlot(msk('2026-10-26T19:05:00'), s)).toBe('2026-10-26 19');
    s.posts.push({ ...post(msk('2026-10-26T19:01:00'), 'tip'), slot: '2026-10-26 19' });
    expect(dueSlot(msk('2026-10-26T19:05:00'), s)).toBeNull();
    expect(dueSlot(msk('2026-10-27T02:00:00'), s)).toBeNull();
  });
});

describe('канал: рубрики', () => {
  it('история изменений без слияний, свежие — после последней новости', () => {
    const c = parseChangelog(LOG);
    expect(c.map((x) => x.hash)).toEqual(['c3', 'c1', 'c0']);
    expect(freshCommits(c, { posts: [post(1, 'news', true, { commit: 'c1' })] }).map((x) => x.hash)).toEqual(['c3']);
  });
  it('новости вечером, когда накопились изменения; иначе обычные рубрики по кругу', () => {
    const c = parseChangelog(LOG);
    const now = msk('2026-10-26T19:00:00');
    expect(planPost(now, { posts: [] }, c).rubric).toBe('news');
    expect(planPost(msk('2026-10-26T10:00:00'), { posts: [] }, c).rubric).toBe('tip');
    const posts = [post(now - 3 * 86400_000, 'tip'), post(now - 2 * 86400_000, 'breakdown'), post(now - 86400_000, 'app', true)];
    const p = planPost(msk('2026-10-26T10:00:00'), { posts }, c);
    expect(p.rubric).toBe('compare');
    // Приложение упоминали недавно — в обычном посте молчим.
    expect(p.mentionsApp).toBe(false);
  });
  it('упоминание приложения примерно в 1–2 постах из 5', () => {
    const s: ChannelState = { posts: [] };
    let t = msk('2026-11-02T10:00:00');
    for (let i = 0; i < 40; i++) {
      const plan = planPost(t, s, []);
      s.posts.push(post(t, plan.rubric, plan.mentionsApp));
      t += 12 * 3_600_000;
    }
    const share = s.posts.filter((p) => p.mentionsApp).length / s.posts.length;
    expect(share).toBeGreaterThanOrEqual(0.2);
    expect(share).toBeLessThanOrEqual(0.4);
    // Две одинаковые рубрики подряд не выходят.
    expect(s.posts.some((p, i) => i > 0 && s.posts[i - 1].rubric === p.rubric)).toBe(false);
  });
  it('промпт: прошлые темы, факты о приложении только когда можно его упомянуть', () => {
    const recent = [post(1, 'tip')];
    const quiet = userPrompt({ now: msk('2026-10-26T10:00:00'), rubric: 'tip', mentionsApp: false, recent, commits: [] });
    expect(quiet).toContain('тема tip');
    expect(quiet).toContain('не упоминай');
    expect(quiet).not.toContain('Факты о приложении');
    const news = userPrompt({ now: msk('2026-10-26T19:00:00'), rubric: 'news', mentionsApp: true, recent, commits: parseChangelog(LOG) });
    expect(news).toContain('Деревня ночью');
    expect(news).toContain('Факты о приложении');
  });
});

describe('канал: текст и публикация', () => {
  it('HTML для Telegram: только <b> и <i>, остальное экранируется', () => {
    expect(telegramHtml('<b>Заголовок</b>\n\n5 < 10 & <script>x</script> <i>ок</i>')).toBe('<b>Заголовок</b>\n\n5 &lt; 10 &amp; &lt;script&gt;x&lt;/script&gt; <i>ок</i>');
  });
  it('пишет пост через Claude и публикует в канал, тему запоминает', async () => {
    const bodies: Record<string, unknown>[] = [];
    const sent: Record<string, unknown>[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      const text = JSON.stringify({ topic: 'Глубина приседа', text: '<b>Как глубоко приседать</b>\n\nБёдра до параллели.', mentions_app: false });
      return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const ch = new Channel(null, {
      apiKey: () => 'sk-test',
      channel: '@NikitenokArena',
      agent: () => new https.Agent(),
      changelog: () => '',
      bot: async (method, body) => (sent.push({ method, ...(body as object) }), { ok: true, result: { message_id: 7 } }),
      appLink: () => 'https://t.me/ArenaNikitenokBot?startapp',
      fetch: fakeFetch,
    });
    const p = await ch.publish('2026-10-26 10', msk('2026-10-26T10:00:00'));
    expect(bodies[0].model).toBe('claude-opus-5-5');
    expect(bodies[0].fallbacks).toBe('default');
    expect(sent[0]).toMatchObject({ method: 'sendMessage', chat_id: '@NikitenokArena', parse_mode: 'HTML', text: '<b>Как глубоко приседать</b>\n\nБёдра до параллели.' });
    expect(p).toMatchObject({ topic: 'Глубина приседа', messageId: 7, rubric: 'tip' });
    expect(ch.state.posts).toHaveLength(1);
    expect(dueSlot(msk('2026-10-26T10:05:00'), ch.state)).toBe(null);
  });
  it('через подписку: Claude Code пишет пост, при ошибке — запасной ключ API', async () => {
    const sent: Record<string, unknown>[] = [];
    let apiCalls = 0;
    const answer = JSON.stringify({ topic: 'Планка', text: '<b>Планка</b>\n\nСпина прямая.', mentions_app: false });
    const fakeFetch = (async () => {
      apiCalls++;
      return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: answer }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    let fail = false;
    const deps = (apiKey: string) => ({
      apiKey: () => apiKey,
      claudeToken: () => 'tok',
      claudeCode: async (system: string, prompt: string) => {
        expect(system).toContain('NikitenokArena');
        expect(prompt).toContain('только JSON');
        if (fail) throw new Error('Claude Code: 401');
        return `Вот пост:\n${answer}`;
      },
      channel: '@NikitenokArena',
      agent: () => new https.Agent(),
      changelog: () => '',
      bot: async (method: string, body: unknown) => (sent.push({ method, ...(body as object) }), { ok: true, result: { message_id: 1 } }),
      appLink: () => '',
      fetch: fakeFetch,
    });
    const sub = new Channel(null, deps(''));
    expect((await sub.draft()).topic).toBe('Планка');
    expect(apiCalls).toBe(0);
    fail = true;
    await expect(sub.draft()).rejects.toThrow('401');
    const both = new Channel(null, deps('sk-test'));
    expect((await both.draft()).topic).toBe('Планка');
    expect(apiCalls).toBe(1);
  });
});

