// Праздники Атлетии: четыре в год, у каждого свои даты, жетоны и облик с годом.
// Только данные — их читают и предметы (src/game/items.ts), и логика праздника (src/game/holidays.ts).
import type { CharName } from '../three/kit';
import type { NpcId } from './npcs';
import { t } from '../i18n';

export type HolidayId = 'pumpkin' | 'winter' | 'spring' | 'summer';

export interface HolidayDef {
  id: HolidayId;
  name: string;
  // Титул за дорожку (к нему добавляется год).
  hero: string;
  // Начало и конец (конец не входит): [месяц 0–11, день]. Зимний переходит через Новый год.
  start: [number, number];
  end: [number, number];
  // Жетон праздника: «тыква», «тыквы», «тыкв».
  token: [string, string, string];
  accent: string;
  glow: string;
  // Фон экрана: от верха к низу.
  sky: [string, string];
  npc: NpcId;
  story: string[];
  // Облик праздника по праздничным годам, начиная с FIRST_YEAR: имя, модель, цвет, свечение, оттенок.
  outfits: [string, CharName, string, string, string][];
}

// Первый праздничный год. Праздничный год начинается Ночью тыкв: 2026 — это с октября 2026 по лето 2027.
// Облики заготовлены на пять лет вперёд.
export const FIRST_YEAR = 2026;

export const HOLIDAYS: HolidayDef[] = [
  {
    id: 'pumpkin',
    name: t('Ночь тыкв'),
    hero: t('Герой Ночи тыкв'),
    start: [9, 25],
    end: [10, 9],
    token: [t('тыква'), t('тыквы'), t('тыкв')],
    accent: '#ff9100',
    glow: '#ffab40',
    sky: ['#2a1238', '#5a2a1a'],
    npc: 'marfa',
    story: [t('Внучек, тыквы на огороде светятся! Значит, пришла Ночь тыкв.'), t('Каждый твой повтор зажигает тыкву-фонарь. Набери побольше, и я сошью тебе наряд, какого больше ни у кого не будет.')],
    outfits: [
      [t('Тыквенный рыцарь'), 'Knight', '#ff9e40', '#ff6d00', 'mul:1.5,0.8,0.35'],
      [t('Фонарщик полуночи'), 'Rogue', '#7e57c2', '#ff9100', 'mul:0.75,0.55,1.1'],
      [t('Ведьмин страж'), 'Mage', '#455a64', '#76ff03', 'mul:0.6,0.85,0.55'],
      [t('Тыквенный великан'), 'Barbarian', '#ff7043', '#ffab00', 'mul:1.45,0.7,0.4'],
      [t('Хозяин листопада'), 'Knight', '#bf360c', '#ffd180', 'mul:1.3,0.6,0.35'],
    ],
  },
  {
    id: 'winter',
    name: t('Зимняя сказка'),
    hero: t('Герой Зимней сказки'),
    start: [11, 20],
    end: [0, 11],
    token: [t('снежинка'), t('снежинки'), t('снежинок')],
    accent: '#4fc3f7',
    glow: '#b3e5fc',
    sky: ['#0d2547', '#3a6f9c'],
    npc: 'grom',
    story: [t('Снег выпал, ученик. В праздники все сидят за столом, а сильные выходят на мороз.'), t('За каждый повтор с неба падает снежинка. Соберёшь сугроб — получишь доспех Зимней сказки этого года. Другого такого не будет.')],
    outfits: [
      [t('Снежный витязь'), 'Knight', '#e3f2fd', '#82b1ff', 'mul:0.9,1.05,1.45'],
      [t('Морозный чародей'), 'Mage', '#b3e5fc', '#40c4ff', 'mul:0.7,1.0,1.5'],
      [t('Северный следопыт'), 'Rogue', '#cfd8dc', '#18ffff', 'mul:0.8,1.0,1.2'],
      [t('Ледяной богатырь'), 'Barbarian', '#81d4fa', '#e1f5fe', 'mul:0.75,1.1,1.5'],
      [t('Хранитель ёлки'), 'Knight', '#2e7d32', '#ffd740', 'mul:0.6,1.2,0.65'],
    ],
  },
  {
    id: 'spring',
    name: t('Весеннее пробуждение'),
    hero: t('Герой весны'),
    start: [2, 14],
    end: [2, 29],
    token: [t('цветок'), t('цветка'), t('цветков')],
    accent: '#66bb6a',
    glow: '#f48fb1',
    sky: ['#1e4d3a', '#7cb36b'],
    npc: 'lisa',
    story: [t('Чуешь? Снег сошёл, и вся Атлетия зевает и потягивается после зимы.'), t('Каждый повтор будит один цветок. Разбудим целый луг — и у тебя будет весенний наряд этого года.')],
    outfits: [
      [t('Цветущий страж'), 'Knight', '#a5d6a7', '#f48fb1', 'mul:0.85,1.25,0.8'],
      [t('Вешний следопыт'), 'Rogue', '#c5e1a5', '#ffeb3b', 'mul:0.95,1.25,0.7'],
      [t('Сакуровый маг'), 'Mage', '#f8bbd0', '#ff80ab', 'mul:1.35,0.9,1.1'],
      [t('Лесной исполин'), 'Barbarian', '#81c784', '#b9f6ca', 'mul:0.7,1.25,0.7'],
      [t('Рыцарь первоцвета'), 'Knight', '#fff59d', '#ce93d8', 'mul:1.3,1.25,0.7'],
    ],
  },
  {
    id: 'summer',
    name: t('Летние игры'),
    hero: t('Чемпион Летних игр'),
    start: [6, 11],
    end: [6, 26],
    token: [t('медаль'), t('медали'), t('медалей')],
    accent: '#ffca28',
    glow: '#ffe082',
    sky: ['#0b4f7a', '#f0b04a'],
    npc: 'boris',
    story: [t('Помню свои первые Летние игры: стадион, флаги, все бегут. Я тогда тоже бежал, а не лежал!'), t('Каждый повтор — медаль. Наберёшь полную грудь медалей, и наряд чемпиона этого лета твой.')],
    outfits: [
      [t('Солнечный чемпион'), 'Barbarian', '#ffd54f', '#ff9100', 'mul:1.45,1.15,0.5'],
      [t('Рыцарь стадиона'), 'Knight', '#4fc3f7', '#ffea00', 'mul:0.75,1.0,1.4'],
      [t('Морской бегун'), 'Rogue', '#4dd0e1', '#fff176', 'mul:0.65,1.15,1.3'],
      [t('Маг олимпийского огня'), 'Mage', '#ff8a65', '#ffd740', 'mul:1.45,0.85,0.5'],
      [t('Золотой атлет'), 'Knight', '#ffe082', '#ffffff', 'mul:1.5,1.3,0.6'],
    ],
  },
];

