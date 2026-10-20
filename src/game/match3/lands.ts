/**
 * Земли подземелья: десять придуманных вручную и бесконечные земли за ними.
 *
 * Земля с номером 10 и дальше (этаж 101+) собирается из частей по зерну = номеру земли: оформление
 * (тема) идёт по кругу из десяти, но в каждом круге в своём порядке; имя земли, чудовищ и хранителя
 * складывается из прилагательных темы, общих слов и «родительных хвостов». Одна и та же земля
 * всегда называется и выглядит одинаково — на любом телефоне.
 */

export type MonsterShape = 'slime' | 'bat' | 'golem' | 'skull' | 'spirit';

// Тема оформления: фон, слои и частицы (dungeon.css, .m3-th-<тема>).
export type LandTheme = 'cellar' | 'forest' | 'mine' | 'ice' | 'water' | 'crystal' | 'lava' | 'crypt' | 'space' | 'throne';
export const LAND_THEMES: LandTheme[] = ['cellar', 'forest', 'mine', 'ice', 'water', 'crystal', 'lava', 'crypt', 'space', 'throne'];

export interface DungeonLand {
  name: string;
  theme: LandTheme;
  // Цвета фона доски и рамки.
  bg: string;
  accent: string;
  monsters: [string, MonsterShape, string][];
  boss: [string, MonsterShape, string];
}

// Земли подземелья — под нашими мирами: от погребов Атлетии до подвала Князя Дивана.
export const DUNGEON_LANDS: DungeonLand[] = [
  { name: 'Подземелья Атлетии', theme: 'cellar', bg: '#2a1f1a', accent: '#ff9a5c', monsters: [['Сонная слизь', 'slime', '#9ccc65'], ['Мышь-соня', 'bat', '#a1887f'], ['Пыльный дух', 'spirit', '#cfd8dc']], boss: ['Диванный Голем', 'golem', '#ff8a65'] },
  { name: 'Корни Шепчущего леса', theme: 'forest', bg: '#162a1c', accent: '#81c784', monsters: [['Мшистая слизь', 'slime', '#66bb6a'], ['Корнегрыз', 'bat', '#8d6e63'], ['Лесной морок', 'spirit', '#a5d6a7']], boss: ['Трухлявый Корень', 'golem', '#6d4c41'] },
  { name: 'Гномьи шахты', theme: 'mine', bg: '#2b2416', accent: '#ffd54f', monsters: [['Рудная слизь', 'slime', '#ffca28'], ['Летучая кирка', 'bat', '#90a4ae'], ['Череп рудокопа', 'skull', '#e0d6c2']], boss: ['Каменный Соня', 'golem', '#9e9e9e'] },
  { name: 'Ледяные пещеры', theme: 'ice', bg: '#14222e', accent: '#81d4fa', monsters: [['Ледяная слизь', 'slime', '#81d4fa'], ['Снежная мышь', 'bat', '#e3f2fd'], ['Дух стужи', 'spirit', '#b3e5fc']], boss: ['Йети Зевака', 'golem', '#eceff1'] },
  { name: 'Затопленные катакомбы', theme: 'water', bg: '#10262a', accent: '#4dd0e1', monsters: [['Тинная слизь', 'slime', '#4db6ac'], ['Утопший череп', 'skull', '#b2dfdb'], ['Болотный огонёк', 'spirit', '#80cbc4']], boss: ['Жаба Тягучка', 'slime', '#689f38'] },
  { name: 'Кристальные копи', theme: 'crystal', bg: '#1d1630', accent: '#b388ff', monsters: [['Кристальная слизь', 'slime', '#b388ff'], ['Аметистовая мышь', 'bat', '#ce93d8'], ['Осколочный дух', 'spirit', '#80deea']], boss: ['Кристальный Голем', 'golem', '#b39ddb'] },
  { name: 'Лавовые глубины', theme: 'lava', bg: '#2e1410', accent: '#ff7043', monsters: [['Магмовая слизь', 'slime', '#ff7043'], ['Огненная мышь', 'bat', '#ffab40'], ['Пепельный череп', 'skull', '#ffccbc']], boss: ['Диванозавр', 'golem', '#e64a19'] },
  { name: 'Склеп Лени', theme: 'crypt', bg: '#1c1a24', accent: '#9fa8da', monsters: [['Зевающий череп', 'skull', '#d7ccc8'], ['Дремотный дух', 'spirit', '#9fa8da'], ['Пледовая слизь', 'slime', '#7986cb']], boss: ['Король Зевоты', 'skull', '#c5cae9'] },
  { name: 'Обломки станции «Заря»', theme: 'space', bg: '#0f1a26', accent: '#4fc3f7', monsters: [['Плазменная слизь', 'slime', '#4fc3f7'], ['Дрон-лежебока', 'bat', '#90a4ae'], ['Космический морок', 'spirit', '#80deea']], boss: ['Робот-Пылесос Лентяй', 'golem', '#90a4ae'] },
  { name: 'Тронный подвал Дивана', theme: 'throne', bg: '#2a1020', accent: '#ff5c8a', monsters: [['Плюшевая слизь', 'slime', '#f48fb1'], ['Подушечный дух', 'spirit', '#f8bbd0'], ['Череп-подлокотник', 'skull', '#ffcdd2']], boss: ['Тень Князя Дивана', 'spirit', '#ff4081'] },
];
export const HAND_LANDS = DUNGEON_LANDS.length;

