// Профили игроков и лента: POST /api/profile, /api/feed, /api/feed/{post,delete,like,report,follow,friend,badge},
// GET /api/feed/photo/<id>.jpg. Всё, что нужно от остального сервера, приходит в deps (как в server/friendsApi.ts).
//
// Публичный id профиля (pid) — подпись id игрока ключом сервера: по нему профиль открывают из топов и ленты,
// а сам id игрока (tg:123) наружу не уходит. Друзья и соклановцы и так знают id друг друга — им можно и по id.
//
// Модерация (выбор владельца, 2026-11-01): пост виден сразу, копий админам нет — только жалобы. О каждой жалобе
// админам приходит ссылка на фото и /delpost_ID; после HIDE_AFTER_REPORTS жалоб пост скрыт, ещё и /okpost_ID. Игрок под запретом писать
// (server/moderation.ts) посты не публикует. Посты тех, кто в чёрном списке (в любую сторону), не видны.
import { heroLevel, heroXp, streak, type Progress } from '../src/game/progress';
import { type Exercise, repsEquivalent } from '../src/repCounter';
import { type FeedTab, type FriendStatus, NPC_IDS, type NpcId, type ProfileClan, type PostView, type ProfileView, FEED_PAGE } from '../shared/social';
import { type FeedStore, isNpc, type Post } from './feed';
import { DAY_REPS_MAX } from './saves';

type Reply = { status: number; body: unknown };
type Me = { id: string; name: string };

/** Публичные id профилей: pid ↔ id игрока. */
export class Pids {
  private toPid = new Map<string, string>();
  private toId = new Map<string, string>();

  constructor(
    private readonly sign: (text: string) => string,
    // Все известные серверу игроки: если pid ещё не встречался после перезапуска, ищем среди них.
    private readonly known: () => Iterable<string>,
  ) {}

  of(id: string): string {
    let pid = this.toPid.get(id);
    if (!pid) {
      pid = this.sign(`pid:${id}`).slice(0, 16);
      this.toPid.set(id, pid);
      this.toId.set(pid, id);
    }
    return pid;
  }

  idOf(pid: unknown): string | undefined {
    if (typeof pid !== 'string' || !/^[a-f0-9]{16}$/.test(pid)) return;
    const hit = this.toId.get(pid);
    if (hit) return hit;
    for (const id of this.known()) if (this.of(id) === pid) return id;
  }
}

export interface SocialDeps {
  feed: FeedStore;
  pids: Pids;
  now: () => number;
  // Свежее имя игрока, если сервер его знает.
  nameOf: (id: string) => string | undefined;
  heroLevel: (id: string) => number | null;
  isPro: (id: string) => boolean;
  progress: (id: string) => Partial<Progress> | null;
  // Когда игрок последний раз был в игре (мс), если известно, и в сети ли он сейчас.
  lastSeen: (id: string) => number | null;
  online: (id: string) => boolean;
  cups: (id: string) => number;
  // Клан игрока id глазами игрока viewer (можно ли вступить).
  clan: (id: string, viewer: string) => ProfileClan | undefined;
  city: (id: string) => string | undefined;
  // Такой игрок вообще есть (есть копия прогресса или профиль дуэлей).
  exists: (id: string) => boolean;
  // Кто-то из двоих заблокировал другого; я заблокировал его.
  blocked: (a: string, b: string) => boolean;
  blockedByMe: (me: string, other: string) => boolean;
  // До какого времени игроку нельзя писать (запрет модератора), 0 — можно.
  mutedUntil: (id: string) => number;
  // Друг или соклановец: его id мне и так известен.
  knows: (me: string, other: string) => boolean;
  friendStatus: (me: string, other: string) => FriendStatus;
  addFriend: (me: Me, other: string, otherName: string) => { error?: string; note?: string };
  isAdmin: (id: string) => boolean;
  notifyAdmins: (text: string) => void;
  // Несрочное сообщение бота подписчику (ночью ждёт утра).
  notify: (to: string, text: string, button: string, query: string) => void;
  // Адрес фото для админа (с подписью: видно и скрытое).
  adminPhotoUrl: (photoId: string) => string;
  // Автопосты включены/выключены в настройках игрока (сервер сам пишет о победе в вызове чата).
  setAutoPosts?: (id: string, on: boolean) => void;
  // Записать жалобу в общий журнал жалоб (server/reports.ts).
  report?: (from: Me, target: string, targetName: string, text: string) => void;
}

