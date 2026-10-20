/**
 * Набеги на деревни других игроков. Пока без сервера: findTarget отдаёт деревню-бота той же силы,
 * submitAttack считает бой здесь же. Серверу достаточно реализовать эти три функции:
 *
 *   findTarget(th, skip)  → сервер подбирает деревню близкого уровня ратуши (раскладка из сохранения
 *                           соперника: baseOf(townOf(progress))), считает lootAvailable(town, now)
 *                           и выдаёт seed боя. Цель «бронируется» на время боя (BATTLE_SECONDS + запас).
 *   submitAttack(attack)  → сервер проверяет validateDeploys, сам вызывает simulateBattle с тем же
 *                           base/loot/seed и войском нападающего из его сохранения, списывает
 *                           result.loot у защитника (applyLoss) и пишет ему DefenseEntry в журнал.
 *   defenseLog()          → набеги на меня с сервера (вместе с локальными набегами Князя).
 *
 * Всё детерминировано: клиент и сервер получают один и тот же BattleResult.
 */
import type { Res } from '../../shared/village';
import { BattleArmy, BattleBase, BattleResult, Deploy, simulateBattle, validateDeploys } from '../../shared/villageBattle';
import { botBase } from '../../shared/villageCamps';
import type { DefenseEntry } from './types';

export interface TargetView {
  id: string;
  name: string;
  // Уровень ратуши.
  level: number;
  layout: BattleBase;
  lootAvailable: Res;
  // Seed боя выдаёт сервер: клиент и сервер считают один и тот же бой.
  seed: number;
}

export interface AttackSubmit {
  targetId: string;
  seed: number;
  army: BattleArmy;
  deploys: Deploy[];
  endTick?: number;
}

export interface AttackOutcome {
  result: BattleResult;
  // Сервер подтвердил результат (у бота — всегда локально).
  verified: boolean;
}

const BOT_NAMES = ['Соня Подушкина', 'Вася Лежебоков', 'Дрёма', 'Бублик', 'Тюфяк', 'Зевака', 'Сплюшка', 'Тётя Перина'];
// Боты, выданные в этом сеансе: чтобы submitAttack знал, по чему считать.
const issued = new Map<string, TargetView>();

/** Найти соперника примерно своего уровня; skip — кого уже пропустили. */
export async function findTarget(th: number, skip: string[] = []): Promise<TargetView> {
  let seed = Date.now() % 1_000_000;
  let id = `bot:${th}:${seed}`;
  while (skip.includes(id)) id = `bot:${th}:${++seed}`;
  const level = Math.max(1, Math.min(8, th + ((seed % 3) - 1)));
  const { base, loot } = botBase(level, seed);
  const view: TargetView = { id, name: BOT_NAMES[seed % BOT_NAMES.length], level, layout: base, lootAvailable: loot, seed };
  issued.set(id, view);
  return view;
}

/** Отправить набег. У ботов результат считается здесь же тем же движком, что и на сервере. */
export async function submitAttack(a: AttackSubmit): Promise<AttackOutcome> {
  const t = issued.get(a.targetId);
  if (!t) throw new Error('цель устарела');
  const input = { base: t.layout, army: a.army, deploys: a.deploys, loot: t.lootAvailable, seed: a.seed, endTick: a.endTick };
  if (validateDeploys(input)) throw new Error('набег не прошёл проверку');
  issued.delete(a.targetId);
  return { result: simulateBattle(input), verified: false };
}

/** Набеги на мою деревню. Без сервера — только набеги Князя, которые посчитаны на телефоне. */
export async function defenseLog(local: DefenseEntry[]): Promise<DefenseEntry[]> {
  return local;
}
