import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FeedStore, jpegSize } from './feed';
import { feedCommand, Pids, profileView, type SocialDeps, socialApi, statsOf } from './socialApi';
import { HIDE_AFTER_REPORTS, POSTS_PER_DAY } from '../shared/social';

// Наименьший «JPEG» для проверки: SOI и заголовок кадра 32×16.
const jpeg = (w = 32, h = 16) => {
  const b = Buffer.alloc(40);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03], 0);
  return b.toString('base64');
};

function setup() {
  let now = Date.UTC(2026, 10, 1, 12);
  const dir = mkdtempSync(join(tmpdir(), 'feed-'));
  const feed = new FeedStore(null, dir, () => now);
  const blocks = new Set<string>();
  const admin: string[] = [];
  const notices: { to: string; text: string; query: string }[] = [];
  const friends = new Set<string>();
  const progress: Record<string, unknown> = {
    'tg:1': { days: { '2026-10-01': 20, '2026-10-31': 40, '2026-11-01': 30 }, best: { pushup: { reps: 25, date: '2026-10-31' }, squat: { reps: 99999, date: 'x' } }, log: { '2026-10-31': { r: { pushup: 40 }, b: {} }, '2026-11-01': { r: { squat: 10 }, b: {} } } },
    'tg:2': { days: {} },
    'tg:3': { days: {} },
    'tg:4': { days: {} },
  };
  const pids = new Pids((t) => Buffer.from(t).toString('hex').padEnd(32, '0').slice(-32), () => Object.keys(progress));
  const d: SocialDeps = {
    feed,
    pids,
    now: () => now,
    nameOf: (id) => ({ 'tg:1': 'Аня', 'tg:2': 'Боря', 'tg:3': 'Вера', 'tg:4': 'Гена' })[id],
    heroLevel: () => 3,
    isPro: () => false,
    progress: (id) => (progress[id] as never) ?? null,
    lastSeen: () => now - 3_600_000,
    online: () => false,
    cups: () => 10,
    clan: () => undefined,
    city: () => undefined,
    exists: (id) => id in progress,
    blocked: (a, b) => blocks.has(`${a}>${b}`) || blocks.has(`${b}>${a}`),
    blockedByMe: (a, b) => blocks.has(`${a}>${b}`),
    mutedUntil: (id) => (id === 'tg:4' ? now + 1000 : 0),
    knows: (a, b) => friends.has(`${a}|${b}`) || friends.has(`${b}|${a}`),
    friendStatus: (a, b) => (friends.has(`${a}|${b}`) || friends.has(`${b}|${a}`) ? 'friends' : 'none'),
    addFriend: (me, other) => {
      friends.add(`${me.id}|${other}`);
      return { note: 'ok' };
    },
    isAdmin: (id) => id === 'tg:99',
    notifyAdmins: (t) => admin.push(t),
    notify: (to, text, _b, query) => notices.push({ to, text, query }),
    adminPhotoUrl: (id) => `https://x/${id}?a=s`,
  };
  const call = (who: string, path: string, body: Record<string, unknown> = {}) => socialApi(d, path, { id: who, name: d.nameOf(who) ?? 'Боец' }, body).body as Record<string, any>;
  return { d, feed, dir, blocks, admin, notices, call, pids, tick: (ms: number) => (now += ms) };
}

