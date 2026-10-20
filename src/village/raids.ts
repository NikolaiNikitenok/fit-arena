/**
 * Набеги лентяев Князя Дивана на деревню игрока. Без сети: раз в полтора-два дня, когда деревня
 * открыта, бой считается тем же движком, что и PvP, по раскладке игрока. Уносят вдвое меньше,
 * чем живой соперник, и только незащищённое; пропущенные набеги не копятся — не больше одного.
 */
import { applyLoss, GRID, lootAvailable, thLevel } from '../../shared/village';
import { baseOf, BattleArmy, Deploy, simulateBattle, TROOP_IDS, TroopId } from '../../shared/villageBattle';
import { knyazArmy } from '../../shared/villageCamps';
import type { Progress } from '../game/progress';
import { villageOf } from '../game/resources';
import { hasTown, packBase, townOf, withTown } from './state';
import type { DefenseEntry } from './types';

export const NPC_LOOT_MUL = 0.5;
const H = 3600_000;
// Между набегами 30–42 часа; на ратуше 1 Князь только присматривается.
export const nextRaidAt = (from: number, seed: number) => from + 30 * H + (Math.abs(seed) % 12) * H;
const LOG_MAX = 8;
// Повтор хранится у трёх последних набегов: этого хватает, а сохранение остаётся маленьким.
const REPLAYS = 3;

/** Как лентяи высаживаются: с одной стороны, волнами — сначала крепкие, потом остальные. */
export function knyazDeploys(army: BattleArmy, seed: number): Deploy[] {
  const side = Math.abs(seed) % 4;
  const at = (k: number): [number, number] => {
    const along = 6 + ((k * 7 + seed) % 12) + 0.5;
    const edge = -2;
    return side === 0 ? [along, edge] : side === 1 ? [GRID - edge, along] : side === 2 ? [along, GRID - edge] : [edge, along];
  };
  const order: TroopId[] = ['giant', 'wallbreaker', 'warrior', 'archer', 'healer'];
  const out: Deploy[] = [];
  let t = 0;
  let k = 0;
  for (const id of order) {
    for (let n = 0; n < (army.troops[id] ?? 0); n++) {
      const [x, y] = at(k++);
      out.push({ t, u: id, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
      t += 2;
    }
    t += 20;
  }
  return out;
}

/** Если подошёл срок, Князь нападает: потеря запасов и запись в журнал. Иначе null. */
export function dueRaid(p: Progress, now: number): Progress | null {
  if (!hasTown(p)) return null;
  const v = villageOf(p);
  const at = v.raidAt;
  if (at == null || now < at) return null;
  const t = townOf(p);
  const th = thLevel(t);
  const seed = Math.floor(at / 1000) | 0;
  if (th < 2) return { ...p, village: { ...v, raidAt: nextRaidAt(now, seed) } };
  const army = knyazArmy(th);
  const base = baseOf(t);
  const deploys = knyazDeploys(army, seed);
  const loot = lootAvailable(t, at, NPC_LOOT_MUL);
  const r = simulateBattle({ base, army, deploys, loot, seed });
  const lost = withTown(p, applyLoss(t, r.loot, at));
  const entry: DefenseEntry = { at, who: 'Лентяи Князя Дивана', stars: r.stars, pct: r.destruction, loot: r.loot, avail: loot, seed, army, deploys, base: packBase(base) };
  return { ...lost, village: { ...villageOf(lost), log: addLog(v.log, entry), raidAt: nextRaidAt(now, seed) } };
}

/** Записать набег в журнал: новые сверху, не больше LOG_MAX, повтор — только у последних REPLAYS. */
export function addLog(log: DefenseEntry[] | undefined, entry: DefenseEntry): DefenseEntry[] {
  return [entry, ...(log ?? [])]
    .sort((a, b) => b.at - a.at)
    .slice(0, LOG_MAX)
    .map((e, k) => (k < REPLAYS ? e : { ...e, deploys: undefined, base: undefined, avail: undefined }));
}

export const unseenRaids = (p: Progress) => (villageOf(p).log ?? []).filter((e) => e.at > (villageOf(p).seenAt ?? 0));
export const markRaidsSeen = (p: Progress, now: number): Progress => ({ ...p, village: { ...villageOf(p), seenAt: now } });
export const troopCount = (a: Partial<Record<TroopId, number>>) => TROOP_IDS.reduce((s, id) => s + (a[id] ?? 0), 0);
