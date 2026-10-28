// Каталог упражнений для зала. Движение × снаряд: «Жим лёжа» со штангой, гантелями, в Смите — разные упражнения
// со своими рекордами. id = «движение.снаряд», он же ключ в дневнике, поэтому id не меняем.
import { t } from '../i18n';

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
  { id: 'chest', label: t('Грудь'), color: '#ff8a5c' },
  { id: 'back', label: t('Спина'), color: '#60a5fa' },
  { id: 'legs', label: t('Ноги'), color: '#6ee7b7' },
  { id: 'glutes', label: t('Ягодицы'), color: '#f472b6' },
  { id: 'shoulders', label: t('Плечи'), color: '#fbbf24' },
  { id: 'biceps', label: t('Бицепс'), color: '#c4b5fd' },
  { id: 'triceps', label: t('Трицепс'), color: '#a78bfa' },
  { id: 'abs', label: t('Пресс'), color: '#fb7185' },
  { id: 'calves', label: t('Икры'), color: '#34d399' },
  { id: 'forearms', label: t('Предплечья'), color: '#fdba74' },
  { id: 'cardio', label: t('Кардио'), color: '#38bdf8' },
];
export const muscleOf = (m: Muscle) => MUSCLES.find((x) => x.id === m)!;

export const EQUIP_LABELS: Record<Equip, string> = {
  bb: t('Штанга'),
  db: t('Гантели'),
  cable: t('Блок'),
  machine: t('Тренажёр'),
  smith: t('Смит'),
  kb: t('Гиря'),
  bw: t('Свой вес'),
  band: t('Резина'),
  ez: t('EZ-гриф'),
  trap: t('Трэп-гриф'),
  plate: t('Блин'),
};

// [ключ, название, мышцы, снаряды, как записывать (по умолчанию вес × повторы)]
type Row = [string, string, Muscle, Equip[], GymKind?];

