// Кланы: сообщения между приложением и сервером (тот же WebSocket, что у дуэлей).
import type { Exercise } from '../src/repCounter';
import type { WarView } from './war';

export type ClanRole = 'leader' | 'officer' | 'member';

export interface ClanMemberView {
  id: string;
  name: string;
  role: ClanRole;
  level: number;
  // Опыт, который участник принёс клану.
  xp: number;
  // Урон в текущем рейде.
  raidDamage: number;
  online: boolean;
  me: boolean;
  // Pro Pass: имя золотом.
  pro: boolean;
}

export interface ChatMessage {
  id: number;
  from: string;
  name: string;
  text: string;
  at: number;
  // Системное сообщение: вступил, вышел, босс повержен.
  system?: boolean;
  // Автор с Pro Pass: сервер отмечает при отправке, в истории чата не хранится.
  pro?: boolean;
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
  top: { name: string; damage: number; me: boolean; pro?: boolean }[];
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
  flag: string;
  country: string;
  city: string;
  xp: number;
  // Код приглашения видят только участники.
  code: string;
  myRole: ClanRole;
  members: ClanMemberView[];
  raid: RaidView;
  raidWins: number;
  // Последний рейд, в котором игрок бился: награду забирают, когда босс повержен или выходные кончились.
  reward: { key: string; damage: number; hpMax: number; members: number; killed: boolean; finished: boolean } | null;
  // Война кланов на выходных.
  war?: WarView;
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
  flag: string;
  country: string;
  city: string;
  xp: number;
}

export interface ClanSettings {
  name: string;
  tag: string;
  description: string;
  open: boolean;
  minLevel: number;
  flag: string;
  country: string;
  city: string;
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
  // Повторы из приключения: из них растёт опыт клана.
  | { type: 'clanReps'; reps: number; since?: number }
  // Глава или заместитель: участвовать ли клану в войнах.
  | { type: 'clanWar'; on: boolean }
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

// Флаг клана: «фон.узор.символ.цвет узора». Сами цвета и рисунки — в src/clan/Flag.tsx.
export const FLAG_COLORS = 12;
export const FLAG_PATTERNS = 8;
export const FLAG_SYMBOLS = 12;
export const parseFlag = (flag: string): [number, number, number, number] | null => {
  const n = flag.split('.').map(Number);
  const max = [FLAG_COLORS, FLAG_PATTERNS, FLAG_SYMBOLS, FLAG_COLORS];
  return n.length === 4 && n.every((x, i) => Number.isInteger(x) && x >= 0 && x < max[i]) ? (n as [number, number, number, number]) : null;
};
/** Флаг по тегу для кланов, созданных до выбора флага. */
export const defaultFlag = (tag: string) => {
  const h = [...tag].reduce((x, ch) => x * 31 + ch.charCodeAt(0), 7);
  return `${h % FLAG_COLORS}.${(h >> 4) % FLAG_PATTERNS}.${(h >> 8) % FLAG_SYMBOLS}.${(h % FLAG_COLORS + 5) % FLAG_COLORS}`;
};

// Страны для местоположения клана; город игрок пишет сам.
export const COUNTRIES: Record<string, string> = {
  RU: 'Россия', BY: 'Беларусь', KZ: 'Казахстан', UA: 'Украина', UZ: 'Узбекистан', KG: 'Киргизия', TJ: 'Таджикистан', TM: 'Туркменистан',
  AM: 'Армения', AZ: 'Азербайджан', GE: 'Грузия', MD: 'Молдова', LV: 'Латвия', LT: 'Литва', EE: 'Эстония', PL: 'Польша',
  DE: 'Германия', CZ: 'Чехия', RS: 'Сербия', TR: 'Турция', IL: 'Израиль', AE: 'ОАЭ', TH: 'Таиланд', CY: 'Кипр',
  ES: 'Испания', IT: 'Италия', FR: 'Франция', GB: 'Великобритания', FI: 'Финляндия', US: 'США', CA: 'Канада', OTHER: 'Другая страна',
};
export const clanPlace = (c: { city: string; country: string }) => [c.city, COUNTRIES[c.country]].filter(Boolean).join(', ');
export const CHAT_MAX = 300;
