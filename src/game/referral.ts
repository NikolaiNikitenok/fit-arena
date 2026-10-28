// «Приведи друга»: друг пришёл по твоей ссылке и провёл первый бой — обоим монеты и облик «Побратим»,
// за троих — легендарный «Вожак стаи». Кто кого привёл, знает сервер (server/referrals.ts),
// а забранные награды помнит прогресс (refClaimed), как награды рейда.
import type { FriendsState } from '../../shared/protocol';
import { type Progress } from './progress';

export const REF_COINS = 500;
export const INVITED_COINS = 300;
// Монеты — за первых десятерых, дальше только слава.
export const REF_PAID_MAX = 10;
export const REF_LEADER_AT = 3;

type Refs = NonNullable<FriendsState['referrals']>;

export interface RefReward {
  key: string;
  // Кто провёл первый бой: друг, которого привёл я, или я сам (пришёл по ссылке).
  name: string;
  self: boolean;
}

/** Награды, которые можно забрать сейчас. */
export function refPending(refs: Refs | undefined, p: Pick<Progress, 'refClaimed'>): RefReward[] {
  if (!refs) return [];
  const claimed = new Set(p.refClaimed ?? []);
  const out: RefReward[] = refs.brought.filter((r) => r.active && !claimed.has(`ref:${r.id}`)).map((r) => ({ key: `ref:${r.id}`, name: r.name, self: false }));
  // Пришёл по ссылке: награда, когда я сам провёл первый бой.
  if (refs.by && !claimed.has('ref-by') && refs.me) out.unshift({ key: 'ref-by', name: refs.by.name, self: true });
  return out;
}

/** Сколько приведённых друзей уже засчитано. */
export const refCount = (p: Pick<Progress, 'refClaimed'>) => (p.refClaimed ?? []).filter((k) => k.startsWith('ref:')).length;

/** Забрать награду: монеты и облики. Возвращает новый прогресс и что выдано. */
export function claimRef(p: Progress, r: RefReward): { progress: Progress; coins: number; outfits: string[] } {
  if (p.refClaimed?.includes(r.key)) return { progress: p, coins: 0, outfits: [] };
  const refClaimed = [...(p.refClaimed ?? []), r.key];
  const brought = refClaimed.filter((k) => k.startsWith('ref:')).length;
  const coins = r.self ? INVITED_COINS : brought <= REF_PAID_MAX ? REF_COINS : 0;
  const outfits = ['ref-brother', ...(brought >= REF_LEADER_AT ? ['ref-leader'] : [])].filter((id) => !p.items.includes(id));
  return { progress: { ...p, refClaimed, coins: p.coins + coins, items: [...p.items, ...outfits] }, coins, outfits };
}
