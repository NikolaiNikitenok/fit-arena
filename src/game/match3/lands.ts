import { t } from '../../i18n';
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
  { name: t('Подземелья Атлетии'), theme: 'cellar', bg: '#2a1f1a', accent: '#ff9a5c', monsters: [[t('Сонная слизь'), 'slime', '#9ccc65'], [t('Мышь-соня'), 'bat', '#a1887f'], [t('Пыльный дух'), 'spirit', '#cfd8dc']], boss: [t('Диванный Голем'), 'golem', '#ff8a65'] },
  { name: t('Корни Шепчущего леса'), theme: 'forest', bg: '#162a1c', accent: '#81c784', monsters: [[t('Мшистая слизь'), 'slime', '#66bb6a'], [t('Корнегрыз'), 'bat', '#8d6e63'], [t('Лесной морок'), 'spirit', '#a5d6a7']], boss: [t('Трухлявый Корень'), 'golem', '#6d4c41'] },
  { name: t('Гномьи шахты'), theme: 'mine', bg: '#2b2416', accent: '#ffd54f', monsters: [[t('Рудная слизь'), 'slime', '#ffca28'], [t('Летучая кирка'), 'bat', '#90a4ae'], [t('Череп рудокопа'), 'skull', '#e0d6c2']], boss: [t('Каменный Соня'), 'golem', '#9e9e9e'] },
  { name: t('Ледяные пещеры'), theme: 'ice', bg: '#14222e', accent: '#81d4fa', monsters: [[t('Ледяная слизь'), 'slime', '#81d4fa'], [t('Снежная мышь'), 'bat', '#e3f2fd'], [t('Дух стужи'), 'spirit', '#b3e5fc']], boss: [t('Йети Зевака'), 'golem', '#eceff1'] },
  { name: t('Затопленные катакомбы'), theme: 'water', bg: '#10262a', accent: '#4dd0e1', monsters: [[t('Тинная слизь'), 'slime', '#4db6ac'], [t('Утопший череп'), 'skull', '#b2dfdb'], [t('Болотный огонёк'), 'spirit', '#80cbc4']], boss: [t('Жаба Тягучка'), 'slime', '#689f38'] },
  { name: t('Кристальные копи'), theme: 'crystal', bg: '#1d1630', accent: '#b388ff', monsters: [[t('Кристальная слизь'), 'slime', '#b388ff'], [t('Аметистовая мышь'), 'bat', '#ce93d8'], [t('Осколочный дух'), 'spirit', '#80deea']], boss: [t('Кристальный Голем'), 'golem', '#b39ddb'] },
  { name: t('Лавовые глубины'), theme: 'lava', bg: '#2e1410', accent: '#ff7043', monsters: [[t('Магмовая слизь'), 'slime', '#ff7043'], [t('Огненная мышь'), 'bat', '#ffab40'], [t('Пепельный череп'), 'skull', '#ffccbc']], boss: [t('Диванозавр'), 'golem', '#e64a19'] },
  { name: t('Склеп Лени'), theme: 'crypt', bg: '#1c1a24', accent: '#9fa8da', monsters: [[t('Зевающий череп'), 'skull', '#d7ccc8'], [t('Дремотный дух'), 'spirit', '#9fa8da'], [t('Пледовая слизь'), 'slime', '#7986cb']], boss: [t('Король Зевоты'), 'skull', '#c5cae9'] },
  { name: t('Обломки станции «Заря»'), theme: 'space', bg: '#0f1a26', accent: '#4fc3f7', monsters: [[t('Плазменная слизь'), 'slime', '#4fc3f7'], [t('Дрон-лежебока'), 'bat', '#90a4ae'], [t('Космический морок'), 'spirit', '#80deea']], boss: [t('Робот-Пылесос Лентяй'), 'golem', '#90a4ae'] },
  { name: t('Тронный подвал Дивана'), theme: 'throne', bg: '#2a1020', accent: '#ff5c8a', monsters: [[t('Плюшевая слизь'), 'slime', '#f48fb1'], [t('Подушечный дух'), 'spirit', '#f8bbd0'], [t('Череп-подлокотник'), 'skull', '#ffcdd2']], boss: [t('Тень Князя Дивана'), 'spirit', '#ff4081'] },
];
export const HAND_LANDS = DUNGEON_LANDS.length;