const ROWS: Row[] = [
  // Грудь
  ['bench', t('Жим лёжа'), 'chest', ['bb', 'db', 'smith', 'machine']],
  ['incline', t('Жим на наклонной скамье'), 'chest', ['bb', 'db', 'smith', 'machine']],
  ['decline', t('Жим на скамье с обратным наклоном'), 'chest', ['bb', 'db', 'smith']],
  ['closebench', t('Жим узким хватом'), 'triceps', ['bb', 'smith']],
  ['floorpress', t('Жим лёжа с пола'), 'chest', ['bb', 'db']],
  ['fly', t('Разводка лёжа'), 'chest', ['db', 'cable']],
  ['inclinefly', t('Разводка на наклонной'), 'chest', ['db', 'cable']],
  ['pecdeck', t('Сведение рук (бабочка)'), 'chest', ['machine']],
  ['crossover', t('Кроссовер'), 'chest', ['cable']],
  ['lowcrossover', t('Кроссовер снизу вверх'), 'chest', ['cable']],
  ['chestpress', t('Жим от груди сидя'), 'chest', ['machine']],
  ['pullover', t('Пуловер'), 'chest', ['db', 'cable']],
  ['dips', t('Отжимания на брусьях'), 'chest', ['bw'], 'bw'],
  ['assistdips', t('Отжимания на брусьях в гравитроне'), 'chest', ['machine']],
  ['pushups', t('Отжимания от пола'), 'chest', ['bw'], 'bw'],
  ['svend', t('Жим Свенда'), 'chest', ['plate']],
  ['hammerpress', t('Жим в рычажном тренажёре'), 'chest', ['machine']],
  ['inclinepress', t('Жим вверх в тренажёре'), 'chest', ['machine']],
  ['spoto', t('Жим Спото'), 'chest', ['bb']],
  ['squeeze', t('Жим гантелей сжатием'), 'chest', ['db']],
  // Спина
  ['deadlift', t('Становая тяга'), 'back', ['bb', 'trap', 'db']],
  ['sumo', t('Становая тяга сумо'), 'back', ['bb']],
  ['rack', t('Тяга с плинтов'), 'back', ['bb']],
  ['pulldown', t('Вертикальная тяга'), 'back', ['cable', 'machine']],
  ['closepulldown', t('Вертикальная тяга узким хватом'), 'back', ['cable']],
  ['behindpulldown', t('Тяга за голову'), 'back', ['cable']],
  ['pullup', t('Подтягивания'), 'back', ['bw'], 'bw'],
  ['chinup', t('Подтягивания обратным хватом'), 'back', ['bw'], 'bw'],
  ['assistpullup', t('Подтягивания в гравитроне'), 'back', ['machine']],
  ['row', t('Тяга в наклоне'), 'back', ['bb', 'db', 'smith']],
  ['pendlay', t('Тяга Пендли'), 'back', ['bb']],
  ['onearm', t('Тяга одной рукой'), 'back', ['db', 'cable']],
  ['tbar', t('Тяга Т-грифа'), 'back', ['bb', 'machine']],
  ['seatedrow', t('Горизонтальная тяга'), 'back', ['cable', 'machine']],
  ['chestrow', t('Тяга с упором в грудь'), 'back', ['db', 'machine']],
  ['straightpd', t('Пуловер на блоке прямыми руками'), 'back', ['cable']],
  ['hyper', t('Гиперэкстензия'), 'back', ['bw', 'plate'], 'bw'],
  ['goodmorning', t('Наклоны со штангой (гуд морнинг)'), 'back', ['bb']],
  ['shrug', t('Шраги'), 'back', ['bb', 'db', 'smith', 'trap']],
  ['invrow', t('Австралийские подтягивания'), 'back', ['bw'], 'bw'],
  ['kbswing', t('Махи гирей'), 'back', ['kb']],
  ['meadows', t('Тяга Мидоуза'), 'back', ['bb']],
  ['sealrow', t('Тяга лёжа на скамье'), 'back', ['bb', 'db']],
  ['highrow', t('Тяга сверху в рычажном'), 'back', ['machine']],
  ['kbrow', t('Тяга гири в наклоне'), 'back', ['kb']],
  ['muscleup', t('Выход силой'), 'back', ['bw'], 'bw'],
  // Плечи
  ['ohp', t('Жим стоя (армейский)'), 'shoulders', ['bb', 'db', 'smith']],
  ['seatedpress', t('Жим сидя'), 'shoulders', ['bb', 'db', 'smith', 'machine']],
  ['arnold', t('Жим Арнольда'), 'shoulders', ['db']],
  ['pushpress', t('Швунг жимовой'), 'shoulders', ['bb']],
  ['lateral', t('Махи в стороны'), 'shoulders', ['db', 'cable', 'machine']],
  ['front', t('Подъём перед собой'), 'shoulders', ['db', 'cable', 'bb', 'plate']],
  ['reardelt', t('Махи в наклоне'), 'shoulders', ['db', 'cable']],
  ['reverseFly', t('Обратная бабочка'), 'shoulders', ['machine']],
  ['facepull', t('Тяга к лицу'), 'shoulders', ['cable', 'band']],
  ['upright', t('Тяга к подбородку'), 'shoulders', ['bb', 'db', 'cable', 'ez']],
  ['landmine', t('Жим landmine'), 'shoulders', ['bb']],
  ['kbpress', t('Жим гири'), 'shoulders', ['kb']],
  ['ytw', t('Подъёмы Y-T-W лёжа'), 'shoulders', ['db']],
  ['cuban', t('Кубинский жим'), 'shoulders', ['db', 'bb']],
  ['extrot', t('Наружная ротация плеча'), 'shoulders', ['cable', 'db', 'band']],
  ['pikepush', t('Отжимания пайк'), 'shoulders', ['bw'], 'bw'],
  ['handstand', t('Отжимания в стойке на руках'), 'shoulders', ['bw'], 'bw'],
  // Бицепс
  ['curl', t('Подъём на бицепс'), 'biceps', ['bb', 'db', 'ez', 'cable']],
  ['hammer', t('Молотки'), 'biceps', ['db', 'cable']],
  ['preacher', t('Скамья Скотта'), 'biceps', ['ez', 'db', 'machine']],
  ['inclinecurl', t('Сгибания на наклонной скамье'), 'biceps', ['db']],
  ['concentration', t('Концентрированный подъём'), 'biceps', ['db']],
  ['spider', t('Паучьи сгибания'), 'biceps', ['db', 'ez']],
  ['reversecurl', t('Подъём обратным хватом'), 'forearms', ['bb', 'ez', 'cable']],
  ['bayesian', t('Сгибания Байесиан'), 'biceps', ['cable']],
  ['zottman', t('Сгибания Зоттмана'), 'biceps', ['db']],
  ['bandcurl', t('Сгибания с резиной'), 'biceps', ['band'], 'bw'],
  // Трицепс
  ['pushdown', t('Разгибания на блоке'), 'triceps', ['cable']],
  ['ropepd', t('Разгибания на блоке с канатом'), 'triceps', ['cable']],
  ['skull', t('Французский жим'), 'triceps', ['ez', 'bb', 'db']],
  ['overheadext', t('Разгибания из-за головы'), 'triceps', ['db', 'cable', 'ez']],
  ['kickback', t('Разгибания в наклоне'), 'triceps', ['db', 'cable']],
  ['benchdips', t('Обратные отжимания от скамьи'), 'triceps', ['bw'], 'bw'],
  ['tridips', t('Брусья на трицепс'), 'triceps', ['bw', 'machine'], 'bw'],
  ['jm', t('Жим JM'), 'triceps', ['bb', 'smith']],
  ['diamond', t('Алмазные отжимания'), 'triceps', ['bw'], 'bw'],
  ['tate', t('Жим Тейта'), 'triceps', ['db']],
  ['triext', t('Разгибания в тренажёре'), 'triceps', ['machine']],
  // Ноги
  ['squat', t('Приседания'), 'legs', ['bb', 'db', 'smith', 'kb']],
  ['frontsquat', t('Фронтальные приседания'), 'legs', ['bb']],
  ['goblet', t('Гоблет-присед'), 'legs', ['db', 'kb']],
  ['boxsquat', t('Присед на ящик'), 'legs', ['bb']],
  ['hack', t('Гакк-присед'), 'legs', ['machine', 'bb']],
  ['legpress', t('Жим ногами'), 'legs', ['machine']],
  ['legext', t('Разгибания ног'), 'legs', ['machine']],
  ['legcurl', t('Сгибания ног лёжа'), 'legs', ['machine']],
  ['seatedcurl', t('Сгибания ног сидя'), 'legs', ['machine']],
  ['lunge', t('Выпады'), 'legs', ['bb', 'db', 'bw', 'smith']],
  ['walklunge', t('Выпады в ходьбе'), 'legs', ['db', 'bw']],
  ['bulgarian', t('Болгарские сплит-приседания'), 'legs', ['db', 'bb', 'smith', 'bw']],
  ['stepup', t('Зашагивания на тумбу'), 'legs', ['db', 'bb', 'bw']],
  ['rdl', t('Румынская тяга'), 'legs', ['bb', 'db', 'smith']],
  ['stiff', t('Тяга на прямых ногах'), 'legs', ['bb', 'db']],
  ['sissy', t('Сисси-присед'), 'legs', ['bw'], 'bw'],
  ['pistol', t('Пистолетик'), 'legs', ['bw'], 'bw'],
  ['bwsquat', t('Приседания без веса'), 'legs', ['bw'], 'bw'],
  ['nordic', t('Нордические сгибания'), 'legs', ['bw'], 'bw'],
  ['adductor', t('Сведение ног'), 'legs', ['machine']],
  ['beltsquat', t('Присед с поясом'), 'legs', ['machine']],
  ['pendulum', t('Маятниковый присед'), 'legs', ['machine']],
  ['zercher', t('Присед Зерчера'), 'legs', ['bb']],
  ['reverselunge', t('Обратные выпады'), 'legs', ['db', 'bb', 'bw']],
  ['wallsit', t('Стульчик у стены'), 'legs', ['bw'], 't'],
  // Ягодицы
  ['hipthrust', t('Ягодичный мост'), 'glutes', ['bb', 'machine', 'smith', 'db']],
  ['glutebridge', t('Мостик с пола'), 'glutes', ['bw', 'bb'], 'bw'],
  ['abductor', t('Разведение ног'), 'glutes', ['machine']],
  ['kickbackleg', t('Отведение ноги назад'), 'glutes', ['cable', 'machine']],
  ['pullthrough', t('Тяга между ног'), 'glutes', ['cable']],
  ['sidelunge', t('Боковые выпады'), 'glutes', ['db', 'bw']],
  ['frog', t('Лягушка'), 'glutes', ['bw'], 'bw'],
  ['singlerdl', t('Румынская тяга на одной ноге'), 'glutes', ['db', 'kb']],
  ['reversehyper', t('Обратная гиперэкстензия'), 'glutes', ['machine', 'bw']],
  // Икры
  ['calfstand', t('Подъём на носки стоя'), 'calves', ['machine', 'smith', 'db', 'bw']],
  ['calfseat', t('Подъём на носки сидя'), 'calves', ['machine']],
  ['calfpress', t('Носки в жиме ногами'), 'calves', ['machine']],
  ['donkey', t('Ослиные подъёмы на носки'), 'calves', ['machine']],
  ['tibia', t('Подъём носков на себя'), 'calves', ['machine', 'plate']],
  // Пресс
  ['crunch', t('Скручивания'), 'abs', ['bw'], 'bw'],
  ['cablecrunch', t('Скручивания на блоке'), 'abs', ['cable']],
  ['machinecrunch', t('Скручивания в тренажёре'), 'abs', ['machine']],
  ['situp', t('Подъёмы корпуса'), 'abs', ['bw', 'plate'], 'bw'],
  ['legraise', t('Подъём ног в висе'), 'abs', ['bw'], 'bw'],
  ['lyingleg', t('Подъём ног лёжа'), 'abs', ['bw'], 'bw'],
  ['kneeraise', t('Подъём коленей в упоре'), 'abs', ['bw'], 'bw'],
  ['russian', t('Русские скручивания'), 'abs', ['bw', 'plate', 'db'], 'bw'],
  ['plank', t('Планка'), 'abs', ['bw'], 't'],
  ['sideplank', t('Боковая планка'), 'abs', ['bw'], 't'],
  ['abwheel', t('Ролик для пресса'), 'abs', ['bw'], 'bw'],
  ['woodchop', t('Дровосек'), 'abs', ['cable']],
  ['pallof', t('Пресс Паллофа'), 'abs', ['cable', 'band'], 'bw'],
  ['vup', t('Складка'), 'abs', ['bw'], 'bw'],
  ['dragon', t('Флажок дракона'), 'abs', ['bw'], 'bw'],
  ['hollow', t('Лодочка'), 'abs', ['bw'], 't'],
  // Предплечья и хват
  ['wristcurl', t('Сгибания запястий'), 'forearms', ['bb', 'db']],
  ['revwrist', t('Разгибания запястий'), 'forearms', ['bb', 'db']],
  ['farmer', t('Прогулка фермера'), 'forearms', ['db', 'kb', 'trap']],
  ['hang', t('Вис на турнике'), 'forearms', ['bw'], 't'],
  ['platepinch', t('Удержание блинов'), 'forearms', ['plate'], 't'],
  // Функциональные
  ['clean', t('Взятие на грудь'), 'legs', ['bb', 'db', 'kb']],
  ['snatch', t('Рывок'), 'legs', ['bb', 'db', 'kb']],
  ['thruster', t('Трастер'), 'legs', ['bb', 'db', 'kb']],
  ['burpee', t('Бёрпи'), 'cardio', ['bw'], 'bw'],
  ['boxjump', t('Прыжки на тумбу'), 'legs', ['bw'], 'bw'],
  ['wallball', t('Броски мяча в стену'), 'legs', ['bw'], 'bw'],
  ['tgu', t('Турецкий подъём'), 'shoulders', ['kb', 'db']],
  ['sled', t('Толкание саней'), 'legs', ['machine']],
  // Кардио
  ['treadmill', t('Беговая дорожка'), 'cardio', ['machine'], 'c'],
  ['bike', t('Велотренажёр'), 'cardio', ['machine'], 'c'],
  ['elliptical', t('Эллипс'), 'cardio', ['machine'], 'c'],
  ['rowing', t('Гребной тренажёр'), 'cardio', ['machine'], 'c'],
  ['stairs', t('Степпер (лестница)'), 'cardio', ['machine'], 'c'],
  ['skierg', t('Лыжный тренажёр'), 'cardio', ['machine'], 'c'],
  ['airbike', t('Эйрбайк'), 'cardio', ['machine'], 'c'],
  ['run', t('Бег'), 'cardio', ['bw'], 'c'],
  ['walk', t('Ходьба в горку'), 'cardio', ['machine'], 'c'],
  ['rope', t('Скакалка'), 'cardio', ['bw'], 't'],
  ['battle', t('Канаты'), 'cardio', ['bw'], 't'],
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
