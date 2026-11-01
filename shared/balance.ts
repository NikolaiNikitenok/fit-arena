// Настройки баланса, которые можно поменять на сервере без нового релиза: файл
// /opt/arena-server/balance.json (server/balance.ts перечитывает его сам), игра забирает их
// при запуске (GET /api/balance) и помнит до следующего. Чего в файле нет — берётся отсюда.
// Каждое число — множитель или порог; всё зажато в разумные пределы, чтобы опечатка не сломала игру.

export interface Balance {
  // Заряд подземелья за повтор (1 — как задумано).
  chargePerRep: number;
  // Вся добыча подземелья.
  dungeonLoot: number;
  // Добыча первых этажей: новичку первое улучшение деревни — за день-два, а не за неделю.
  earlyLoot: number;
  earlyFloors: number;
  // Здоровье врагов в приключении (меньше — легче победить).
  enemyHp: number;
  // Монеты за уровни карты.
  coins: number;
}

export const DEFAULT_BALANCE: Balance = {
  chargePerRep: 1,
  dungeonLoot: 1,
  earlyLoot: 2,
  earlyFloors: 10,
  enemyHp: 1,
  coins: 1,
};

// Пределы: дальше этого правка из файла не уйдёт.
const LIMITS: Record<keyof Balance, [number, number]> = {
  chargePerRep: [0.25, 4],
  dungeonLoot: [0.25, 5],
  earlyLoot: [1, 5],
  earlyFloors: [0, 100],
  enemyHp: [0.5, 2],
  coins: [0.25, 5],
};

/** Разобрать настройки из файла или ответа сервера: лишнее отбросить, числа зажать в пределы. */
export function cleanBalance(raw: unknown): Balance {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_BALANCE };
  for (const k of Object.keys(LIMITS) as (keyof Balance)[]) {
    const v = Number(src[k]);
    if (src[k] == null || !Number.isFinite(v)) continue;
    const [lo, hi] = LIMITS[k];
    out[k] = Math.min(hi, Math.max(lo, v));
  }
  return out;
}

let current: Balance = DEFAULT_BALANCE;
export const balance = (): Balance => current;
export const setBalance = (raw: unknown): Balance => (current = cleanBalance(raw));
