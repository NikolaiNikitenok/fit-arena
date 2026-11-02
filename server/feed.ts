// Лента: посты игроков с фото, «респекты», подписки и жалобы на посты.
// Посты и подписки — в JSON-файле (как друзья и кланы: игроков немного), фото — файлами рядом (<dir>/<id>.jpg).
// Методы возвращают строку с ошибкой, если действие нельзя выполнить: её показываем игроку.
//
// Модерация фото (решение владельца, 2026-11-01): пост виден сразу, без копий админам; после жалоб
// HIDE_AFTER_REPORTS разных игроков пост скрывается до решения модератора (бот пишет админам о каждой жалобе).
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { hasLink } from './moderation';
import { hasProfanity } from '../shared/profanity';
import { AUTO_KINDS, AUTO_PER_DAY, AUTO_PER_KIND, type AutoKind, type CardKind, FEED_PAGE, HIDE_AFTER_REPORTS, PHOTO_MAX_BYTES, POST_TEXT_MAX, POSTS_PER_DAY, type PostCardData } from '../shared/social';

const DAY = 86_400_000;
// Подписок у одного игрока — не больше (подписчиков сколько угодно).
export const FOLLOW_MAX = 1000;
// Хранить постов всего: старые уходят вместе с фото.
export const POSTS_KEEP = 20_000;
const POST_ID = /^[a-f0-9]{16}$/;
const PHOTO_ID = /^[a-f0-9]{20}$/;

export interface Post {
  id: string;
  author: string;
  // Имя автора на момент поста (дальше показываем свежее, если сервер его знает).
  name: string;
  text: string;
  photo?: { id: string; w: number; h: number };
  at: number;
  likes: string[];
  // Кто пожаловался (разные игроки).
  reports?: string[];
  // Скрыт по жалобам, пока модератор не решит; ok — модератор оставил (жалобы больше не скрывают).
  hidden?: boolean;
  ok?: boolean;
  // Автопост о событии игрока (вид события) и карточка события вместо фото.
  auto?: AutoKind;
  card?: PostCardData;
}

// Автор-персонаж: «npc:grom».
export const isNpc = (author: string) => author.startsWith('npc:');
const CARD_KINDS: readonly CardKind[] = [...AUTO_KINDS, 'daily', 'tip', 'task'];
const cut = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** Карточка события из запроса: только известные виды, короткие строки, без мата и ссылок. */
export function cleanCard(raw: unknown, kind: CardKind): PostCardData | string {
  const c = (raw ?? {}) as Record<string, unknown>;
  const card: PostCardData = { kind, title: cut(c.title, 48) };
  const value = cut(c.value, 32);
  const sub = cut(c.sub, 80);
  if (value) card.value = value;
  if (sub) card.sub = sub;
  if (!CARD_KINDS.includes(kind) || !card.title) return 'Нет карточки';
  const all = `${card.title} ${value} ${sub}`;
  if (hasProfanity(all) || hasLink(all)) return 'Без мата и ссылок';
  return card;
}

interface FeedFile {
  posts: Post[];
  follows: Record<string, string[]>;
}

/** Размер JPEG из заголовка SOF: ширина и высота, или null, если это не JPEG. */
export function jpegSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    // Маркеры без длины.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    // SOF0..SOF15, кроме DHT (C4), JPG (C8) и DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const h = buf.readUInt16BE(i + 5);
      const w = buf.readUInt16BE(i + 7);
      return w > 0 && h > 0 ? { w, h } : null;
    }
    i += 2 + len;
  }
  return null;
}

