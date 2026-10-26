// Советы строителя: что сейчас можно построить и что улучшить. Сначала то, на что хватает
// запасов и есть свободный строитель, потом — самое дешёвое из остального.
import { affordable, BUILDINGS, type BuildError, type BuildingType, costOf, countOf, freeBuilders, levelCap, maxCount, type Res, RES_KEYS, thLevel, timeOf, type Town, upgradeBlock } from '../../shared/village';

export type Advice =
  | { kind: 'build'; t: BuildingType; have: number; max: number; cost: Res; ok: boolean; why?: BuildError }
  | { kind: 'up'; id: number; t: BuildingType; l: number; cost: Res; ok: boolean; why?: BuildError };

const total = (c: Res) => RES_KEYS.reduce((s, k) => s + c[k], 0);
// Ратушу советуем первой, когда до неё можно дотянуться: она открывает всё остальное.
// Потом новые постройки, потом улучшения; стены и ловушки — в конце, их много и они дешёвые.
const minor = (t: BuildingType) => t === 'wall' || t === 'bomb' || t === 'snare';
const weight = (a: Advice) => (a.ok ? 0 : 1e9) + (a.t === 'townhall' ? -1e8 : 0) + (minor(a.t) ? 5e7 : 0) + (a.kind === 'build' ? -1e7 : 0) + total(a.cost);

export function builderAdvice(town: Town): Advice[] {
  const th = thLevel(town);
  const free = freeBuilders(town) > 0;
  const out: Advice[] = [];
  for (const t of Object.keys(BUILDINGS) as BuildingType[]) {
    if (t === 'townhall') continue;
    const have = countOf(town, t);
    const max = maxCount(t, th);
    if (have >= max) continue;
    const cost = costOf(t, 1);
    const needBuilder = timeOf(t, 1) > 0;
    const why: BuildError | undefined = needBuilder && !free ? 'builders' : !affordable(town.res, cost) ? 'cost' : undefined;
    out.push({ kind: 'build', t, have, max, cost, ok: !why, why });
  }
  // Стен много: из них в совет попадает одна, самая низкая.
  const walls = town.b.filter((b) => b.t === 'wall' && b.u == null).sort((a, b) => a.l - b.l);
  for (const b of town.b) {
    if (b.t === 'wall' && b !== walls[0]) continue;
    if (b.u != null || b.l < 1) continue;
    if (b.t !== 'townhall' && b.l >= levelCap(b.t, th)) continue;
    const why = upgradeBlock(town, b.i);
    if (why === 'max' || why === 'th' || why === 'busy') continue;
    out.push({ kind: 'up', id: b.i, t: b.t, l: b.l, cost: costOf(b.t, b.l + 1), ok: !why, why: why ?? undefined });
  }
  return out.sort((a, b) => weight(a) - weight(b));
}

/** Важные советы, которые можно выполнить сейчас: столько показывает значок на строителях. */
export const adviceCount = (list: Advice[]) => list.filter((a) => a.ok && !minor(a.t)).length;

/** До трёх построек, которые лучше всего улучшить прямо сейчас: над ними зелёная стрелка. */
export const upgradeNow = (list: Advice[]): number[] => list.flatMap((a) => (a.kind === 'up' && a.ok && !minor(a.t) ? [a.id] : [])).slice(0, 3);
