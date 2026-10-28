// Награда за Титана (shared/titan.ts): если Титан пал, каждому, кто внёс хотя бы TITAN_MIN_REPS повторов, —
// монеты и, в первый раз, легендарный облик «Титаноборец». Для пропуска это победа над боссом.
import { TITAN_MIN_REPS } from '../../shared/titan';
import { countPass, type Progress } from './progress';

export const TITAN_COINS = 1000;
export const TITAN_OUTFIT = 'titan-slayer';

/** Можно ли забрать награду Титана этого месяца. */
export const canClaimTitan = (p: Pick<Progress, 'titanClaimed'>, key: string, won: boolean, myReps: number) => won && myReps >= TITAN_MIN_REPS && !p.titanClaimed?.includes(key);

/** Забрать награду: монеты, облик в первый раз, победа над боссом в пропуск. */
export function claimTitan(p: Progress, key: string, now: number): { progress: Progress; coins: number; outfit: boolean } {
  if (p.titanClaimed?.includes(key)) return { progress: p, coins: 0, outfit: false };
  const outfit = !p.items.includes(TITAN_OUTFIT);
  const counted = countPass(countPass(p, 'win', 1, now), 'boss', 1, now);
  return {
    progress: { ...counted, coins: p.coins + TITAN_COINS, items: outfit ? [...p.items, TITAN_OUTFIT] : p.items, titanClaimed: [...(p.titanClaimed ?? []), key].slice(-24) },
    coins: TITAN_COINS,
    outfit,
  };
}
