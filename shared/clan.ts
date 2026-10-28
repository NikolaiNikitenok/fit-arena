// Кланы: сообщения между приложением и сервером (тот же WebSocket, что у дуэлей).
import type { Exercise } from '../src/repCounter';
import type { WarResult, WarView } from './war';
import { t } from '../src/i18n';

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
  // Глава или заместитель запретил писать в чат до этого времени.
  mutedUntil?: number;
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
  // claimed — сервер уже выдал эту награду (может быть, на другом телефоне).
  reward: { key: string; damage: number; hpMax: number; members: number; killed: boolean; finished: boolean; claimed?: boolean } | null;
  // С какого уровня клана считаются подарки игроку (сервер); нет — старый участник, считаем по телефону.
  giftFrom?: number;
  // Война кланов на выходных.
  war?: WarView;
  // Мне нельзя писать в чат до этого времени (запрет главы или модератора).
  mutedUntil?: number;
  // Мой чёрный список: их сообщения в чате не показываем.
  hidden?: string[];
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
  // Модерация чата: удалить сообщение, запретить участнику писать (hours: 1, 24; 0 — снять).
  | { type: 'chatDelete'; id: number }
  | { type: 'clanMute'; id: string; hours: number }
  // Повторы из приключения: из них растёт опыт клана.
  | { type: 'clanReps'; reps: number; since?: number }
  // Глава или заместитель: участвовать ли клану в войнах.
  | { type: 'clanWar'; on: boolean }
  | { type: 'raidStart'; exercise: Exercise }
  | { type: 'raidHit'; attackId: string; damage: number }
  | { type: 'raidEnd'; attackId: string }
  // Забрать награду: сервер проверяет право и отмечает выданной, телефон начисляет только после ответа.
  | { type: 'clanClaim'; kind: 'raid' | 'war' | 'gift'; from?: number };

/** Награда, которую сервер разрешил забрать: по этим числам телефон выдаёт монеты и вещи. */
export type ClanClaim =
  | { kind: 'raid'; key: string; damage: number; hpMax: number; members: number; killed: boolean; coinBonus: number }
  | { kind: 'war'; key: string; result: WarResult; points: number; mvp: boolean }
  | { kind: 'gift'; clan: string; from: number; to: number };

export type ClanServerMessage =
  | { type: 'clan'; clan: ClanView | null }
  | { type: 'clanList'; clans: ClanListItem[] }
  | { type: 'chat'; messages: ChatMessage[] }
  | { type: 'chatMsg'; message: ChatMessage }
  | { type: 'chatDel'; id: number }
  | { type: 'raid'; raid: RaidView }
  | { type: 'raidAttack'; attackId: string; endsAt: number }
  | { type: 'clanError'; message: string }
  | { type: 'clanClaimed'; claim: ClanClaim };

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
  RU: t('Россия'), BY: t('Беларусь'), KZ: t('Казахстан'), UA: t('Украина'), UZ: t('Узбекистан'), KG: t('Киргизия'), TJ: t('Таджикистан'), TM: t('Туркменистан'),
  AM: t('Армения'), AZ: t('Азербайджан'), GE: t('Грузия'), MD: t('Молдова'), LV: t('Латвия'), LT: t('Литва'), EE: t('Эстония'), PL: t('Польша'),
  DE: t('Германия'), CZ: t('Чехия'), RS: t('Сербия'), TR: t('Турция'), IL: t('Израиль'), AE: t('ОАЭ'), TH: t('Таиланд'), CY: t('Кипр'),
  ES: t('Испания'), IT: t('Италия'), FR: t('Франция'), GB: t('Великобритания'), FI: t('Финляндия'), US: t('США'), CA: t('Канада'), OTHER: t('Другая страна'),
};
export const clanPlace = (c: { city: string; country: string }) => [c.city, COUNTRIES[c.country]].filter(Boolean).join(', ');
export const CHAT_MAX = 300;