export const holidayDef = (id: string): HolidayDef | undefined => HOLIDAYS.find((h) => h.id === id);

/** Ключ праздника: id и год, в который он начался (зимний — год декабря). */
export const holidayKey = (id: HolidayId, year: number) => `${id}-${year}`;

export const holidayOutfitId = (key: string) => `hol-${key}`;

/** Праздничный год, к которому относится праздник, начавшийся в этом календарном году: весна и лето — к прошлому. */
export const cycleOf = (def: Pick<HolidayDef, 'start'>, year: number) => (def.start[0] >= 9 ? year : year - 1);
/** Календарный год праздника этого праздничного года. */
export const yearOf = (def: Pick<HolidayDef, 'start'>, cycle: number) => (def.start[0] >= 9 ? cycle : cycle + 1);

/** Облики всех праздников на все заготовленные годы. */
export function holidayOutfits(): { id: string; key: string; year: number; def: HolidayDef; name: string; hero: CharName; color: string; glow: string; tint: string }[] {
  return HOLIDAYS.flatMap((def) =>
    def.outfits.map(([name, hero, color, glow, tint], i) => {
      const year = yearOf(def, FIRST_YEAR + i);
      const key = holidayKey(def.id, year);
      return { id: holidayOutfitId(key), key, year, def, name: `${name} ${year}`, hero, color, glow, tint };
    }),
  );
}