/** Генератор по зерну (mulberry32): одно зерно — одна и та же последовательность. */
export function seededRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rnd = () => number;
const pick = <T,>(rnd: Rnd, list: readonly T[]): T => list[Math.floor(rnd() * list.length)];

// ---------- Части имён ----------

type Gender = 'm' | 'f' | 'pl';
// Прилагательное: мужской, женский род и множественное число.
type Adj = [string, string, string];
const form = (a: Adj, g: Gender) => a[g === 'm' ? 0 : g === 'f' ? 1 : 2];

// Прилагательные темы: для земли, чудовищ и хранителя.
const THEME_ADJ: Record<LandTheme, Adj[]> = {
  cellar: [['Пыльный', 'Пыльная', 'Пыльные'], ['Забытый', 'Забытая', 'Забытые'], ['Сонный', 'Сонная', 'Сонные'], ['Скрипучий', 'Скрипучая', 'Скрипучие']],
  forest: [['Мшистый', 'Мшистая', 'Мшистые'], ['Шепчущий', 'Шепчущая', 'Шепчущие'], ['Корявый', 'Корявая', 'Корявые'], ['Грибной', 'Грибная', 'Грибные']],
  mine: [['Рудный', 'Рудная', 'Рудные'], ['Медный', 'Медная', 'Медные'], ['Гулкий', 'Гулкая', 'Гулкие'], ['Золотоносный', 'Золотоносная', 'Золотоносные']],
  ice: [['Ледяной', 'Ледяная', 'Ледяные'], ['Морозный', 'Морозная', 'Морозные'], ['Стылый', 'Стылая', 'Стылые'], ['Снежный', 'Снежная', 'Снежные']],
  water: [['Затопленный', 'Затопленная', 'Затопленные'], ['Тинный', 'Тинная', 'Тинные'], ['Туманный', 'Туманная', 'Туманные'], ['Болотный', 'Болотная', 'Болотные']],
  crystal: [['Кристальный', 'Кристальная', 'Кристальные'], ['Аметистовый', 'Аметистовая', 'Аметистовые'], ['Сияющий', 'Сияющая', 'Сияющие'], ['Звонкий', 'Звонкая', 'Звонкие']],
  lava: [['Огненный', 'Огненная', 'Огненные'], ['Пепельный', 'Пепельная', 'Пепельные'], ['Раскалённый', 'Раскалённая', 'Раскалённые'], ['Магмовый', 'Магмовая', 'Магмовые']],
  crypt: [['Дремотный', 'Дремотная', 'Дремотные'], ['Зевающий', 'Зевающая', 'Зевающие'], ['Сумрачный', 'Сумрачная', 'Сумрачные'], ['Безмолвный', 'Безмолвная', 'Безмолвные']],
  space: [['Звёздный', 'Звёздная', 'Звёздные'], ['Лунный', 'Лунная', 'Лунные'], ['Невесомый', 'Невесомая', 'Невесомые'], ['Плазменный', 'Плазменная', 'Плазменные']],
  throne: [['Плюшевый', 'Плюшевая', 'Плюшевые'], ['Бархатный', 'Бархатная', 'Бархатные'], ['Диванный', 'Диванная', 'Диванные'], ['Пуховый', 'Пуховая', 'Пуховые']],
};

