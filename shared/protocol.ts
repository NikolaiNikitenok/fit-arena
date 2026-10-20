// Сообщения между клиентом и сервером матчей (JSON по WebSocket).
import type { Exercise } from '../src/repCounter';
import type { ClanClientMessage, ClanServerMessage } from './clan';

export interface PlayerInfo {
  id: string;
  name: string;
  ready: boolean;
  pro?: boolean;
}

export type ClientMessage =
  // channel: 'clan' — отдельное соединение экрана клана, дуэли его не видят.
  | { type: 'hello'; initData: string; name: string; guestId?: string; channel?: 'clan'; level?: number }
  | { type: 'quick'; exercise: Exercise }
  | { type: 'cancelQuick' }
  | { type: 'create'; exercise: Exercise }
  | { type: 'join'; code: string }
  | { type: 'ready' }
  | { type: 'rep' }
  | { type: 'leave' }
  | { type: 'top' }
  | ClanClientMessage;

// Состояние боя всегда с точки зрения получателя: me — он сам, opponent — соперник.
export interface FighterView {
  name: string;
  hp: number;
  maxHp: number;
  hits: number;
  combo: boolean;
  pro?: boolean;
}

export interface ProfileView {
  cups: number;
  wins: number;
  losses: number;
  draws: number;
  rank: number | null;
  season: number;
}

export interface TopEntry {
  name: string;
  cups: number;
  wins: number;
  me: boolean;
  pro?: boolean;
}

export type ServerMessage =
  // telegram — игрок вошёл через Telegram с проверенной подписью, а не гостем из браузера.
  // pro — у игрока Pro Pass (по id в Telegram, см. server/pro.ts).
  | { type: 'welcome'; id: string; name: string; botUsername: string | null; botRunning: boolean; telegram: boolean; pro: boolean }
  | { type: 'room'; code: string; exercise: Exercise; players: PlayerInfo[] }
  | { type: 'countdown'; startsInMs: number; durationMs: number }
  | { type: 'state'; me: FighterView; opponent: FighterView; leftMs: number }
  | { type: 'end'; result: 'win' | 'lose' | 'draw'; reason: 'ko' | 'time' | 'left' }
  | { type: 'profile'; profile: ProfileView; delta?: number }
  | { type: 'top'; players: TopEntry[] }
  | { type: 'queue'; waiting: boolean }
  | { type: 'error'; message: string }
  | ClanServerMessage;

// Друзья: HTTP POST /api/friends/* (см. server/friendsApi.ts). Только игроки Telegram.
export interface FriendView {
  id: string;
  name: string;
  pro?: boolean;
  level: number;
  cups: number;
  online: boolean;
  // Последний день с тренировкой (ГГГГ-ММ-ДД) и серия дней.
  lastDay: string | null;
  streak: number;
  clanTag?: string;
  // Сколько ждать до нового вызова этому другу (не чаще раза в 10 минут).
  waitMs?: number;
  // Мой открытый вызов этому другу: код комнаты, куда можно вернуться.
  room?: string;
}

export interface FriendRequestView {
  id: string;
  name: string;
  pro?: boolean;
  level: number;
  at: number;
}

export interface ChallengeView {
  id: string;
  from: string;
  name: string;
  pro?: boolean;
  exercise: Exercise;
  room: string;
  expiresAt: number;
}

export interface FriendsState {
  // Короткий код для ввода вручную и токен ссылки-приглашения (startapp=friend-ТОКЕН).
  code: string;
  invite: string;
  notify: boolean;
  bot: { username: string | null; running: boolean };
  friends: FriendView[];
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
  challenges: ChallengeView[];
}
