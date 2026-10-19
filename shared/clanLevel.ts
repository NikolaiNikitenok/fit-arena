// Уровни клана 1–30. Опыт клан получает от тренировок участников и от рейда;
// с уровнем растут места в клане, атаки и награды рейда, а на каждом уровне всем дарят подарок.

export const CLAN_MAX_LEVEL = 30;
// Опыт: повтор в приключении — 1, урон по рейд-боссу — 1 за 5, победа над боссом — 400 за уровень рейда.
export const CLAN_XP_PER_REP = 1;
export const CLAN_XP_PER_DAMAGE = 0.2;
export const CLAN_XP_KILL = 400;
// Повторов в день от одного участника засчитываем не больше, чтобы клан рос от многих, а не от одного.
export const CLAN_REPS_PER_DAY = 300;

/** Сколько опыта нужно, чтобы с уровня level перейти на следующий. */
export const clanXpNeed = (level: number) => Math.round((140 * level ** 1.6) / 10) * 10;

export function clanLevel(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let left = Math.max(0, Math.floor(xp));
  while (level < CLAN_MAX_LEVEL && left >= clanXpNeed(level)) {
    left -= clanXpNeed(level);
    level++;
  }
  return { level, into: level < CLAN_MAX_LEVEL ? left : 0, need: level < CLAN_MAX_LEVEL ? clanXpNeed(level) : 0 };
}

export interface ClanPerks {
  slots: number;
  attacks: number;
  // Надбавка к монетам рейда и к урону героя в рейде, доли.
  raidCoins: number;
  raidDamage: number;
}

export function clanPerks(level: number): ClanPerks {
  return {
    slots: 10 + 2 * Math.floor(level / 3),
    attacks: 3 + (level >= 8 ? 1 : 0) + (level >= 20 ? 1 : 0),
    raidCoins: 0.05 * Math.floor(level / 2),
    raidDamage: level >= 30 ? 0.15 : level >= 24 ? 0.1 : level >= 12 ? 0.05 : 0,
  };
}

/** Подарок каждому участнику, когда клан достигает уровня; на каждом пятом — ещё и эликсиры. */
export function clanGift(level: number): { coins: number; potions: { vigor?: number; might?: number } } {
  return { coins: 30 + 10 * level, potions: level % 5 === 0 ? { vigor: 1, might: 1 } : {} };
}

/** Ранг знамени: рамка флага меняется на 10, 20 и 30 уровне. */
export const clanRank = (level: number) => (level >= 30 ? 'legend' : level >= 20 ? 'gold' : level >= 10 ? 'silver' : 'bronze');

/** Что открывается на уровне: для списка наград. */
export function clanUnlocks(level: number): string[] {
  const now = clanPerks(level);
  const was = clanPerks(level - 1);
  const out: string[] = [];
  if (now.slots > was.slots) out.push(`${now.slots} мест в клане`);
  if (now.attacks > was.attacks) out.push(`${now.attacks} атаки рейда в день`);
  if (now.raidCoins > was.raidCoins) out.push(`+${Math.round(now.raidCoins * 100)}% монет за рейд`);
  if (now.raidDamage > was.raidDamage) out.push(`+${Math.round(now.raidDamage * 100)}% урона в рейде`);
  if (clanRank(level) !== clanRank(level - 1)) out.push({ silver: 'серебряное знамя', gold: 'золотое знамя', legend: 'легендарное знамя' }[clanRank(level) as 'silver'] ?? '');
  return out;
}
