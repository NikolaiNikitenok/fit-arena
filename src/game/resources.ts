/**
 * Заряд и ресурсы деревни. Цепочка: тренировка даёт заряд → заряд тратится на подземелье «три в ряд»
 * → там добываются дерево, камень и золото → они идут на стройку деревни.
 * Чистые функции без сохранения: сохраняет вызывающий (progress.ts).
 */

export type Resource = 'wood' | 'stone' | 'gold';
export const RESOURCES: Resource[] = ['wood', 'stone', 'gold'];
export const RESOURCE_LABELS: Record<Resource, string> = { wood: 'Дерево', stone: 'Камень', gold: 'Золото' };

// Один повтор (или две секунды планки) — один заряд; больше предела не копится.
export const CHARGE_MAX = 300;

export type Resources = Record<Resource, number>;
export const NO_RESOURCES: Resources = { wood: 0, stone: 0, gold: 0 };

export interface Village {
  // Заряд для подземелья.
  charge: number;
  res: Resources;
}

type WithVillage = { village?: Village };

export const villageOf = (p: WithVillage): Village => ({ charge: p.village?.charge ?? 0, res: { ...NO_RESOURCES, ...p.village?.res } });

/** Тренировка заряжает подземелье. */
export function addCharge<P extends WithVillage>(p: P, amount: number): P {
  if (amount <= 0) return p;
  const v = villageOf(p);
  return { ...p, village: { ...p.village, ...v, charge: Math.min(CHARGE_MAX, v.charge + Math.round(amount)) } };
}

/** Потратить заряд; null, если не хватает. */
export function spendCharge<P extends WithVillage>(p: P, amount: number): P | null {
  const v = villageOf(p);
  if (v.charge < amount) return null;
  return { ...p, village: { ...p.village, ...v, charge: v.charge - amount } };
}

export function addResources<P extends WithVillage>(p: P, add: Partial<Resources>): P {
  const v = villageOf(p);
  const res = { ...v.res };
  for (const r of RESOURCES) res[r] += Math.max(0, Math.round(add[r] ?? 0));
  return { ...p, village: { ...p.village, ...v, res } };
}

export const canAfford = (p: WithVillage, cost: Partial<Resources>) => RESOURCES.every((r) => villageOf(p).res[r] >= (cost[r] ?? 0));

/** Потратить ресурсы; null, если не хватает. */
export function spendResources<P extends WithVillage>(p: P, cost: Partial<Resources>): P | null {
  if (!canAfford(p, cost)) return null;
  const v = villageOf(p);
  const res = { ...v.res };
  for (const r of RESOURCES) res[r] -= cost[r] ?? 0;
  return { ...p, village: { ...p.village, ...v, res } };
}