const LAND_NOUNS: [string, Gender][] = [
  ['пещеры', 'pl'], ['чертоги', 'pl'], ['глубины', 'pl'], ['лабиринт', 'm'], ['бездна', 'f'], ['цитадель', 'f'],
  ['галереи', 'pl'], ['копи', 'pl'], ['залы', 'pl'], ['тоннели', 'pl'], ['своды', 'pl'], ['нора', 'f'], ['грот', 'm'], ['крипта', 'f'],
];
const LAND_TAILS = ['Вечной дремоты', 'Забытого короля', 'Князя Дивана', 'Тысячи подушек', 'Последнего зевка', 'Старого пледа', 'Мягких теней', 'Ленивой луны', 'Долгого храпа', 'Тёплых тапок'];

const CREATURES: Record<MonsterShape, [string, Gender][]> = {
  slime: [['слизь', 'f'], ['капля', 'f'], ['клякса', 'f']],
  bat: [['мышь', 'f'], ['нетопырь', 'm'], ['моль', 'f']],
  spirit: [['дух', 'm'], ['морок', 'm'], ['призрак', 'm']],
  skull: [['череп', 'm'], ['костяк', 'm']],
  golem: [['голем', 'm'], ['истукан', 'm']],
};
const BOSS_TITLES = ['Великий', 'Древний', 'Грозный', 'Неподъёмный', 'Тысячелетний', 'Последний'];
const BOSS_NAMES = ['Храпун', 'Лежебока', 'Зевун', 'Пледоносец', 'Подушкин', 'Дремотник', 'Валяка', 'Тюфяк', 'Сонтар', 'Лентяйгор'];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Тема земли: по кругу из десяти, в каждом круге свой порядок, без двух одинаковых подряд. */
export function landTheme(land: number): LandTheme {
  if (land < HAND_LANDS) return DUNGEON_LANDS[land].theme;
  return themeCycle(Math.floor(land / LAND_THEMES.length))[land % LAND_THEMES.length];
}

const cycles = new Map<number, LandTheme[]>();
function themeCycle(c: number): LandTheme[] {
  const hit = cycles.get(c);
  if (hit) return hit;
  const rnd = seededRng(c * 104729 + 7);
  const out = [...LAND_THEMES];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  // Стык кругов: последняя тема прошлого круга не повторяется первой.
  const prevLast = c <= 1 ? DUNGEON_LANDS[HAND_LANDS - 1].theme : themeCycle(c - 1)[out.length - 1];
  if (out[0] === prevLast) [out[0], out[1]] = [out[1], out[0]];
  cycles.set(c, out);
  return out;
}

const landCache = new Map<number, DungeonLand>();

/** Земля по номеру (с нуля): придуманная или собранная из частей. */
export function landDef(land: number): DungeonLand {
  if (land < HAND_LANDS) return DUNGEON_LANDS[Math.max(0, land)];
  const hit = landCache.get(land);
  if (hit) return hit;
  const theme = landTheme(land);
  const base = DUNGEON_LANDS[LAND_THEMES.indexOf(theme)];
  const rnd = seededRng(land * 7919 + 101);
  const adj = THEME_ADJ[theme];
  const [noun, g] = pick(rnd, LAND_NOUNS);
  const name = rnd() < 0.55 ? `${form(pick(rnd, adj), g)} ${noun}` : `${cap(noun)} ${pick(rnd, LAND_TAILS)}`;
  const monsters = base.monsters.map(([, shape, color]): [string, MonsterShape, string] => {
    const [cr, cg] = pick(rnd, CREATURES[shape]);
    return [`${form(pick(rnd, adj), cg)} ${cr}`, shape, color];
  });
  const bossName = rnd() < 0.5 ? `${pick(rnd, BOSS_TITLES)} ${pick(rnd, BOSS_NAMES)}` : `${form(pick(rnd, adj), 'm')} ${pick(rnd, BOSS_NAMES)}`;
  const out: DungeonLand = { name, theme, bg: base.bg, accent: base.accent, monsters, boss: [bossName, base.boss[1], base.boss[2]] };
  if (landCache.size > 64) landCache.clear();
  landCache.set(land, out);
  return out;
}
