// Разделы открываются по ходу игры: в первый день новичок видит только приключение и героя,
// остальное приходит по одному, с объявлением от Мастера Грома — это и повод зайти завтра.
// Кто играл до появления этих ступеней, видит всё сразу: у него ничего не забираем.
// Пришёл по ссылке клана, дуэли или друга — нужный раздел открыт сразу (linkUnlocks в unlockLinks.ts).
import type { Progress } from './progress';

export type Feature = 'daily' | 'shop' | 'programs' | 'gym' | 'duel' | 'pass' | 'events' | 'collections' | 'dungeon' | 'village' | 'clan' | 'city';

/** После скольких пройденных уровней карты открывается раздел. Первые три уровня — испытания силы. */
export const UNLOCK_AT: Record<Feature, number> = {
  daily: 3,
  shop: 3,
  programs: 3,
  gym: 3,
  duel: 5,
  pass: 5,
  events: 5,
  collections: 5,
  dungeon: 10,
  village: 10,
  clan: 15,
  city: 15,
};

export const FEATURES = Object.keys(UNLOCK_AT) as Feature[];

// Первый день со ступенями: у кого есть тренировка раньше этого дня, тот играл до них.
export const GATES_SINCE = '2026-11-01';

/** Сколько уровней карты пройдено. */
export const clearedLevels = (p: Pick<Progress, 'stars'>): number => Object.values(p.stars ?? {}).filter((n) => n > 0).length;

/** Играл до ступеней: открыто всё и без объявлений. */
export function isVeteran(p: Pick<Progress, 'days'>): boolean {
  return Object.keys(p.days ?? {}).some((d) => d < GATES_SINCE);
}

/** Раздел уже трогали (построена деревня, пройден этаж, забрана награда клана) — закрывать его нельзя. */
function touched(p: Progress, f: Feature): boolean {
  switch (f) {
    case 'village':
      return (p.village?.b?.length ?? 0) > 0;
    case 'dungeon':
      return (p.dungeon?.wins ?? 0) > 0;
    case 'clan':
      return !!p.clanGift || (p.raidClaimed?.length ?? 0) > 0 || (p.warClaimed?.length ?? 0) > 0;
    case 'programs':
      return !!p.programs?.run || (p.programs?.done.length ?? 0) > 0;
    case 'gym':
      return (p.gym?.history.length ?? 0) > 0 || !!p.gym?.run;
    case 'pass':
      return (p.pass?.free.length ?? 0) > 0 || (p.pass?.pro.length ?? 0) > 0;
    default:
      return false;
  }
}

/** Открыт ли раздел. extra — открытые на этот запуск ссылкой (клан, дуэль, друг, кнопка бота). */
export function isUnlocked(p: Progress, f: Feature, extra: readonly Feature[] = []): boolean {
  return clearedLevels(p) >= UNLOCK_AT[f] || isVeteran(p) || extra.includes(f) || (p.unlocked ?? []).includes(f) || touched(p, f);
}

/** Сколько уровней осталось до раздела (0 — открыт). */
export function levelsToUnlock(p: Progress, f: Feature, extra: readonly Feature[] = []): number {
  return isUnlocked(p, f, extra) ? 0 : UNLOCK_AT[f] - clearedLevels(p);
}

/** Разделы, открытые уровнями карты, о которых Гром ещё не объявил. Ветеранам объявлять нечего. */
export function freshUnlocks(p: Progress): Feature[] {
  if (isVeteran(p)) return [];
  const n = clearedLevels(p);
  const seen = new Set([...(p.unlockSeen ?? []), ...(p.unlocked ?? [])]);
  return FEATURES.filter((f) => UNLOCK_AT[f] <= n && !seen.has(f) && !touched(p, f));
}

/** Объявление прочитано. */
export const markUnlockSeen = (p: Progress, fs: readonly Feature[]): Progress => ({ ...p, unlockSeen: [...new Set([...(p.unlockSeen ?? []), ...fs])] });

/** Запомнить разделы, открытые ссылкой: в следующий раз они останутся открытыми и без ссылки. */
export function rememberUnlocks(p: Progress, fs: readonly Feature[]): Progress {
  const have = new Set(p.unlocked ?? []);
  const add = fs.filter((f) => !have.has(f) && !isUnlocked(p, f));
  return add.length ? { ...p, unlocked: [...have, ...add] } : p;
}
