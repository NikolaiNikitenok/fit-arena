// Задание дня от жителей Атлетии: одно упражнение, цель от силы игрока, награда за выполнение.
// Задание одинаковое весь день и меняется в полночь; считаются все повторы этого упражнения за день.
import type { Exercise } from '../repCounter';
import type { Baseline } from './levels';
import { NPCS, type NpcId } from './npcs';

export interface DailyTask {
  date: string;
  npc: NpcId;
  exercise: Exercise;
  target: number;
  // Просьба жителя: «помоги натаскать воды».
  ask: string;
  coins: number;
  potion?: 'vigor' | 'might' | 'swap';
}

const ASKS: { npc: NpcId; exercise: Exercise; ask: string }[] = [
  { npc: 'marfa', exercise: 'squat', ask: 'Внучек, помоги натаскать воды из колодца: каждое приседание — полное ведро.' },
  { npc: 'marfa', exercise: 'pushup', ask: 'Тесто на пироги сегодня тугое, без крепких рук не замесить.' },
  { npc: 'grom', exercise: 'pushup', ask: 'Кузнице нужны сильные руки. Покажи, что мои уроки не прошли даром.' },
  { npc: 'grom', exercise: 'squat', ask: 'Ноги — опора бойца. Сегодня тренируем их так, чтобы гора дрожала.' },
  { npc: 'grom', exercise: 'situp', ask: 'Крепкий живот держит удар. Пресс сегодня — главное оружие.' },
  { npc: 'lisa', exercise: 'situp', ask: 'Тренирую ловкость перед вылазкой. Составишь компанию? Кто больше раз на пресс!' },
  { npc: 'lisa', exercise: 'squat', ask: 'Прыжки по крышам начинаются с приседаний. Не отставай!' },
  { npc: 'fedor', exercise: 'squat', ask: 'Обоз с товаром застрял. Подтолкнёшь? Монет не пожалею.' },
  { npc: 'fedor', exercise: 'pushup', ask: 'Мешки с зерном сами себя не поднимут. Заплачу по-купечески.' },
  { npc: 'boris', exercise: 'pushup', ask: 'Помнишь, как я сам начинал с десятка отжиманий? Давай вместе, на совесть.' },
  { npc: 'boris', exercise: 'situp', ask: 'Спина после огорода гудит, а пресс её бережёт. Покачаемся?' },
  { npc: 'bip', exercise: 'squat', ask: 'БИП! Батареи корабля пусты. Генератор крутится от приседаний. БИП-БИП!' },
  { npc: 'vega', exercise: 'pushup', ask: 'Пилоту нужны стальные руки на штурвале. Это приказ, кадет!' },
  { npc: 'vega', exercise: 'situp', ask: 'Перегрузки при взлёте держит пресс. Тренировка экипажа начинается.' },
];

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 2166136261);

/** Задание на день: просьба по дате, цель — полторы-две силы игрока в этом упражнении. */
export function dailyTask(date: string, baseline: Baseline): DailyTask {
  const h = hash(date);
  const a = ASKS[h % ASKS.length];
  const factor = 1.5 + ((h >>> 8) % 6) / 10;
  const target = Math.max(10, Math.round((baseline[a.exercise] * factor) / 5) * 5);
  const potions = ['vigor', 'might', 'swap'] as const;
  return { date, npc: a.npc, exercise: a.exercise, target, ask: a.ask, coins: 40 + target, potion: (h >>> 4) % 3 === 0 ? potions[(h >>> 12) % 3] : undefined };
}

export const npcName = (id: NpcId) => NPCS[id].name;
