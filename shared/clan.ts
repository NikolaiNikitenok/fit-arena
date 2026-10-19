// Кланы: сообщения между приложением и сервером (тот же WebSocket, что у дуэлей).
import type { Exercise } from '../src/repCounter';

export type ClanRole = 'leader' | 'officer' | 'member';

export interface ClanMemberView {
  id: string;
  name: string;
  role: ClanRole;
  level: number;
  // Урон в текущем рейде.
  raidDamage: number;
  online: boolean;
  me: boolean;
}

export interface ChatMessage {
  id: number;
  from: string;
  name: string;
  text: string;
  at: number;
  // Системное сообщение: вступил, вышел, босс повержен.
  system?: boolean;
}

export interface RaidView {
  key: string;
  active: boolean;
  start: number;
  end: number;
  level: number;
  hp: number;
  hpMax: number;
  // Сколько участников было в клане, когда босс появился: от этого зависят награды.
  members: number;
  killedAt: number | null;
  myDamage: number;
  attacksLeft: number;
  // Лучшие по урону в этом рейде.
  top: { name: string; damage: number; me: boolean }[];
  // Последние удары: кто сейчас бьёт босса.
  recent: { name: string; damage: number; at: number }[];
}

export interface ClanView {
  id: string;
  name: string;
  tag: string;
  description: string;
  open: boolean;
  minLevel: number;
  // Код приглашения видят только участники.
  code: string;
  myRole: ClanRole;
  members: ClanMemberView[];
  raid: RaidView;
  raidWins: number;
  // Последний рейд, в котором игрок бился: награду забирают, когда босс повержен или выходные кончились.
  reward: { key: string; damage: number; hpMax: number; members: number; killed: boolean; finished: boolean } | null;
}

export interface ClanListItem {
  id: string;
  name: string;
  tag: string;
  description: string;
  members: number;
  open: boolean;
  minLevel: number;
  raidWins: number;
}

export interface ClanSettings {
  name: string;
  tag: string;
  description: string;
  open: boolean;
  minLevel: number;
}

export type ClanClientMessage =
  | { type: 'clanMine' }
  | { type: 'clanSearch'; q: string }
  | { type: 'clanCreate'; clan: ClanSettings }
  | { type: 'clanJoin'; id?: string; code?: string }
  | { type: 'clanLeave' }
  | { type: 'clanUpdate'; clan: ClanSettings }
  | { type: 'clanRole'; id: string; role: ClanRole }
  | { type: 'clanKick'; id: string }
  | { type: 'chatSend'; text: string }
  | { type: 'raidStart'; exercise: Exercise }
  | { type: 'raidHit'; attackId: string; damage: number }
  | { type: 'raidEnd'; attackId: string };

export type ClanServerMessage =
  | { type: 'clan'; clan: ClanView | null }
  | { type: 'clanList'; clans: ClanListItem[] }
  | { type: 'chat'; messages: ChatMessage[] }
  | { type: 'chatMsg'; message: ChatMessage }
  | { type: 'raid'; raid: RaidView }
  | { type: 'raidAttack'; attackId: string; endsAt: number }
  | { type: 'clanError'; message: string };

export const CLAN_MAX_MEMBERS = 30;
export const CHAT_MAX = 300;
