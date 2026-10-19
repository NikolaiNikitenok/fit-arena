// Правила боя на арене: каждый повтор — удар по сопернику.

export const MAX_HP = 100;
export const HIT_DAMAGE = 8;
// Серия повторов без пауз даёт комбо-удар.
export const COMBO_WINDOW_MS = 3000;
export const COMBO_EVERY = 3;
export const COMBO_DAMAGE = 16;

export interface Fighter {
  hp: number;
  maxHp: number;
  // Множитель урона: боссы бьют сильнее.
  power: number;
  hits: number;
  streak: number;
  lastHitAt: number;
}

export interface Battle {
  player: Fighter;
  bot: Fighter;
}

export type Side = keyof Battle;

export interface Strike {
  side: Side;
  damage: number;
  combo: boolean;
}

export interface FighterSetup {
  hp?: number;
  power?: number;
}

const fresh = ({ hp = MAX_HP, power = 1 }: FighterSetup = {}): Fighter => ({
  hp,
  maxHp: hp,
  power,
  hits: 0,
  streak: 0,
  lastHitAt: -Infinity,
});

export function newBattle(setup: { player?: FighterSetup; bot?: FighterSetup } = {}): Battle {
  return { player: fresh(setup.player), bot: fresh(setup.bot) };
}

/** Повтор бойца side в момент t: возвращает новое состояние и нанесённый удар. */
export function strike(battle: Battle, side: Side, t: number): { battle: Battle; strike: Strike } {
  const attacker = battle[side];
  const target: Side = side === 'player' ? 'bot' : 'player';
  const streak = t - attacker.lastHitAt <= COMBO_WINDOW_MS ? attacker.streak + 1 : 1;
  const combo = streak % COMBO_EVERY === 0;
  const damage = Math.round((combo ? COMBO_DAMAGE : HIT_DAMAGE) * attacker.power);
  return {
    battle: {
      ...battle,
      [side]: { ...attacker, hits: attacker.hits + 1, streak, lastHitAt: t },
      [target]: { ...battle[target], hp: Math.max(0, battle[target].hp - damage) },
    },
    strike: { side, damage, combo },
  };
}

/** Победитель: нокаут или больше здоровья (в долях от максимума) по истечении времени. null — бой идёт. */
export function winner(battle: Battle, timeUp: boolean): Side | 'draw' | null {
  if (battle.bot.hp === 0) return 'player';
  if (battle.player.hp === 0) return 'bot';
  if (!timeUp) return null;
  const p = battle.player.hp / battle.player.maxHp;
  const b = battle.bot.hp / battle.bot.maxHp;
  if (p === b) return 'draw';
  return p > b ? 'player' : 'bot';
}

export interface BotLevel {
  name: string;
  // Средний интервал между повторами бота и разброс.
  intervalMs: number;
  jitterMs: number;
}

export const BOT_LEVELS: BotLevel[] = [
  { name: 'Новичок', intervalMs: 3200, jitterMs: 800 },
  { name: 'Боец', intervalMs: 2300, jitterMs: 600 },
  { name: 'Чемпион', intervalMs: 1600, jitterMs: 400 },
];

export function nextBotDelay(level: BotLevel, random = Math.random): number {
  return level.intervalMs + (random() * 2 - 1) * level.jitterMs;
}