describe('лента', () => {
  it('размер JPEG из заголовка, не-JPEG отклоняется', () => {
    expect(jpegSize(Buffer.from(jpeg(640, 480), 'base64'))).toEqual({ w: 640, h: 480 });
    expect(jpegSize(Buffer.from('hello'))).toBeNull();
  });

  it('пост с фото: файл на диске, админам ничего, подписчикам — сообщение бота', () => {
    const s = setup();
    s.call('tg:2', '/api/feed/follow', { pid: s.pids.of('tg:1') });
    const r = s.call('tg:1', '/api/feed/post', { text: 'День первый', photo: jpeg() });
    expect(r.post.photo).toMatch(/^\/api\/feed\/photo\/[a-f0-9]{20}\.jpg$/);
    expect(r.post).toMatchObject({ w: 32, h: 16, mine: true, text: 'День первый' });
    expect(readdirSync(s.dir)).toHaveLength(1);
    expect(s.admin).toEqual([]);
    expect(s.notices).toEqual([expect.objectContaining({ to: 'tg:2', query: `?tab=feed&post=${r.post.id}` })]);
    // Второй пост за 12 часов подписчика не тревожит.
    s.call('tg:1', '/api/feed/post', { text: 'И ещё' });
    expect(s.notices).toHaveLength(1);
  });

  it('мат, ссылки, пустой пост, не-JPEG и запрет модератора не проходят; не больше постов в сутки', () => {
    const s = setup();
    expect(s.call('tg:1', '/api/feed/post', { text: '' }).error).toBeTruthy();
    expect(s.call('tg:1', '/api/feed/post', { text: 'заходи на example.com' }).error).toBeTruthy();
    expect(s.call('tg:1', '/api/feed/post', { photo: Buffer.from('png?').toString('base64') }).error).toBeTruthy();
    expect(s.call('tg:4', '/api/feed/post', { text: 'привет' }).error).toMatch(/запретил/);
    for (let i = 0; i < POSTS_PER_DAY; i++) expect(s.call('tg:1', '/api/feed/post', { text: `пост ${i}` }).error).toBeUndefined();
    expect(s.call('tg:1', '/api/feed/post', { text: 'лишний' }).error).toMatch(/сутки/);
    s.tick(86_400_000);
    expect(s.call('tg:1', '/api/feed/post', { text: 'новый день' }).error).toBeUndefined();
  });

  it('вкладка «Подписки», посты автора, чёрный список скрывает посты', () => {
    const s = setup();
    s.call('tg:1', '/api/feed/post', { text: 'от Ани' });
    s.tick(1000);
    s.call('tg:3', '/api/feed/post', { text: 'от Веры' });
    expect(s.call('tg:2', '/api/feed').posts.map((p: any) => p.text)).toEqual(['от Веры', 'от Ани']);
    s.call('tg:2', '/api/feed/follow', { pid: s.pids.of('tg:1') });
    expect(s.call('tg:2', '/api/feed', { tab: 'following' }).posts.map((p: any) => p.text)).toEqual(['от Ани']);
    expect(s.call('tg:2', '/api/feed', { author: s.pids.of('tg:3') }).posts.map((p: any) => p.text)).toEqual(['от Веры']);
    expect(s.call('tg:2', '/api/feed/badge').latest).toBeGreaterThan(0);
    s.blocks.add('tg:3>tg:2');
    expect(s.call('tg:2', '/api/feed').posts.map((p: any) => p.text)).toEqual(['от Ани']);
    // Заблокировавший меня не открывается.
    expect(s.call('tg:2', '/api/profile', { pid: s.pids.of('tg:3') }).error).toBeTruthy();
  });

  it('респект ставится и снимается', () => {
    const s = setup();
    const id = s.call('tg:1', '/api/feed/post', { text: 'план' }).post.id;
    expect(s.call('tg:2', '/api/feed/like', { post: id }).post).toMatchObject({ likes: 1, liked: true });
    expect(s.call('tg:2', '/api/feed/like', { post: id, on: false }).post).toMatchObject({ likes: 0, liked: false });
  });

  it('после жалоб разных игроков пост скрыт; автор видит его с пометкой; модератор решает в боте', () => {
    const s = setup();
    const id = s.call('tg:1', '/api/feed/post', { text: 'фото', photo: jpeg() }).post.id;
    const photo = s.feed.get(id)!.photo!.id;
    const reporters = ['tg:2', 'tg:3', 'tg:4'].slice(0, HIDE_AFTER_REPORTS);
    for (const r of reporters) expect(s.call(r, '/api/feed/report', { post: id }).note).toBeTruthy();
    expect(s.call('tg:2', '/api/feed/report', { post: id }).error).toBeTruthy();
    expect(s.admin.at(-1)).toContain('Пост скрыт');
    expect(s.call('tg:2', '/api/feed').posts).toHaveLength(0);
    expect(s.call('tg:1', '/api/feed').posts[0].hidden).toBe(true);
    expect(s.feed.photo(photo)).toBeNull();
    expect(s.feed.photo(photo, true)).not.toBeNull();
    expect(feedCommand(s.d, 5, `/okpost_${id}`)).toBeNull();
    expect(feedCommand(s.d, 99, `/okpost_${id}`)).toMatch(/снова виден/);
    expect(s.call('tg:2', '/api/feed').posts).toHaveLength(1);
    expect(feedCommand(s.d, 99, `/delpost_${id}`)).toMatch(/удалён/);
    expect(s.call('tg:1', '/api/feed').posts).toHaveLength(0);
    expect(readdirSync(s.dir)).toHaveLength(0);
  });

  it('удалить пост может автор и админ, но не другой игрок', () => {
    const s = setup();
    const id = s.call('tg:1', '/api/feed/post', { text: 'a' }).post.id;
    expect(s.call('tg:2', '/api/feed/delete', { post: id }).error).toBeTruthy();
    expect(s.call('tg:1', '/api/feed/delete', { post: id }).ok).toBe(true);
  });

  it('«Удалить мои данные» стирает посты, фото, подписки и респекты', () => {
    const s = setup();
    s.call('tg:1', '/api/feed/post', { text: 'x', photo: jpeg() });
    const other = s.call('tg:2', '/api/feed/post', { text: 'y' }).post.id;
    s.call('tg:1', '/api/feed/like', { post: other });
    s.call('tg:1', '/api/feed/follow', { pid: s.pids.of('tg:2') });
    s.call('tg:3', '/api/feed/follow', { pid: s.pids.of('tg:1') });
    s.feed.forget('tg:1');
    expect(readdirSync(s.dir)).toHaveLength(0);
    expect(s.feed.get(other)!.likes).toEqual([]);
    expect(s.feed.followersOf('tg:2')).toEqual([]);
    expect(s.feed.followingOf('tg:3')).toEqual([]);
  });
});

