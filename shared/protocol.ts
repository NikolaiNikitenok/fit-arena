// Сообщения между клиентом и сервером матчей (JSON по WebSocket).
import type { Exercise } from '../src/repCounter';

export interface PlayerInfo {
  id: string;
  name: string;
  ready: boolean;
}

export type ClientMessage =
  | { type: 'hello'; initData: string; name: string }
  | { type: 'create'; exercise: Exercise }
  | { type: 'join'; code: string }
  | { type: 'ready' }
  | { type: 'rep' }
  | { type: 'leave' };

// Состояние боя всегда с точки зрения получателя: me — он сам, opponent — соперник.
export interface FighterView {
  name: string;
  hp: number;
  maxHp: number;
  hits: number;
  combo: boolean;
}

export type ServerMessage =
  | { type: 'welcome'; id: string; name: string; botUsername: string | null }
  | { type: 'room'; code: string; exercise: Exercise; players: PlayerInfo[] }
  | { type: 'countdown'; startsInMs: number; durationMs: number }
  | { type: 'state'; me: FighterView; opponent: FighterView; leftMs: number }
  | { type: 'end'; result: 'win' | 'lose' | 'draw'; reason: 'ko' | 'time' | 'left' }
  | { type: 'error'; message: string };