/** Генератор по зерну (mulberry32): одно зерно — одна и та же последовательность. */
export function seededRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let tm = Math.imul(s ^ (s >>> 15), s | 1);
    tm ^= tm + Math.imul(tm ^ (tm >>> 7), tm | 61);
    return ((tm ^ (tm >>> 14)) >>> 0) / 4294967296;
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
  cellar: [[t('Пыльный'), t('Пыльная'), t('Пыльные')], [t('Забытый'), t('Забытая'), t('Забытые')], [t('Сонный'), t('Сонная'), t('Сонные')], [t('Скрипучий'), t('Скрипучая'), t('Скрипучие')]],
  forest: [[t('Мшистый'), t('Мшистая'), t('Мшистые')], [t('Шепчущий'), t('Шепчущая'), t('Шепчущие')], [t('Корявый'), t('Корявая'), t('Корявые')], [t('Грибной'), t('Грибная'), t('Грибные')]],
  mine: [[t('Рудный'), t('Рудная'), t('Рудные')], [t('Медный'), t('Медная'), t('Медные')], [t('Гулкий'), t('Гулкая'), t('Гулкие')], [t('Золотоносный'), t('Золотоносная'), t('Золотоносные')]],
  ice: [[t('Ледяной'), t('Ледяная'), t('Ледяные')], [t('Морозный'), t('Морозная'), t('Морозные')], [t('Стылый'), t('Стылая'), t('Стылые')], [t('Снежный'), t('Снежная'), t('Снежные')]],
  water: [[t('Затопленный'), t('Затопленная'), t('Затопленные')], [t('Тинный'), t('Тинная'), t('Тинные')], [t('Туманный'), t('Туманная'), t('Туманные')], [t('Болотный'), t('Болотная'), t('Болотные')]],
  crystal: [[t('Кристальный'), t('Кристальная'), t('Кристальные')], [t('Аметистовый'), t('Аметистовая'), t('Аметистовые')], [t('Сияющий'), t('Сияющая'), t('Сияющие')], [t('Звонкий'), t('Звонкая'), t('Звонкие')]],
  lava: [[t('Огненный'), t('Огненная'), t('Огненные')], [t('Пепельный'), t('Пепельная'), t('Пепельные')], [t('Раскалённый'), t('Раскалённая'), t('Раскалённые')], [t('Магмовый'), t('Магмовая'), t('Магмовые')]],
  crypt: [[t('Дремотный'), t('Дремотная'), t('Дремотные')], [t('Зевающий'), t('Зевающая'), t('Зевающие')], [t('Сумрачный'), t('Сумрачная'), t('Сумрачные')], [t('Безмолвный'), t('Безмолвная'), t('Безмолвные')]],
  space: [[t('Звёздный'), t('Звёздная'), t('Звёздные')], [t('Лунный'), t('Лунная'), t('Лунные')], [t('Невесомый'), t('Невесомая'), t('Невесомые')], [t('Плазменный'), t('Плазменная'), t('Плазменные')]],
  throne: [[t('Плюшевый'), t('Плюшевая'), t('Плюшевые')], [t('Бархатный'), t('Бархатная'), t('Бархатные')], [t('Диванный'), t('Диванная'), t('Диванные')], [t('Пуховый'), t('Пуховая'), t('Пуховые')]],
};

const LAND_NOUNS: [string, Gender][] = [
  [t('пещеры'), 'pl'], [t('чертоги'), 'pl'], [t('глубины'), 'pl'], [t('лабиринт'), 'm'], [t('бездна'), 'f'], [t('цитадель'), 'f'],
  [t('галереи'), 'pl'], [t('копи'), 'pl'], [t('залы'), 'pl'], [t('тоннели'), 'pl'], [t('своды'), 'pl'], [t('нора'), 'f'], [t('грот'), 'm'], [t('крипта'), 'f'],
];
const LAND_TAILS = [t('Вечной дремоты'), t('Забытого короля'), t('Князя Дивана'), t('Тысячи подушек'), t('Последнего зевка'), t('Старого пледа'), t('Мягких теней'), t('Ленивой луны'), t('Долгого храпа'), t('Тёплых тапок')];

const CREATURES: Record<MonsterShape, [string, Gender][]> = {
  slime: [[t('слизь'), 'f'], [t('капля'), 'f'], [t('клякса'), 'f']],
  bat: [[t('мышь'), 'f'], [t('нетопырь'), 'm'], [t('моль'), 'f']],
  spirit: [[t('дух'), 'm'], [t('морок'), 'm'], [t('призрак'), 'm']],
  skull: [[t('череп'), 'm'], [t('костяк'), 'm']],
  golem: [[t('голем'), 'm'], [t('истукан'), 'm']],
};
const BOSS_TITLES = [t('Великий'), t('Древний'), t('Грозный'), t('Неподъёмный'), t('Тысячелетний'), t('Последний')];
const BOSS_NAMES = [t('Храпун'), t('Лежебока'), t('Зевун'), t('Пледоносец'), t('Подушкин'), t('Дремотник'), t('Валяка'), t('Тюфяк'), t('Сонтар'), t('Лентяйгор')];

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
