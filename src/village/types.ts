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
  // Уровень героя, который охранял деревню (для повтора).
  hero?: number;
  // Нападающий сдался на этом тике (для точного повтора).
  endTick?: number;
  // Набег живого игрока: номер набега на сервере, кубки, до какого момента можно отомстить.
  id?: string;
  trophies?: number;
  revengeUntil?: number;
  revenged?: boolean;
}

/** Набеги на других игроков: что телефон уже применил и последнее, что сказал сервер. */
export interface PvpExtra {
  // Набеги на меня, уже списанные с запасов (по номеру с сервера).
  def?: string[];
  // Мои набеги, добыча которых уже в запасах.
  won?: string[];
  trophies?: number;
  league?: string;
  // До какого момента щит (по часам телефона).
  shieldUntil?: number;
}

export interface VillageExtra {
  b?: Bld[];
  n?: number;
  army?: Partial<Record<TroopId, number>>;
  q?: { t: TroopId; end: number }[];
  // Уровни отрядов из лаборатории и идущее исследование.
  tl?: Partial<Record<TroopId, number>>;
  r?: { t: TroopId; end: number };
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
  pvp?: PvpExtra;
}
