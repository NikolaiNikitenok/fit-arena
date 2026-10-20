// Каталог упражнений для зала. Движение × снаряд: «Жим лёжа» со штангой, гантелями, в Смите — разные упражнения
// со своими рекордами. id = «движение.снаряд», он же ключ в дневнике, поэтому id не меняем.

export type Muscle = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'legs' | 'glutes' | 'abs' | 'calves' | 'forearms' | 'cardio';
export type Equip = 'bb' | 'db' | 'cable' | 'machine' | 'smith' | 'kb' | 'bw' | 'band' | 'ez' | 'trap' | 'plate';
// Как записывается подход: вес × повторы, повторы (с доп. весом по желанию), время, кардио (минуты и км).
export type GymKind = 'w' | 'bw' | 't' | 'c';

export interface GymExercise {
  id: string;
  name: string;
  muscle: Muscle;
  equip: Equip;
  kind: GymKind;
}

export const MUSCLES: { id: Muscle; label: string; color: string }[] = [
  { id: 'chest', label: 'Грудь', color: '#ff8a5c' },
  { id: 'back', label: 'Спина', color: '#60a5fa' },
  { id: 'legs', label: 'Ноги', color: '#6ee7b7' },
  { id: 'glutes', label: 'Ягодицы', color: '#f472b6' },
  { id: 'shoulders', label: 'Плечи', color: '#fbbf24' },
  { id: 'biceps', label: 'Бицепс', color: '#c4b5fd' },
  { id: 'triceps', label: 'Трицепс', color: '#a78bfa' },
  { id: 'abs', label: 'Пресс', color: '#fb7185' },
  { id: 'calves', label: 'Икры', color: '#34d399' },
  { id: 'forearms', label: 'Предплечья', color: '#fdba74' },
  { id: 'cardio', label: 'Кардио', color: '#38bdf8' },
];
export const muscleOf = (m: Muscle) => MUSCLES.find((x) => x.id === m)!;

export const EQUIP_LABELS: Record<Equip, string> = {
  bb: 'Штанга',
  db: 'Гантели',
  cable: 'Блок',
  machine: 'Тренажёр',
  smith: 'Смит',
  kb: 'Гиря',
  bw: 'Свой вес',
  band: 'Резина',
  ez: 'EZ-гриф',
  trap: 'Трэп-гриф',
  plate: 'Блин',
};

// [ключ, название, мышцы, снаряды, как записывать (по умолчанию вес × повторы)]
type Row = [string, string, Muscle, Equip[], GymKind?];

