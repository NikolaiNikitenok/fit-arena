// 300 уровней-тренировок: по 100 в каждом из трёх миров, и финальный бой с Князем. Уровни описаны правилами, а не вручную: так нагрузка растёт ровно,
// а цели подстраиваются под результаты входных испытаний игрока.
import type { Exercise } from '../repCounter';
import { LANDS } from './lands';
import { storyFor } from './story';

export type MissionType = 'trial' | 'build' | 'chase' | 'climb' | 'defend' | 'rescue' | 'boss';

export interface Line {
  who: string;
  text: string;
  // Портрет (public/portraits) и цвет рамки.
  face: string;
  color: string;
}

export interface LevelDef {
  id: number;
  // Номер уровня внутри мира, 1–100.
  num: number;
  world: number;
  land: number;
  type: MissionType;
  title: string;
  // Для босса упражнения меняются по фазам.
  exercises: Exercise[];
  // Доля от базы игрока: сколько повторов за минуту ждём на этом уровне.
  load: number;
  seconds: number;
  rest: boolean;
  story: Line[];
  coins: number;
  // Задание дня: без звёзд и без платы жизнью, награду выдаёт само задание.
  daily?: boolean;
}

export const WORLD_SIZE = 100;
export const LAND_SIZE = 10;
// Три мира и последний уровень — Князь Диван.
export const LEVEL_COUNT = WORLD_SIZE * 3 + 1;

const ORDER: Exercise[] = ['squat', 'pushup', 'situp'];

// Миссии внутри земли: позиции 0–8, позиция 9 — босс. Позиция 4 — лёгкий уровень-передышка.
const PATTERN: MissionType[] = ['build', 'chase', 'rescue', 'climb', 'build', 'defend', 'chase', 'rescue', 'climb'];

const TITLES: Record<Exercise, Partial<Record<MissionType, string[]>>> = {
  squat: {
    build: ['Подпорки для моста', 'Новый частокол'],
    chase: ['Бегство от сонного вепря', 'Догони вора'],
    climb: ['Подъём на холм', 'Лестница к маяку'],
    defend: ['Оборона ворот'],
    rescue: ['Разбуди пастухов'],
  },
  pushup: {
    build: ['Мост через пропасть', 'Каменная стена'],
    chase: ['Толкай телегу', 'Уйди от лавины'],
    climb: ['Лебёдка на утёс', 'Подъём ворот'],
    defend: ['Щит против приспешников'],
    rescue: ['Освободи кузнецов'],
  },
  situp: {
    build: ['Колокол тревоги', 'Мельница'],
    chase: ['Гребля по реке', 'Лодка против течения'],
    climb: ['Канат к башне', 'Лифт в шахте'],
    defend: ['Удержи плотину'],
    rescue: ['Расколдуй детей'],
  },
};

function pick<T>(list: T[], seed: number): T {
  return list[seed % list.length];
}

// Нагрузка растёт быстро в начале и плавно выходит на плато: так тренируются по-настоящему,
// без бесконечного роста. От 55% базы до примерно 2,3 базы к концу третьего мира.
function growthAt(id: number): number {
  return 0.55 + 1.9 * (1 - Math.exp(-(id - 1) / 140));
}

function makeLevel(id: number): LevelDef {
  if (id === LEVEL_COUNT) return finalLevel(id);
  const world = Math.floor((id - 1) / WORLD_SIZE);
  const num = ((id - 1) % WORLD_SIZE) + 1;
  const land = Math.floor((id - 1) / LAND_SIZE);
  const pos = (id - 1) % LAND_SIZE;
  const L = LANDS[land];
  const growth = growthAt(id);
  const base = { id, num, world, land };

  // Каждый мир начинается с трёх испытаний силы: база игрока обновляется под новый уровень формы.
  if (num <= 3) {
    const ex = ORDER[num - 1];
    const story = storyFor({ id, world, land, num, pos, type: 'trial', rest: false });
    return { ...base, type: 'trial', title: `Испытание силы: ${['приседания', 'отжимания', 'пресс'][num - 1]}`, exercises: [ex], load: 1, seconds: 60, rest: false, story, coins: 20 };
  }

  if (pos === LAND_SIZE - 1) {
    const exercises = ORDER.slice(land % 3).concat(ORDER.slice(0, land % 3));
    return {
      ...base,
      type: 'boss',
      title: L.boss.name,
      exercises,
      load: growth * 1.1,
      seconds: 120,
      rest: false,
      story: storyFor({ id, world, land, num, pos, type: 'boss', rest: false }),
      coins: 150 + (land % 10) * 30 + world * 100,
    };
  }

  const type = PATTERN[pos];
  const ex = ORDER[(id + land) % 3];
  const rest = pos === 4;
  const story = storyFor({ id, world, land, num, pos, type, rest });
  return {
    ...base,
    type,
    title: pick(TITLES[ex][type] ?? ['Испытание'], id),
    exercises: [ex],
    load: rest ? growth * 0.75 : growth,
    seconds: type === 'build' ? 180 : type === 'defend' ? 75 : 60,
    rest,
    story,
    coins: rest ? 20 : 30 + land * 5,
  };
}

function finalLevel(id: number): LevelDef {
  const land = LANDS.length - 1;
  const L = LANDS[land];
  return {
    id,
    num: 1,
    world: 3,
    land,
    type: 'boss',
    title: L.boss.name,
    exercises: ['squat', 'pushup', 'situp'],
    load: growthAt(id) * 1.15,
    seconds: 180,
    rest: false,
    story: storyFor({ id, world: 3, land, num: 1, pos: 0, type: 'boss', rest: false }),
    coins: 1000,
  };
}

export const LEVELS: LevelDef[] = Array.from({ length: LEVEL_COUNT }, (_, i) => makeLevel(i + 1));

/** База игрока — повторов за минуту по каждому упражнению; до испытаний — средние значения. */
export type Baseline = Record<Exercise, number>;
export const DEFAULT_BASELINE: Baseline = { squat: 20, pushup: 10, situp: 15 };

/** Сколько повторов нужно сделать на уровне. */
export function targetReps(level: LevelDef, baseline: Baseline, exercise = level.exercises[0]): number {
  const perMinute = baseline[exercise] * level.load;
  const minutes = level.type === 'build' ? 1 : level.seconds / 60;
  return Math.max(3, Math.round(perMinute * minutes));
}