describe('профиль', () => {
  it('по pid: статистика, лучший подход (неправдоподобный отброшен), любимое упражнение', () => {
    const s = setup();
    const p = s.call('tg:2', '/api/profile', { pid: s.pids.of('tg:1') }).profile;
    expect(p).toMatchObject({ name: 'Аня', me: false, since: '2026-10-01', activeDays: 3, totalReps: 90, favorite: 'pushup', friend: 'none', iFollow: false, lastSeen: '2026-11-01' });
    expect(p.best).toEqual([{ exercise: 'pushup', reps: 25, date: '2026-10-31' }]);
    expect(p).not.toHaveProperty('id');
  });

  it('по id — только друг; без параметров — свой', () => {
    const s = setup();
    expect(s.call('tg:2', '/api/profile', { id: 'tg:1' }).error).toBeTruthy();
    s.call('tg:2', '/api/feed/friend', { pid: s.pids.of('tg:1') });
    expect(s.call('tg:2', '/api/profile', { id: 'tg:1' }).profile.friend).toBe('friends');
    expect(s.call('tg:2', '/api/profile').profile).toMatchObject({ me: true, friend: 'self' });
  });

  it('подписка меняет счётчики', () => {
    const s = setup();
    const r = s.call('tg:2', '/api/feed/follow', { pid: s.pids.of('tg:1') }).profile;
    expect(r).toMatchObject({ iFollow: true, followers: 1 });
    expect(profileView(s.d, 'tg:2', 'tg:2').following).toBe(1);
    expect(s.call('tg:2', '/api/feed/follow', { pid: s.pids.of('tg:1'), on: false }).profile.followers).toBe(0);
  });

  it('pid находится и после перезапуска (обратной таблицы ещё нет)', () => {
    const s = setup();
    const pid = s.pids.of('tg:3');
    const fresh = new Pids((t) => Buffer.from(t).toString('hex').padEnd(32, '0').slice(-32), () => ['tg:1', 'tg:3']);
    expect(fresh.idOf(pid)).toBe('tg:3');
    expect(fresh.idOf('zz')).toBeUndefined();
  });

  it('статистика пустого героя', () => {
    expect(statsOf(null, Date.now())).toMatchObject({ since: null, activeDays: 0, streak: 0, totalReps: 0, best: [], favorite: null });
  });
});