/** Фото поста из base64: null — фото нет, строка — ошибка. */
function readPhoto(photo: unknown): { buf: Buffer; w: number; h: number } | null | string {
  if (photo === undefined || photo === null || photo === '') return null;
  if (typeof photo !== 'string') return 'Нет фото';
  const buf = Buffer.from(photo.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
  if (buf.length > PHOTO_MAX_BYTES) return 'Фото слишком большое';
  const size = jpegSize(buf);
  if (!size) return 'Нужно фото в формате JPEG';
  return { buf, ...size };
}

export class FeedStore {
  private posts: Post[] = [];
  private byId = new Map<string, Post>();
  private follows = new Map<string, Set<string>>();
  private followers = new Map<string, Set<string>>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly file: string | null,
    private readonly photoDir: string | null,
    private readonly now: () => number = Date.now,
  ) {
    if (!file) return;
    try {
      const data = JSON.parse(readFileSync(file, 'utf8')) as Partial<FeedFile>;
      for (const p of data.posts ?? []) this.index(p);
      for (const [who, list] of Object.entries(data.follows ?? {})) for (const x of list) this.link(who, x);
    } catch {
      // Файла ещё нет.
    }
  }

  private index(p: Post) {
    this.posts.push(p);
    this.byId.set(p.id, p);
  }

  private link(who: string, author: string) {
    if (!this.follows.has(who)) this.follows.set(who, new Set());
    this.follows.get(who)!.add(author);
    if (!this.followers.has(author)) this.followers.set(author, new Set());
    this.followers.get(author)!.add(who);
  }

  private unlink(who: string, author: string) {
    this.follows.get(who)?.delete(author);
    this.followers.get(author)?.delete(who);
  }

  get(id: unknown): Post | undefined {
    return typeof id === 'string' && POST_ID.test(id) ? this.byId.get(id) : undefined;
  }

  /** Сколько постов автор опубликовал за последние сутки. */
  postedToday(author: string): number {
    const now = this.now();
    let n = 0;
    for (let i = this.posts.length - 1; i >= 0 && now - this.posts[i].at < DAY; i--) if (this.posts[i].author === author && !this.posts[i].auto) n++;
    return n;
  }

  /** Новый пост. photo — JPEG в base64 (без него пост только с текстом). */
  add(author: string, name: string, text: unknown, photo: unknown): Post | string {
    const clean = typeof text === 'string' ? text.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').replace(/\n{3,}/g, '\n\n').trim() : '';
    if (clean.length > POST_TEXT_MAX) return `Текст длиннее ${POST_TEXT_MAX} знаков`;
    if (hasProfanity(clean)) return 'Без мата, пожалуйста: пост увидят все';
    if (hasLink(clean)) return 'Ссылки в ленте нельзя';
    const img = readPhoto(photo);
    if (typeof img === 'string') return img;
    if (!clean && !img) return 'Добавь фото или напиши пару слов';
    if (this.postedToday(author) >= POSTS_PER_DAY) return `Не больше ${POSTS_PER_DAY} постов в сутки. Возвращайся завтра`;
    return this.publish({ id: randomBytes(8).toString('hex'), author, name, text: clean, at: this.now(), likes: [] }, img);
  }

  /** Автопост о событии игрока: свой лимит (по виду и всего за сутки), ручные посты он не съедает. */
  addAuto(author: string, name: string, kind: unknown, text: unknown, card: unknown, photo?: unknown): Post | string {
    if (!(AUTO_KINDS as readonly unknown[]).includes(kind)) return 'Неизвестное событие';
    const k = kind as AutoKind;
    const now = this.now();
    let sameKind = 0;
    let total = 0;
    for (let i = this.posts.length - 1; i >= 0 && now - this.posts[i].at < DAY; i--) {
      const p = this.posts[i];
      if (p.author !== author || !p.auto) continue;
      total++;
      if (p.auto === k) sameKind++;
    }
    if (sameKind >= AUTO_PER_KIND[k] || total >= AUTO_PER_DAY) return 'На сегодня хватит';
    const clean = cut(text, 200);
    if (hasProfanity(clean) || hasLink(clean)) return 'Без мата и ссылок';
    const img = readPhoto(photo);
    if (typeof img === 'string') return img;
    const c = card === undefined || card === null ? null : cleanCard(card, k);
    if (typeof c === 'string') return c;
    if (!c && !img) return 'Нет карточки';
    return this.publish({ id: randomBytes(8).toString('hex'), author, name, text: clean, at: now, likes: [], auto: k, ...(c ? { card: c } : {}) }, img);
  }

  /** Пост персонажа игры (сервер пишет сам: server/npcFeed.ts). */
  addNpc(npc: string, name: string, text: string, card?: PostCardData): Post {
    const clean = text.replace(/\n{3,}/g, '\n\n').trim().slice(0, POST_TEXT_MAX);
    return this.publish({ id: randomBytes(8).toString('hex'), author: `npc:${npc}`, name, text: clean, at: this.now(), likes: [], ...(card ? { card } : {}) }, null) as Post;
  }

  private publish(post: Post, img: { buf: Buffer; w: number; h: number } | null): Post {
    if (img) {
      const id = randomBytes(10).toString('hex');
      if (this.photoDir) {
        mkdirSync(this.photoDir, { recursive: true });
        writeFileSync(join(this.photoDir, `${id}.jpg`), img.buf);
      }
      post.photo = { id, w: img.w, h: img.h };
    }
    this.index(post);
    if (this.posts.length > POSTS_KEEP) for (const old of this.posts.slice(0, this.posts.length - POSTS_KEEP)) this.drop(old);
    this.save();
    return post;
  }

  /** Последний пост персонажа (чтобы не повторяться). */
  npcPosts(limit = 20): Post[] {
    const out: Post[] = [];
    for (let i = this.posts.length - 1; i >= 0 && out.length < limit; i--) if (isNpc(this.posts[i].author)) out.push(this.posts[i]);
    return out;
  }

  /** Удалить пост (автор или модератор). */
  remove(id: string): Post | undefined {
    const p = this.get(id);
    if (p) {
      this.drop(p);
      this.save();
    }
    return p;
  }

  private drop(p: Post) {
    const i = this.posts.indexOf(p);
    if (i >= 0) this.posts.splice(i, 1);
    this.byId.delete(p.id);
    if (p.photo && this.photoDir) {
      try {
        unlinkSync(join(this.photoDir, `${p.photo.id}.jpg`));
      } catch {
        // Уже нет.
      }
    }
  }

  /** Респект: поставить или снять. Возвращает пост или ошибку. */
  like(id: string, who: string, on: boolean): Post | string {
    const p = this.get(id);
    if (!p || p.hidden) return 'Пост не найден';
    const i = p.likes.indexOf(who);
    if (on && i < 0) p.likes.push(who);
    if (!on && i >= 0) p.likes.splice(i, 1);
    this.save();
    return p;
  }

  /** Жалоба на пост. Возвращает, скрыт ли он теперь (впервые) и сколько жалоб. */
  report(id: string, who: string): { post: Post; hiddenNow: boolean; count: number } | string {
    const p = this.get(id);
    if (!p) return 'Пост не найден';
    if (p.author === who) return 'Нельзя пожаловаться на свой пост';
    p.reports ??= [];
    if (p.reports.includes(who)) return 'Ты уже пожаловался на этот пост. Модератор посмотрит';
    p.reports.push(who);
    const hiddenNow = !p.hidden && !p.ok && p.reports.length >= HIDE_AFTER_REPORTS;
    if (hiddenNow) p.hidden = true;
    this.save();
    return { post: p, hiddenNow, count: p.reports.length };
  }

  /** Решение модератора: оставить пост (снять скрытие, жалобы больше не скрывают). */
  approve(id: string): Post | undefined {
    const p = this.get(id);
    if (!p) return;
    p.hidden = false;
    p.ok = true;
    this.save();
    return p;
  }

  /**
   * Страница ленты: новые сверху, до времени before. filter решает, кому показывать пост.
   * Скрытые посты видит только автор.
   */
  page(viewer: string, filter: (p: Post) => boolean, before = Infinity, limit = FEED_PAGE): { posts: Post[]; more: boolean } {
    const out: Post[] = [];
    for (let i = this.posts.length - 1; i >= 0; i--) {
      const p = this.posts[i];
      if (p.at >= before) continue;
      if (p.hidden && p.author !== viewer) continue;
      if (!filter(p)) continue;
      if (out.length === limit) return { posts: out, more: true };
      out.push(p);
    }
    return { posts: out, more: false };
  }

  /** Время самого свежего поста тех, на кого я подписан (для точки на главной). */
  latestFollowed(viewer: string, filter: (p: Post) => boolean = () => true): number {
    const mine = this.follows.get(viewer);
    if (!mine?.size) return 0;
    for (let i = this.posts.length - 1; i >= 0; i--) {
      const p = this.posts[i];
      if (mine.has(p.author) && !p.hidden && filter(p)) return p.at;
    }
    return 0;
  }

  /** Имя, под которым игрок последний раз писал в ленту (для профиля, если других имён сервер не знает). */
  nameOf(id: string): string | undefined {
    for (let i = this.posts.length - 1; i >= 0; i--) if (this.posts[i].author === id) return this.posts[i].name;
  }

  countBy(author: string): number {
    let n = 0;
    for (const p of this.posts) if (p.author === author && !p.hidden) n++;
    return n;
  }

  follow(who: string, author: string, on: boolean): string | null {
    if (who === author) return 'Это ты сам';
    if (on) {
      if ((this.follows.get(who)?.size ?? 0) >= FOLLOW_MAX && !this.isFollowing(who, author)) return `Подписок не больше ${FOLLOW_MAX}`;
      this.link(who, author);
    } else this.unlink(who, author);
    this.save();
    return null;
  }

  isFollowing(who: string, author: string): boolean {
    return !!this.follows.get(who)?.has(author);
  }

  followingOf(who: string): string[] {
    return [...(this.follows.get(who) ?? [])];
  }

  followersOf(author: string): string[] {
    return [...(this.followers.get(author) ?? [])];
  }

  /** Фото поста, если его можно показать: скрытые — только с allowHidden (автор, админ). */
  photo(photoId: string, allowHidden = false): Buffer | null {
    if (!PHOTO_ID.test(photoId) || !this.photoDir) return null;
    const p = this.posts.find((x) => x.photo?.id === photoId);
    if (!p || (p.hidden && !allowHidden)) return null;
    try {
      return readFileSync(join(this.photoDir, `${photoId}.jpg`));
    } catch {
      return null;
    }
  }

  postOfPhoto(photoId: string): Post | undefined {
    return PHOTO_ID.test(photoId) ? this.posts.find((x) => x.photo?.id === photoId) : undefined;
  }

  /** «Удалить мои данные»: посты с фото, подписки в обе стороны, респекты и жалобы. */
  forget(id: string): void {
    for (const p of this.posts.filter((x) => x.author === id)) this.drop(p);
    for (const p of this.posts) {
      const i = p.likes.indexOf(id);
      if (i >= 0) p.likes.splice(i, 1);
      if (p.reports) p.reports = p.reports.filter((x) => x !== id);
    }
    for (const a of this.followingOf(id)) this.unlink(id, a);
    for (const f of this.followersOf(id)) this.unlink(f, id);
    this.follows.delete(id);
    this.followers.delete(id);
    this.save();
  }

  /** Аккаунты объединили (вход гостя → Telegram): посты и подписки переходят к новому id. */
  adopt(id: string, fromId: string): void {
    if (id === fromId) return;
    for (const p of this.posts) {
      if (p.author === fromId) p.author = id;
      p.likes = [...new Set(p.likes.map((x) => (x === fromId ? id : x)))];
    }
    for (const a of this.followingOf(fromId)) {
      this.unlink(fromId, a);
      if (a !== id) this.link(id, a);
    }
    for (const f of this.followersOf(fromId)) {
      this.unlink(f, fromId);
      if (f !== id) this.link(f, id);
    }
    this.save();
  }

  flush(): void {
    if (!this.file || !this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const follows: Record<string, string[]> = {};
    for (const [who, set] of this.follows) if (set.size) follows[who] = [...set];
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify({ posts: this.posts, follows } satisfies FeedFile));
    renameSync(`${this.file}.tmp`, this.file);
  }

  private save(): void {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush(), 2000);
  }
}
