// Что деревня хранит в Progress.village (кроме заряда и запасов). Короткие ключи — сохранение маленькое.
import type { Bld, BuildingType, Res } from '../../shared/village';
import type { BattleArmy, Deploy, TroopId } from '../../shared/villageBattle';

/** Постройка в журнале набегов: [номер, тип, x, y, уровень]. */
export type PackedBld = [number, BuildingType, number, number, number];

export interface DefenseEntry {
  // Когда был набег (мс) и кто нападал.
  at: number;
  who: string;
  stars: number;
  pct: number;
  loot: Res;
  // Сколько тогда было можно унести: для точного повтора.
  avail?: Res;
  // Для повтора боя: seed, войско, высадки и раскладка в тот момент (у последних записей).
  seed: number;
  army: BattleArmy;
  deploys?: Deploy[];
  base?: PackedBld[];
}

export interface VillageExtra {
  b?: Bld[];
  n?: number;
  army?: Partial<Record<TroopId, number>>;
  q?: { t: TroopId; end: number }[];
  // Когда основана деревня.
  born?: number;
  // Забранные награды заданий жителей.
  tasks?: string[];
  // Лучшие звёзды по лагерям Князя Дивана.
  camps?: Record<number, number>;
  // Следующий набег лентяев Князя Дивана.
  raidAt?: number;
  // Набеги на деревню, новые сверху; seenAt — до какого момента игрок их уже видел.
  log?: DefenseEntry[];
  seenAt?: number;
}
