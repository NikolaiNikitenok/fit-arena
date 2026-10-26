// Набор «Новичок» за звёзды Telegram (server/proSales.ts): облик и сундук новичка, один раз на аккаунт.
// Сервер помнит покупку, а вещи кладёт сама игра: как только узнаёт, что набор оплачен, а в прогрессе его ещё нет.
import { addPotions, Progress, saveProgress } from './progress';

export const STARTER_PACK = { outfit: 'explorer', coins: 1000, vigor: 3, swap: 2 };

/** Выдать набор: облик, монеты и зелья. null — уже выдан. */
export function claimStarter(p: Progress, now: number): Progress | null {
  if (p.starterPack) return null;
  const items = p.items.includes(STARTER_PACK.outfit) ? p.items : [...p.items, STARTER_PACK.outfit];
  const potions = addPotions(addPotions(p.potions, 'vigor', STARTER_PACK.vigor), 'swap', STARTER_PACK.swap);
  return saveProgress({ ...p, items, potions, coins: p.coins + STARTER_PACK.coins, starterPack: now });
}
