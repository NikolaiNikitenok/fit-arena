// Лента и профили игроков: что сервер (server/feed.ts, server/socialApi.ts) отдаёт приложению (src/social/).
import type { Exercise } from '../src/repCounter';
import type { ClanListItem } from './clan';

// Можно ли мне вступить в клан игрока: open — да; member — я уже в нём; inClan — я в другом клане;
// level — мал уровень; invite — только по приглашению.
export type ClanJoin = 'open' | 'member' | 'inClan' | 'level' | 'invite';
export type ProfileClan = ClanListItem & { join: ClanJoin };

// Длина текста поста и сколько постов в день можно опубликовать.
export const POST_TEXT_MAX = 500;
export const POSTS_PER_DAY = 5;
// Фото поста: JPEG, длинная сторона не больше, размер файла не больше.
export const PHOTO_SIDE = 1280;
export const PHOTO_MAX_BYTES = 900_000;
// Столько разных игроков пожаловались — пост скрывается до решения модератора.
export const HIDE_AFTER_REPORTS = 3;
export const FEED_PAGE = 20;

// Автопосты: игра сама пишет в ленту о событиях игрока (выключается в настройках), и посты персонажей.
export const AUTO_KINDS = ['boss', 'streak', 'level', 'win', 'group', 'league'] as const;
export type AutoKind = (typeof AUTO_KINDS)[number];
// Сколько автопостов одного вида в сутки (победы можно выкладывать чаще) и всего.
export const AUTO_PER_KIND: Record<AutoKind, number> = { boss: 2, streak: 1, level: 1, win: 3, group: 1, league: 1 };
export const AUTO_PER_DAY = 6;
export type CardKind = AutoKind | 'daily' | 'tip' | 'task';

/** Карточка события вместо фото: значок по виду, крупная цифра и подпись. */
export interface PostCardData {
  kind: CardKind;
  title: string;
  value?: string;
  sub?: string;
}

// Персонажи, которые пишут в ленту (server/npcFeed.ts): портрет — /portraits/<id>.png.
export const NPC_IDS = ['grom', 'marfa', 'lisa'] as const;
export type NpcId = (typeof NPC_IDS)[number];

export interface AuthorView {
  // Публичный id профиля: по нему открывают профиль (сам id игрока не показываем).
  pid: string;
  name: string;
  level: number;
  pro?: boolean;
  // Пост написал персонаж игры: профиля нет, вместо фото — портрет.
  npc?: NpcId;
}

export interface PostView {
  id: string;
  author: AuthorView;
  text: string;
  // Адрес фото (/api/feed/photo/<id>.jpg) и его пропорции, чтобы место под фото было сразу.
  photo?: string;
  w?: number;
  h?: number;
  at: number;
  // «Респект» 💪: сколько и поставил ли я.
  likes: number;
  liked: boolean;
  mine: boolean;
  // Скрыт по жалобам: автор видит пометку, остальные — не видят.
  hidden?: boolean;
  card?: PostCardData;
}

export type FeedTab = 'all' | 'following';

export interface FeedReply {
  posts: PostView[];
  // Есть ещё посты старше последнего.
  more: boolean;
  error?: string;
  note?: string;
}

export interface BestView {
  exercise: Exercise;
  // Повторы за подход; у планки — секунды.
  reps: number;
  date: string;
}

export type FriendStatus = 'self' | 'friends' | 'requested' | 'incoming' | 'none';

export interface ProfileView {
  pid: string;
  name: string;
  me: boolean;
  level: number;
  pro?: boolean;
  clan?: ProfileClan;
  city?: string;
  cups: number;
  // В сети сейчас; иначе — дата последнего захода (ГГГГ-ММ-ДД по UTC), если известна.
  online: boolean;
  lastSeen: string | null;
  // Первый день с тренировкой, сколько дней с тренировкой, серия и всего повторов.
  since: string | null;
  activeDays: number;
  streak: number;
  totalReps: number;
  // Лучший подход по каждому упражнению и что получается лучше всего (больше всего повторов).
  best: BestView[];
  favorite: Exercise | null;
  followers: number;
  following: number;
  posts: number;
  iFollow: boolean;
  friend: FriendStatus;
  // Я заблокировал игрока: кнопки дружбы и подписки скрыты.
  blocked?: boolean;
}

export interface ProfileReply {
  profile?: ProfileView;
  error?: string;
  note?: string;
}
