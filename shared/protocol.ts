// Сообщения между клиентом и сервером матчей (JSON по WebSocket).
import type { Exercise } from '../src/repCounter';
import type { ClanClientMessage, ClanServerMessage } from './clan';

export interface PlayerInfo {
  id: string;
  name: string;
  ready: boolean;
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
}

export type ServerMessage =
  // telegram — игрок вошёл через Telegram с проверенной подписью, а не гостем из браузера.
  | { type: 'welcome'; id: string; name: string; botUsername: string | null; botRunning: boolean; telegram: boolean }
  | { type: 'room'; code: string; exercise: Exercise; players: PlayerInfo[] }
  | { type: 'countdown'; startsInMs: number; durationMs: number }
  | { type: 'state'; me: FighterView; opponent: FighterView; leftMs: number }
  | { type: 'end'; result: 'win' | 'lose' | 'draw'; reason: 'ko' | 'time' | 'left' }
  | { type: 'profile'; profile: ProfileView; delta?: number }
  | { type: 'top'; players: TopEntry[] }
  | { type: 'queue'; waiting: boolean }
  | { type: 'error'; message: string }
  | ClanServerMessage;
