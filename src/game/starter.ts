// Набор «Новичок» за звёзды Telegram (server/proSales.ts): облик и сундук новичка, один раз на аккаунт.
// Сервер помнит покупку, а вещи кладёт сама игра: как только узнаёт, что набор оплачен, а в прогрессе его ещё нет.
import { addPotions, Progress, saveProgress } from './progress';

// Без зелий бодрости: жизни (и заряд) за звёзды не продаём — «можно не тренироваться, а заплатить» ломает смысл.
// Монет немного (их тратят и на зелья в лавке): главное в наборе — облик.
export const STARTER_PACK = { outfit: 'explorer', coins: 300, swap: 2 };

/** Выдать набор: облик, монеты и зелья. null — уже выдан. */
export function claimStarter(p: Progress, now: number): Progress | null {
  if (p.starterPack) return null;
  const items = p.items.includes(STARTER_PACK.outfit) ? p.items : [...p.items, STARTER_PACK.outfit];
  const potions = addPotions(p.potions, 'swap', STARTER_PACK.swap);
  return saveProgress({ ...p, items, potions, coins: p.coins + STARTER_PACK.coins, starterPack: now });
}
