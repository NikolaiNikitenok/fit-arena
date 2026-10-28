// Деревня внутри прогресса игрока: достать, изменить через чистые функции shared/village.ts и положить обратно.
import { Bld, finishDue, newTown, NO_RES, Res, RES_KEYS, STARTER_RES, Town } from '../../shared/village';
import { BattleBase, finishTraining } from '../../shared/villageBattle';
import { boostResearch, finishResearch } from '../../shared/villageLab';
import { villageOf } from '../game/resources';
import type { Progress } from '../game/progress';
import type { PackedBld } from './types';
import { t } from '../i18n';

export const hasTown = (p: Progress) => !!p.village?.b?.length;

/** Деревня из прогресса (до основания — пустая заготовка с ратушей). */
export function townOf(p: Progress): Town {
  const v = villageOf(p);
  if (!v.b?.length) return { ...newTown(v.res) };
  const tm: Town = { res: v.res, b: v.b, n: v.n ?? v.b.length + 1, army: v.army ?? {}, q: v.q ?? [] };
  if (v.tl) tm.tl = v.tl;
  if (v.r) tm.r = v.r;
  return tm;
}

export function withTown(p: Progress, tm: Town): Progress {
  const v = villageOf(p);
  return { ...p, village: { ...v, res: tm.res, b: tm.b, n: tm.n, army: tm.army, q: tm.q, tl: tm.tl, r: tm.r } };
}

// Первый набег — не раньше чем через двое суток после основания.
export const FIRST_RAID_MS = 48 * 3600_000;

/** Основать деревню: ратуша и стартовые запасы сверх добытого в подземелье. */
export function foundTown(p: Progress, now: number): Progress {
  if (hasTown(p)) return p;
  const v = villageOf(p);
  const res: Res = { ...NO_RES };
  for (const k of RES_KEYS) res[k] = v.res[k] + STARTER_RES[k];
  const tm = newTown(res);
  return { ...withTown(p, tm), village: { ...villageOf(withTown(p, tm)), born: now, raidAt: now + FIRST_RAID_MS } };
}

/** Закончить стройки и обучение, срок которых прошёл. Тот же объект, если ничего не изменилось. */
export function tickTown(p: Progress, now: number): Progress {
  if (!hasTown(p)) return p;
  const tm = townOf(p);
  const next = finishResearch(finishTraining(finishDue(tm, now), now), now);
  return next === tm ? p : withTown(p, next);
}

/** Тренировка ускоряет исследование в лаборатории: повтор — минута (shared/villageLab.ts). */
export function boostLab(p: Progress, reps: number): Progress {
  if (!hasTown(p) || !p.village?.r) return p;
  return withTown(p, boostResearch(townOf(p), reps));
}

export const packBase = (base: BattleBase): PackedBld[] => base.buildings.map((b) => [b.i, b.t, b.x, b.y, b.l]);
export const unpackBase = (list: PackedBld[]): BattleBase => ({ buildings: list.map(([i, tm, x, y, l]) => ({ i, t: tm, x, y, l })) });

export const fmtNum = (n: number) => (n >= 10000 ? `${Math.floor(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}k` : String(Math.floor(n)));

/** «2 ч 05 мин», «4 мин», «35 с». */
export function fmtTime(sec: number): string {
  sec = Math.max(0, Math.ceil(sec));
  if (sec >= 86400) return t('{0} д {1} ч', { 0: Math.floor(sec / 86400), 1: Math.floor((sec % 86400) / 3600) });
  if (sec >= 3600) return t('{0} ч {1} мин', { 0: Math.floor(sec / 3600), 1: String(Math.floor((sec % 3600) / 60)).padStart(2, '0') });
  if (sec >= 60) return t('{0} мин{1}', { 0: Math.floor(sec / 60), 1: sec % 60 && sec < 600 ? ` ${sec % 60} с` : '' });
  return t('{0} с', { 0: sec });
}

export const isBusy = (b: Bld) => b.u != null;
