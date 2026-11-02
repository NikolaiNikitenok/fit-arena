import { describe, expect, it } from 'vitest';
import { cleanCard, FeedStore } from './feed';
import { dailyPost, dueNpcSlot, NpcFeed, taskPost, TIP_POOL } from './npcFeed';
import { postView, Pids, type SocialDeps, socialApi } from './socialApi';
import { AUTO_PER_DAY, AUTO_PER_KIND, POSTS_PER_DAY } from '../shared/social';
import { milestones } from '../src/social/milestones';

const MSK = 3 * 3_600_000;
const at = (date: string, h: number, m = 0) => Date.parse(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`) - MSK;

describe('npc slots', () => {
  it('pick the slot that started less than two hours ago, once', () => {
    expect(dueNpcSlot(at('2026-11-02', 8, 59), [])).toBeNull();
    expect(dueNpcSlot(at('2026-11-02', 9, 5), [])).toEqual({ key: '2026-11-02 09', kind: 'daily' });
    expect(dueNpcSlot(at('2026-11-02', 9, 5), ['2026-11-02 09'])).toBeNull();
    expect(dueNpcSlot(at('2026-11-02', 13, 30), [])).toEqual({ key: '2026-11-02 13', kind: 'tip' });
    // Сервер лежал: слот 13:00 в 16:00 уже не наверстываем.
    expect(dueNpcSlot(at('2026-11-02', 16), [])).toBeNull();
    expect(dueNpcSlot(at('2026-11-02', 20), [])).toEqual({ key: '2026-11-02 19', kind: 'task' });
  });
});

describe('npc posts', () => {
  it('daily summary names the leader and counts players', () => {
    const p = dailyPost({ players: 5, reps: 1240, top: [{ name: 'Коля', reps: 400 }, { name: 'Аня', reps: 300 }] }, 0);
    expect(p.npc).toBe('grom');
    expect(p.text).toContain('5 бойцов');
    expect(p.text).toContain('Коля: 400');
    expect(p.card?.kind).toBe('daily');
  });
  it('quiet day still posts something', () => {
    expect(dailyPost({ players: 0, reps: 0, top: [] }, 1).text.length).toBeGreaterThan(20);
  });
  it('evening task comes from Lisa', () => {
    expect(taskPost(3).npc).toBe('lisa');
  });
  it('tip falls back to the pool when Claude fails, and rotates characters', async () => {
    const posted: { npc: string; text: string }[] = [];
    const f = new NpcFeed(null, {
      now: () => at('2026-11-02', 13, 1),
      yesterday: () => ({ players: 0, reps: 0, top: [] }),
      post: (p) => posted.push(p),
      write: async () => {
        throw new Error('нет ключа');
      },
    });
    await f.write('tip');
    await f.write('tip');
    expect(posted.map((p) => p.npc)).toEqual(['grom', 'marfa']);
    expect(TIP_POOL.marfa).toContain(posted[1].text);
  });
  it('rejects Claude text with links', async () => {
    const posted: { text: string }[] = [];
    const f = new NpcFeed(null, { now: () => 0, yesterday: () => ({ players: 0, reps: 0, top: [] }), post: (p) => posted.push(p), write: async () => ({ topic: 'x', text: 'Заходи на https://spam.example и тренируйся каждый день' }) });
    await f.write('tip');
    expect(posted[0].text).not.toContain('http');
  });
  it('tick writes each slot once', async () => {
    let n = 0;
    const f = new NpcFeed(null, { now: () => at('2026-11-02', 19, 10), yesterday: () => ({ players: 0, reps: 0, top: [] }), post: () => n++ });
    await f.tick();
    await f.tick();
    expect(n).toBe(1);
  });
});

describe('auto posts', () => {
  const card = { title: 'Победа', value: '★★★' };
  it('have their own daily limits and do not eat manual posts', () => {
    const feed = new FeedStore(null, null, () => Date.UTC(2026, 10, 2, 12));
    for (let i = 0; i < AUTO_PER_KIND.win; i++) expect(typeof feed.addAuto('tg:1', 'Коля', 'win', 'Прошёл', card)).toBe('object');
    expect(feed.addAuto('tg:1', 'Коля', 'win', 'Прошёл', card)).toBe('На сегодня хватит');
    expect(typeof feed.addAuto('tg:1', 'Коля', 'boss', 'Босс', card)).toBe('object');
    for (let i = 0; i < POSTS_PER_DAY; i++) expect(typeof feed.add('tg:1', 'Коля', `пост ${i}`, null)).toBe('object');
    expect(AUTO_PER_DAY).toBeGreaterThan(AUTO_PER_KIND.win);
  });
  it('reject unknown kinds, swearing and links in cards', () => {
    const feed = new FeedStore(null, null);
    expect(feed.addAuto('tg:1', 'Коля', 'hack', '', card)).toBe('Неизвестное событие');
    expect(cleanCard({ title: 'смотри t.me/spam' }, 'win')).toBe('Без мата и ссылок');
    expect(cleanCard({ title: '' }, 'win')).toBe('Нет карточки');
    expect(cleanCard({ title: 'x'.repeat(100), value: 'y'.repeat(100) }, 'streak')).toEqual({ kind: 'streak', title: 'x'.repeat(48), value: 'y'.repeat(32) });
  });
  it('npc posts show the character, without profile, and cannot be reported', () => {
    const feed = new FeedStore(null, null);
    const p = feed.addNpc('grom', 'Мастер Гром', 'Совет дня', { kind: 'tip', title: 'Совет' });
    const d = { feed, pids: new Pids((t) => t.padEnd(16, '0').slice(0, 16), () => []), isPro: () => false, nameOf: () => undefined, heroLevel: () => 1, progress: () => null, now: Date.now, blocked: () => false } as unknown as SocialDeps;
    const v = postView(d, p, 'tg:1');
    expect(v.author).toMatchObject({ pid: 'npc-grom', name: 'Мастер Гром', npc: 'grom' });
    expect(v.card?.kind).toBe('tip');
    expect(socialApi(d, '/api/feed/report', { id: 'tg:1', name: 'Коля' }, { post: p.id }).body).toEqual({ error: 'Это пост персонажа игры' });
  });
});

describe('milestones', () => {
  it('post a new streak or every fifth hero level once', () => {
    expect(milestones({ streak: 2, level: 0 }, 3, 4)).toEqual({ streak: 3 });
    expect(milestones({ streak: 3, level: 0 }, 6, 5)).toEqual({ level: 5 });
    expect(milestones({ streak: 7, level: 5 }, 7, 9)).toEqual({});
    expect(milestones({ streak: 7, level: 5 }, 15, 10)).toEqual({ streak: 14, level: 10 });
  });
});