// Подписчику пишем о новых постах автора не чаще раза в 12 часов.
export const FOLLOWER_NOTICE_GAP = 12 * 3_600_000;
// Рекорд подхода, которому верим (больше — опечатка или подмена копии).
const BEST_MAX = 1000;
const PLANK_MAX = 3600;
const EXERCISES: Exercise[] = ['pushup', 'squat', 'situp', 'plank'];
const lastNotice = new Map<string, number>();
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const tgNum = (id: string) => (/^tg:\d+$/.test(id) ? id.slice(3) : null);

const nameOf = (d: SocialDeps, id: string, fallback = 'Боец') => d.nameOf(id) ?? d.feed.nameOf(id) ?? fallback;
const levelOf = (d: SocialDeps, id: string) => {
  const l = d.heroLevel(id);
  if (l !== null) return l;
  const p = d.progress(id);
  return heroLevel(heroXp({ days: p?.days ?? {}, stars: p?.stars ?? {} } as Progress)).level;
};

export function postView(d: SocialDeps, p: Post, viewer: string): PostView {
  return {
    id: p.id,
    author: isNpc(p.author)
      ? { pid: `npc-${p.author.slice(4)}`, name: p.name, level: 0, npc: (NPC_IDS as readonly string[]).includes(p.author.slice(4)) ? (p.author.slice(4) as NpcId) : undefined }
      : { pid: d.pids.of(p.author), name: nameOf(d, p.author, p.name), level: levelOf(d, p.author), pro: d.isPro(p.author) || undefined },
    text: p.text,
    ...(p.photo ? { photo: `/api/feed/photo/${p.photo.id}.jpg`, w: p.photo.w, h: p.photo.h } : {}),
    at: p.at,
    likes: p.likes.length,
    liked: p.likes.includes(viewer),
    mine: p.author === viewer,
    ...(p.hidden ? { hidden: true } : {}),
    ...(p.card ? { card: p.card } : {}),
  };
}

