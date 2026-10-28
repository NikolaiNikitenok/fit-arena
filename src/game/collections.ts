// Коллекции обликов: облики собраны в комплекты. За полный комплект — титул (достижение с монетами)
// и сияние вокруг героя. Силы комплект не даёт: всё, что он даёт, только для красоты и гордости.
import { FIRST_YEAR, HOLIDAYS, holidayKey, holidayOutfitId, yearOf } from './holidayDefs';
import { itemById, type Item } from './items';
import type { Progress } from './progress';
import { t } from '../i18n';

export interface Collection {
  id: string;
  name: string;
  // Подпись: откуда облики.
  text: string;
  items: string[];
  // Цвет сияния за полный комплект.
  aura: string;
  // Титул за комплект.
  title: string;
  // Праздничный год: показывается, только когда начался, и собрать его можно только в свой год.
  limited?: boolean;
}

const bosses = (ids: string[]) => ids.map((id) => `event-${id}`);

export const BASE_COLLECTIONS: Collection[] = [
  { id: 'shop', name: t('Лавка Фёдора'), text: t('Всё, что продаёт купец'), items: ['forest', 'sky', 'iron', 'cosmo', 'shadow', 'gold'], aura: '#ffd27a', title: t('Лучший покупатель') },
  { id: 'trophy', name: t('Трофеи сундуков'), text: t('Облики, что находят только в сундуках'), items: ['zombie-hunter', 'crystal', 'dragon'], aura: '#ff6e40', title: t('Кладоискатель') },
  { id: 'winter', name: t('Боссы зимы'), text: t('События выходных декабря, января и февраля'), items: bosses(['olivier', 'ice', 'remote']), aura: '#80deea', title: t('Гроза зимы') },
  { id: 'spring', name: t('Боссы весны'), text: t('События выходных марта, апреля и мая'), items: bosses(['pizza', 'excuse', 'grill']), aura: '#aed581', title: t('Гроза весны') },
  { id: 'summer', name: t('Боссы лета'), text: t('События выходных июня, июля и августа'), items: bosses(['lounger', 'icecream', 'siesta']), aura: '#ffd54f', title: t('Гроза лета') },
  { id: 'autumn', name: t('Боссы осени'), text: t('События выходных сентября, октября и ноября'), items: bosses(['alarm', 'pumpkin', 'blanket']), aura: '#ff9100', title: t('Гроза осени') },
  { id: 'school', name: t('Школа Грома'), text: t('Награды за программы тренировок'), items: ['prog-fist', 'prog-bogatyr', 'prog-stone', 'prog-champion'], aura: '#ff8a5c', title: t('Лучший ученик Грома') },
];

/** Праздничный год: с Ночи тыкв до Летних игр следующего года. 2026 — это 2026/27. */
export function holidayYear(year: number): Collection {
  const keys = HOLIDAYS.map((h) => holidayKey(h.id, yearOf(h, year)));
  return {
    id: `hy-${year}`,
    name: t('Праздники {0}/{1}', { 0: year, 1: String(year + 1).slice(2) }),
    text: t('Все четыре праздника года. Каждый облик можно получить только в свой праздник'),
    items: keys.map(holidayOutfitId),
    aura: '#f48fb1',
    title: t('Душа праздников {0}/{1}', { 0: year, 1: String(year + 1).slice(2) }),
    limited: true,
  };
}

// Праздничные годы на все заготовленные облики.
export const HOLIDAY_YEARS = [0, 1, 2, 3].map((i) => holidayYear(FIRST_YEAR + i));
export const COLLECTIONS: Collection[] = [...BASE_COLLECTIONS, ...HOLIDAY_YEARS];

export const collectionById = (id: string | undefined) => COLLECTIONS.find((c) => c.id === id);

export const collectionItems = (c: Collection): Item[] => c.items.map(itemById);
export const collectionOwned = (c: Collection, p: Pick<Progress, 'items'>) => c.items.filter((id) => p.items.includes(id)).length;
export const collectionDone = (c: Collection, p: Pick<Progress, 'items'>) => collectionOwned(c, p) === c.items.length;

/** Коллекции, которые видно в альбоме: обычные и праздничные годы, которые уже начались. */
export function visibleCollections(now: number): Collection[] {
  // Праздничный год начинается с Ночи тыкв.
  const d = new Date(now);
  const [m, day] = HOLIDAYS[0].start;
  const started = d.getFullYear() - (d.getMonth() < m || (d.getMonth() === m && d.getDate() < day) ? 1 : 0);
  return COLLECTIONS.filter((c) => !c.limited || Number(c.id.slice(3)) <= started);
}

/** Сияние вокруг героя: только у собранной коллекции. */
export function heroAura(p: Pick<Progress, 'items' | 'aura'>): string | undefined {
  const c = collectionById(p.aura);
  return c && collectionDone(c, p) ? c.aura : undefined;
}