const ROWS: Row[] = [
  // Грудь
  ['bench', 'Жим лёжа', 'chest', ['bb', 'db', 'smith', 'machine']],
  ['incline', 'Жим на наклонной скамье', 'chest', ['bb', 'db', 'smith', 'machine']],
  ['decline', 'Жим на скамье с обратным наклоном', 'chest', ['bb', 'db', 'smith']],
  ['closebench', 'Жим узким хватом', 'triceps', ['bb', 'smith']],
  ['floorpress', 'Жим лёжа с пола', 'chest', ['bb', 'db']],
  ['fly', 'Разводка лёжа', 'chest', ['db', 'cable']],
  ['inclinefly', 'Разводка на наклонной', 'chest', ['db', 'cable']],
  ['pecdeck', 'Сведение рук (бабочка)', 'chest', ['machine']],
  ['crossover', 'Кроссовер', 'chest', ['cable']],
  ['lowcrossover', 'Кроссовер снизу вверх', 'chest', ['cable']],
  ['chestpress', 'Жим от груди сидя', 'chest', ['machine']],
  ['pullover', 'Пуловер', 'chest', ['db', 'cable']],
  ['dips', 'Отжимания на брусьях', 'chest', ['bw'], 'bw'],
  ['assistdips', 'Отжимания на брусьях в гравитроне', 'chest', ['machine']],
  ['pushups', 'Отжимания от пола', 'chest', ['bw'], 'bw'],
  ['svend', 'Жим Свенда', 'chest', ['plate']],
  ['hammerpress', 'Жим в рычажном тренажёре', 'chest', ['machine']],
  ['inclinepress', 'Жим вверх в тренажёре', 'chest', ['machine']],
  ['spoto', 'Жим Спото', 'chest', ['bb']],
  ['squeeze', 'Жим гантелей сжатием', 'chest', ['db']],
  // Спина
  ['deadlift', 'Становая тяга', 'back', ['bb', 'trap', 'db']],
  ['sumo', 'Становая тяга сумо', 'back', ['bb']],
  ['rack', 'Тяга с плинтов', 'back', ['bb']],
  ['pulldown', 'Вертикальная тяга', 'back', ['cable', 'machine']],
  ['closepulldown', 'Вертикальная тяга узким хватом', 'back', ['cable']],
  ['behindpulldown', 'Тяга за голову', 'back', ['cable']],
  ['pullup', 'Подтягивания', 'back', ['bw'], 'bw'],
  ['chinup', 'Подтягивания обратным хватом', 'back', ['bw'], 'bw'],
  ['assistpullup', 'Подтягивания в гравитроне', 'back', ['machine']],
  ['row', 'Тяга в наклоне', 'back', ['bb', 'db', 'smith']],
  ['pendlay', 'Тяга Пендли', 'back', ['bb']],
  ['onearm', 'Тяга одной рукой', 'back', ['db', 'cable']],
  ['tbar', 'Тяга Т-грифа', 'back', ['bb', 'machine']],
  ['seatedrow', 'Горизонтальная тяга', 'back', ['cable', 'machine']],
  ['chestrow', 'Тяга с упором в грудь', 'back', ['db', 'machine']],
  ['straightpd', 'Пуловер на блоке прямыми руками', 'back', ['cable']],
  ['hyper', 'Гиперэкстензия', 'back', ['bw', 'plate'], 'bw'],
  ['goodmorning', 'Наклоны со штангой (гуд морнинг)', 'back', ['bb']],
  ['shrug', 'Шраги', 'back', ['bb', 'db', 'smith', 'trap']],
  ['invrow', 'Австралийские подтягивания', 'back', ['bw'], 'bw'],
  ['kbswing', 'Махи гирей', 'back', ['kb']],
  ['meadows', 'Тяга Мидоуза', 'back', ['bb']],
  ['sealrow', 'Тяга лёжа на скамье', 'back', ['bb', 'db']],
  ['highrow', 'Тяга сверху в рычажном', 'back', ['machine']],
  ['kbrow', 'Тяга гири в наклоне', 'back', ['kb']],
  ['muscleup', 'Выход силой', 'back', ['bw'], 'bw'],
  // Плечи
  ['ohp', 'Жим стоя (армейский)', 'shoulders', ['bb', 'db', 'smith']],
  ['seatedpress', 'Жим сидя', 'shoulders', ['bb', 'db', 'smith', 'machine']],
  ['arnold', 'Жим Арнольда', 'shoulders', ['db']],
  ['pushpress', 'Швунг жимовой', 'shoulders', ['bb']],
  ['lateral', 'Махи в стороны', 'shoulders', ['db', 'cable', 'machine']],
  ['front', 'Подъём перед собой', 'shoulders', ['db', 'cable', 'bb', 'plate']],
  ['reardelt', 'Махи в наклоне', 'shoulders', ['db', 'cable']],
  ['reverseFly', 'Обратная бабочка', 'shoulders', ['machine']],
  ['facepull', 'Тяга к лицу', 'shoulders', ['cable', 'band']],
  ['upright', 'Тяга к подбородку', 'shoulders', ['bb', 'db', 'cable', 'ez']],
  ['landmine', 'Жим landmine', 'shoulders', ['bb']],
  ['kbpress', 'Жим гири', 'shoulders', ['kb']],
  ['ytw', 'Подъёмы Y-T-W лёжа', 'shoulders', ['db']],
  ['cuban', 'Кубинский жим', 'shoulders', ['db', 'bb']],
  ['extrot', 'Наружная ротация плеча', 'shoulders', ['cable', 'db', 'band']],
  ['pikepush', 'Отжимания пайк', 'shoulders', ['bw'], 'bw'],
  ['handstand', 'Отжимания в стойке на руках', 'shoulders', ['bw'], 'bw'],
  // Бицепс
  ['curl', 'Подъём на бицепс', 'biceps', ['bb', 'db', 'ez', 'cable']],
  ['hammer', 'Молотки', 'biceps', ['db', 'cable']],
  ['preacher', 'Скамья Скотта', 'biceps', ['ez', 'db', 'machine']],
  ['inclinecurl', 'Сгибания на наклонной скамье', 'biceps', ['db']],
  ['concentration', 'Концентрированный подъём', 'biceps', ['db']],
  ['spider', 'Паучьи сгибания', 'biceps', ['db', 'ez']],
  ['reversecurl', 'Подъём обратным хватом', 'forearms', ['bb', 'ez', 'cable']],
  ['bayesian', 'Сгибания Байесиан', 'biceps', ['cable']],
  ['zottman', 'Сгибания Зоттмана', 'biceps', ['db']],
  ['bandcurl', 'Сгибания с резиной', 'biceps', ['band'], 'bw'],
  // Трицепс
  ['pushdown', 'Разгибания на блоке', 'triceps', ['cable']],
  ['ropepd', 'Разгибания на блоке с канатом', 'triceps', ['cable']],
  ['skull', 'Французский жим', 'triceps', ['ez', 'bb', 'db']],
  ['overheadext', 'Разгибания из-за головы', 'triceps', ['db', 'cable', 'ez']],
  ['kickback', 'Разгибания в наклоне', 'triceps', ['db', 'cable']],
  ['benchdips', 'Обратные отжимания от скамьи', 'triceps', ['bw'], 'bw'],
  ['tridips', 'Брусья на трицепс', 'triceps', ['bw', 'machine'], 'bw'],
  ['jm', 'Жим JM', 'triceps', ['bb', 'smith']],
  ['diamond', 'Алмазные отжимания', 'triceps', ['bw'], 'bw'],
  ['tate', 'Жим Тейта', 'triceps', ['db']],
  ['triext', 'Разгибания в тренажёре', 'triceps', ['machine']],
  // Ноги
  ['squat', 'Приседания', 'legs', ['bb', 'db', 'smith', 'kb']],
  ['frontsquat', 'Фронтальные приседания', 'legs', ['bb']],
  ['goblet', 'Гоблет-присед', 'legs', ['db', 'kb']],
  ['boxsquat', 'Присед на ящик', 'legs', ['bb']],
  ['hack', 'Гакк-присед', 'legs', ['machine', 'bb']],
  ['legpress', 'Жим ногами', 'legs', ['machine']],
  ['legext', 'Разгибания ног', 'legs', ['machine']],
  ['legcurl', 'Сгибания ног лёжа', 'legs', ['machine']],
  ['seatedcurl', 'Сгибания ног сидя', 'legs', ['machine']],
  ['lunge', 'Выпады', 'legs', ['bb', 'db', 'bw', 'smith']],
  ['walklunge', 'Выпады в ходьбе', 'legs', ['db', 'bw']],
  ['bulgarian', 'Болгарские сплит-приседания', 'legs', ['db', 'bb', 'smith', 'bw']],
  ['stepup', 'Зашагивания на тумбу', 'legs', ['db', 'bb', 'bw']],
  ['rdl', 'Румынская тяга', 'legs', ['bb', 'db', 'smith']],
  ['stiff', 'Тяга на прямых ногах', 'legs', ['bb', 'db']],
  ['sissy', 'Сисси-присед', 'legs', ['bw'], 'bw'],
  ['pistol', 'Пистолетик', 'legs', ['bw'], 'bw'],
  ['bwsquat', 'Приседания без веса', 'legs', ['bw'], 'bw'],
  ['nordic', 'Нордические сгибания', 'legs', ['bw'], 'bw'],
  ['adductor', 'Сведение ног', 'legs', ['machine']],
  ['beltsquat', 'Присед с поясом', 'legs', ['machine']],
  ['pendulum', 'Маятниковый присед', 'legs', ['machine']],
  ['zercher', 'Присед Зерчера', 'legs', ['bb']],
  ['reverselunge', 'Обратные выпады', 'legs', ['db', 'bb', 'bw']],
  ['wallsit', 'Стульчик у стены', 'legs', ['bw'], 't'],
  // Ягодицы
  ['hipthrust', 'Ягодичный мост', 'glutes', ['bb', 'machine', 'smith', 'db']],
  ['glutebridge', 'Мостик с пола', 'glutes', ['bw', 'bb'], 'bw'],
  ['abductor', 'Разведение ног', 'glutes', ['machine']],
  ['kickbackleg', 'Отведение ноги назад', 'glutes', ['cable', 'machine']],
  ['pullthrough', 'Тяга между ног', 'glutes', ['cable']],
  ['sidelunge', 'Боковые выпады', 'glutes', ['db', 'bw']],
  ['frog', 'Лягушка', 'glutes', ['bw'], 'bw'],
  ['singlerdl', 'Румынская тяга на одной ноге', 'glutes', ['db', 'kb']],
  ['reversehyper', 'Обратная гиперэкстензия', 'glutes', ['machine', 'bw']],
  // Икры
  ['calfstand', 'Подъём на носки стоя', 'calves', ['machine', 'smith', 'db', 'bw']],
  ['calfseat', 'Подъём на носки сидя', 'calves', ['machine']],
  ['calfpress', 'Носки в жиме ногами', 'calves', ['machine']],
  ['donkey', 'Ослиные подъёмы на носки', 'calves', ['machine']],
  ['tibia', 'Подъём носков на себя', 'calves', ['machine', 'plate']],
  // Пресс
  ['crunch', 'Скручивания', 'abs', ['bw'], 'bw'],
  ['cablecrunch', 'Скручивания на блоке', 'abs', ['cable']],
  ['machinecrunch', 'Скручивания в тренажёре', 'abs', ['machine']],
  ['situp', 'Подъёмы корпуса', 'abs', ['bw', 'plate'], 'bw'],
  ['legraise', 'Подъём ног в висе', 'abs', ['bw'], 'bw'],
  ['lyingleg', 'Подъём ног лёжа', 'abs', ['bw'], 'bw'],
  ['kneeraise', 'Подъём коленей в упоре', 'abs', ['bw'], 'bw'],
  ['russian', 'Русские скручивания', 'abs', ['bw', 'plate', 'db'], 'bw'],
  ['plank', 'Планка', 'abs', ['bw'], 't'],
  ['sideplank', 'Боковая планка', 'abs', ['bw'], 't'],
  ['abwheel', 'Ролик для пресса', 'abs', ['bw'], 'bw'],
  ['woodchop', 'Дровосек', 'abs', ['cable']],
  ['pallof', 'Пресс Паллофа', 'abs', ['cable', 'band'], 'bw'],
  ['vup', 'Складка', 'abs', ['bw'], 'bw'],
  ['dragon', 'Флажок дракона', 'abs', ['bw'], 'bw'],
  ['hollow', 'Лодочка', 'abs', ['bw'], 't'],
  // Предплечья и хват
  ['wristcurl', 'Сгибания запястий', 'forearms', ['bb', 'db']],
  ['revwrist', 'Разгибания запястий', 'forearms', ['bb', 'db']],
  ['farmer', 'Прогулка фермера', 'forearms', ['db', 'kb', 'trap']],
  ['hang', 'Вис на турнике', 'forearms', ['bw'], 't'],
  ['platepinch', 'Удержание блинов', 'forearms', ['plate'], 't'],
  // Функциональные
  ['clean', 'Взятие на грудь', 'legs', ['bb', 'db', 'kb']],
  ['snatch', 'Рывок', 'legs', ['bb', 'db', 'kb']],
  ['thruster', 'Трастер', 'legs', ['bb', 'db', 'kb']],
  ['burpee', 'Бёрпи', 'cardio', ['bw'], 'bw'],
  ['boxjump', 'Прыжки на тумбу', 'legs', ['bw'], 'bw'],
  ['wallball', 'Броски мяча в стену', 'legs', ['bw'], 'bw'],
  ['tgu', 'Турецкий подъём', 'shoulders', ['kb', 'db']],
  ['sled', 'Толкание саней', 'legs', ['machine']],
  // Кардио
  ['treadmill', 'Беговая дорожка', 'cardio', ['machine'], 'c'],
  ['bike', 'Велотренажёр', 'cardio', ['machine'], 'c'],
  ['elliptical', 'Эллипс', 'cardio', ['machine'], 'c'],
  ['rowing', 'Гребной тренажёр', 'cardio', ['machine'], 'c'],
  ['stairs', 'Степпер (лестница)', 'cardio', ['machine'], 'c'],
  ['skierg', 'Лыжный тренажёр', 'cardio', ['machine'], 'c'],
  ['airbike', 'Эйрбайк', 'cardio', ['machine'], 'c'],
  ['run', 'Бег', 'cardio', ['bw'], 'c'],
  ['walk', 'Ходьба в горку', 'cardio', ['machine'], 'c'],
  ['rope', 'Скакалка', 'cardio', ['bw'], 't'],
  ['battle', 'Канаты', 'cardio', ['bw'], 't'],
];