/** Статистика игрока из его копии прогресса: только правдоподобное. */
export function statsOf(p: Partial<Progress> | null, now: number) {
  const latest = day(now + 14 * 3_600_000);
  const days = Object.entries(p?.days ?? {}).filter(([k, n]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && k <= latest && Number(n) > 0);
  const trained = days.map(([k]) => k).sort();
  const totalReps = days.reduce((s, [, n]) => s + Math.min(DAY_REPS_MAX, Math.floor(Number(n) || 0)), 0);
  const best = EXERCISES.flatMap((ex) => {
    const b = p?.best?.[ex];
    const reps = Math.floor(Number(b?.reps) || 0);
    if (reps <= 0 || reps > (ex === 'plank' ? PLANK_MAX : BEST_MAX)) return [];
    return [{ exercise: ex, reps, date: typeof b?.date === 'string' ? b.date.slice(0, 10) : '' }];
  });
  // Что получается лучше всего: больше всего повторов за всё время (планка — в пересчёте секунд на повторы).
  const sums = new Map<Exercise, number>();
  for (const [k, e] of Object.entries(p?.log ?? {})) {
    if (k > latest) continue;
    for (const ex of EXERCISES) sums.set(ex, (sums.get(ex) ?? 0) + Math.min(DAY_REPS_MAX, repsEquivalent(ex, Number(e?.r?.[ex]) || 0)));
  }
  let favorite: Exercise | null = null;
  for (const [ex, n] of sums) if (n > 0 && (!favorite || n > sums.get(favorite)!)) favorite = ex;
  if (!favorite && best.length) favorite = best.reduce((a, b) => (repsEquivalent(b.exercise, b.reps) > repsEquivalent(a.exercise, a.reps) ? b : a)).exercise;
  return {
    since: trained[0] ?? null,
    activeDays: trained.length,
    streak: trained.length ? streak(Object.fromEntries(days.map(([k, n]) => [k, Number(n)])), now, Array.isArray(p?.freezes) ? p.freezes : []).days : 0,
    totalReps,
    best,
    favorite,
    lastDay: trained[trained.length - 1] ?? null,
  };
}

export function profileView(d: SocialDeps, me: string, id: string): ProfileView {
  const now = d.now();
  const s = statsOf(d.progress(id), now);
  const online = d.online(id);
  const seen = d.lastSeen(id);
  const lastSeen = [seen ? day(seen) : null, s.lastDay].filter((x): x is string => !!x).sort().at(-1) ?? null;
  return {
    pid: d.pids.of(id),
    name: nameOf(d, id),
    me: me === id,
    level: levelOf(d, id),
    pro: d.isPro(id) || undefined,
    clan: d.clan(id, me),
    city: d.city(id),
    cups: d.cups(id),
    online,
    lastSeen,
    since: s.since,
    activeDays: s.activeDays,
    streak: s.streak,
    totalReps: s.totalReps,
    best: s.best,
    favorite: s.favorite,
    followers: d.feed.followersOf(id).filter((f) => !d.blocked(f, id)).length,
    following: d.feed.followingOf(id).length,
    posts: d.feed.countBy(id),
    iFollow: d.feed.isFollowing(me, id),
    friend: me === id ? 'self' : d.friendStatus(me, id),
    ...(me !== id && d.blockedByMe(me, id) ? { blocked: true } : {}),
  };
}

/** Чей профиль просят: по pid, по id (только друг или соклановец) или свой. */
function target(d: SocialDeps, me: string, body: Record<string, unknown>): string | null {
  if (body.pid !== undefined) return d.pids.idOf(body.pid) ?? null;
  if (typeof body.id === 'string') return body.id === me || d.knows(me, body.id) ? body.id : null;
  return me;
}

const quote = (s: string) => s.replace(/\s+/g, ' ').slice(0, 300);

function notifyFollowers(d: SocialDeps, p: Post, name: string) {
  const now = d.now();
  for (const f of d.feed.followersOf(p.author)) {
    if (d.blocked(f, p.author)) continue;
    const key = `${f}>${p.author}`;
    if (now - (lastNotice.get(key) ?? -Infinity) < FOLLOWER_NOTICE_GAP) continue;
    lastNotice.set(key, now);
    d.notify(f, `🆕 ${name} опубликовал новый пост в ленте NikitenokArena${p.text ? `:\n\n«${quote(p.text).slice(0, 140)}»` : ''}`, 'Открыть', `?tab=feed&post=${p.id}`);
  }
  if (lastNotice.size > 50_000) lastNotice.clear();
}

function adminPostText(d: SocialDeps, p: Post, head: string): string {
  const n = tgNum(p.author);
  const lines = [head, `Автор: ${nameOf(d, p.author, p.name)} (${p.author})`];
  if (p.text) lines.push(`Текст: «${quote(p.text)}»`);
  if (p.photo) lines.push(`Фото: ${d.adminPhotoUrl(p.photo.id)}`);
  lines.push('', `Удалить пост: /delpost_${p.id}`);
  if (p.hidden) lines.push(`Оставить и показать: /okpost_${p.id}`);
  if (n) lines.push(`Запретить писать: /mute_${n}_7d`);
  return lines.join('\n');
}

/** Один запрос ленты или профиля от игрока me (уже проверенного). */
export function socialApi(d: SocialDeps, path: string, me: Me, body: Record<string, unknown>): Reply {
  const now = d.now();
  const fail = (error: string, status = 200): Reply => ({ status, body: { error } });
  const visible = (p: Post) => !d.blocked(me.id, p.author);
  switch (path) {
    case '/api/profile': {
      const id = target(d, me.id, body);
      if (!id || (id !== me.id && !d.exists(id))) return fail('Игрок не найден', 404);
      if (id !== me.id && d.blocked(id, me.id) && !d.blockedByMe(me.id, id)) return fail('Игрок не найден', 404);
      return { status: 200, body: { profile: profileView(d, me.id, id) } };
    }
    case '/api/feed': {
      const tab: FeedTab = body.tab === 'following' ? 'following' : 'all';
      const before = Number(body.before) > 0 ? Number(body.before) : Infinity;
      const author = body.author !== undefined ? target(d, me.id, { pid: body.author }) : null;
      if (body.author !== undefined && !author) return { status: 200, body: { posts: [], more: false } };
      const following = tab === 'following' && !author ? new Set(d.feed.followingOf(me.id)) : null;
      const page = d.feed.page(me.id, (p) => visible(p) && (!author || p.author === author) && (!following || following.has(p.author) || p.author === me.id), before, FEED_PAGE);
      return { status: 200, body: { posts: page.posts.map((p) => postView(d, p, me.id)), more: page.more } };
    }
    case '/api/feed/badge':
      return { status: 200, body: { latest: d.feed.latestFollowed(me.id, visible) } };
    case '/api/feed/post': {
      const muted = d.mutedUntil(me.id);
      if (muted > now) return fail('Модератор запретил тебе писать. Публиковать посты пока нельзя');
      const r = d.feed.add(me.id, me.name, body.text, body.photo);
      if (typeof r === 'string') return fail(r);
      notifyFollowers(d, r, me.name);
      return { status: 200, body: { post: postView(d, r, me.id) } };
    }
    case '/api/feed/autopref':
      d.setAutoPosts?.(me.id, body.on !== false);
      return { status: 200, body: { ok: true } };
    case '/api/feed/auto': {
      // Автопост о событии: тот же запрет модератора, но подписчикам не пишем — это не их новость.
      if (d.mutedUntil(me.id) > now) return fail('Модератор запретил тебе писать. Публиковать посты пока нельзя');
      const r = d.feed.addAuto(me.id, me.name, body.kind, body.text, body.card, body.photo);
      if (typeof r === 'string') return fail(r);
      return { status: 200, body: { post: postView(d, r, me.id) } };
    }
    case '/api/feed/delete': {
      const p = d.feed.get(body.post);
      if (!p) return fail('Пост не найден');
      if (p.author !== me.id && !d.isAdmin(me.id)) return fail('Удалить можно только свой пост');
      d.feed.remove(p.id);
      return { status: 200, body: { ok: true } };
    }
    case '/api/feed/like': {
      const p = d.feed.get(body.post);
      if (!p || !visible(p)) return fail('Пост не найден');
      const r = d.feed.like(p.id, me.id, body.on !== false);
      if (typeof r === 'string') return fail(r);
      return { status: 200, body: { post: postView(d, r, me.id) } };
    }
    case '/api/feed/report': {
      if (isNpc(d.feed.get(body.post)?.author ?? '')) return fail('Это пост персонажа игры');
      const r = d.feed.report(String(body.post ?? ''), me.id);
      if (typeof r === 'string') return fail(r);
      d.report?.(me, r.post.author, nameOf(d, r.post.author, r.post.name), r.post.text || '(фото без текста)');
      d.notifyAdmins(adminPostText(d, r.post, r.hiddenNow ? `🚩 Пост скрыт: жалоб ${r.count}` : `🚩 Жалоба на пост (${r.count})`));
      return { status: 200, body: { note: 'Жалоба отправлена. Спасибо, модератор посмотрит' } };
    }
    case '/api/feed/follow':
    case '/api/feed/friend': {
      const id = target(d, me.id, body);
      if (!id || id === me.id || !d.exists(id)) return fail('Игрок не найден');
      if (d.blocked(me.id, id)) return fail('Этот игрок недоступен');
      let note: string | undefined;
      if (path === '/api/feed/follow') {
        const err = d.feed.follow(me.id, id, body.on !== false);
        if (err) return fail(err);
      } else {
        const r = d.addFriend(me, id, nameOf(d, id));
        if (r.error) return { status: 200, body: { error: r.error, profile: profileView(d, me.id, id) } };
        note = r.note;
      }
      return { status: 200, body: { profile: profileView(d, me.id, id), note } };
    }
  }
  return { status: 404, body: { error: 'not found' } };
}

/** Команды админа в боте: /delpost_ID — удалить пост, /okpost_ID — оставить скрытый пост. null — не команда ленты. */
export function feedCommand(d: SocialDeps, chatId: number, text: string): string | null {
  const t = text.trim();
  const m = /^\/(delpost|okpost)[_\s]+([a-f0-9]{16})\b/.exec(t);
  if (!m || !d.isAdmin(`tg:${chatId}`)) return null;
  if (m[1] === 'delpost') {
    const p = d.feed.remove(m[2]);
    return p ? `🗑 Пост ${nameOf(d, p.author, p.name)} удалён.` : 'Такого поста уже нет.';
  }
  const p = d.feed.approve(m[2]);
  return p ? `✅ Пост ${nameOf(d, p.author, p.name)} снова виден всем, жалобы больше его не скроют.` : 'Такого поста уже нет.';
}
