// Задание дня от жителей Атлетии: одно упражнение, цель от силы игрока, награда за выполнение.
// Задание одинаковое весь день и меняется в полночь; считаются все повторы этого упражнения за день.
import { DEFAULT_PLANK_S, isTimed, type Exercise } from '../repCounter';
import type { Baseline } from './levels';
import { NPCS, type NpcId } from './npcs';
import { t } from '../i18n';

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
  { npc: 'marfa', exercise: 'squat', ask: t('Внучек, помоги натаскать воды из колодца: каждое приседание — полное ведро.') },
  { npc: 'marfa', exercise: 'pushup', ask: t('Тесто на пироги сегодня тугое, без крепких рук не замесить.') },
  { npc: 'grom', exercise: 'pushup', ask: t('Кузнице нужны сильные руки. Покажи, что мои уроки не прошли даром.') },
  { npc: 'grom', exercise: 'squat', ask: t('Ноги — опора бойца. Сегодня тренируем их так, чтобы гора дрожала.') },
  { npc: 'grom', exercise: 'situp', ask: t('Крепкий живот держит удар. Пресс сегодня — главное оружие.') },
  { npc: 'lisa', exercise: 'situp', ask: t('Тренирую ловкость перед вылазкой. Составишь компанию? Кто больше раз на пресс!') },
  { npc: 'lisa', exercise: 'squat', ask: t('Прыжки по крышам начинаются с приседаний. Не отставай!') },
  { npc: 'fedor', exercise: 'squat', ask: t('Обоз с товаром застрял. Подтолкнёшь? Монет не пожалею.') },
  { npc: 'fedor', exercise: 'pushup', ask: t('Мешки с зерном сами себя не поднимут. Заплачу по-купечески.') },
  { npc: 'boris', exercise: 'pushup', ask: t('Помнишь, как я сам начинал с десятка отжиманий? Давай вместе, на совесть.') },
  { npc: 'boris', exercise: 'situp', ask: t('Спина после огорода гудит, а пресс её бережёт. Покачаемся?') },
  { npc: 'bip', exercise: 'squat', ask: t('БИП! Батареи корабля пусты. Генератор крутится от приседаний. БИП-БИП!') },
  { npc: 'vega', exercise: 'pushup', ask: t('Пилоту нужны стальные руки на штурвале. Это приказ, кадет!') },
  { npc: 'vega', exercise: 'situp', ask: t('Перегрузки при взлёте держит пресс. Тренировка экипажа начинается.') },
  // Планка: цель в секундах за день, можно набрать несколькими подходами.
  { npc: 'grom', exercise: 'plank', ask: t('Боец, который стоит как скала, не падает от удара. Постой в планке, пока я считаю.') },
  { npc: 'vega', exercise: 'plank', ask: t('Невесомость не прощает слабого корпуса. Держим планку, кадет, по секундомеру!') },
];

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 2166136261);

/** Задание на день: просьба по дате, цель — полторы-две силы игрока в этом упражнении. */
export function dailyTask(date: string, baseline: Baseline): DailyTask {
  const h = hash(date);
  const a = ASKS[h % ASKS.length];
  const factor = 1.5 + ((h >>> 8) % 6) / 10;
  const target = Math.max(10, Math.round(((baseline[a.exercise] ?? DEFAULT_PLANK_S) * factor) / 5) * 5);
  const potions = ['vigor', 'might', 'swap'] as const;
  // Секунда планки легче повтора: монеты как за повторы того же труда.
  const coins = 40 + (isTimed(a.exercise) ? Math.round(target / 2) : target);
  return { date, npc: a.npc, exercise: a.exercise, target, ask: a.ask, coins, potion: (h >>> 4) % 3 === 0 ? potions[(h >>> 12) % 3] : undefined };
}

export const npcName = (id: NpcId) => NPCS[id].name;