export const GYM_EXERCISES: GymExercise[] = ROWS.flatMap(([key, name, muscle, equips, kind]) =>
  equips.map((equip) => ({
    id: `${key}.${equip}`,
    // Упражнения с одним вариантом «без снаряда» подписываем без скобок.
    name: equips.length === 1 && (equip === 'bw' || kind === 'c') ? name : `${name} (${EQUIP_LABELS[equip]})`,
    muscle,
    equip,
    // С весом на поясе подтягивания и брусья записываются как «повторы + доп. вес», а снаряды — вес × повторы.
    kind: kind === 't' || kind === 'c' ? kind : equip === 'bw' || equip === 'band' ? 'bw' : 'w',
  })),
);

const BY_ID = new Map(GYM_EXERCISES.map((e) => [e.id, e]));
// Своё упражнение, которого нет в каталоге: id вида «my.<имя>».
export const gymExercise = (id: string): GymExercise =>
  BY_ID.get(id) ?? { id, name: id.startsWith('my.') ? id.slice(3) : id, muscle: 'chest', equip: 'bw', kind: 'w' };
export const customId = (name: string) => `my.${name.trim().replace(/\s+/g, ' ').slice(0, 40)}`;

/** Поиск по названию: все слова запроса в любом порядке. */
export function searchGym(query: string, muscle?: Muscle | null): GymExercise[] {
  const words = query.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean);
  return GYM_EXERCISES.filter((e) => {
    if (muscle && e.muscle !== muscle) return false;
    const n = e.name.toLowerCase().replace(/ё/g, 'е');
    return words.every((w) => n.includes(w));
  });
}
