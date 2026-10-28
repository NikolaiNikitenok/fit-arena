// Названия городов: один город — один ключ, как бы его ни написали («Питер», «спб», «Санкт-Петербург»).
// Справочник — города России с карты (shared/russiaCities.ts); город не из справочника тоже можно выбрать,
// он попадёт в таблицу, но не на карту.
import { RU_CITIES } from './russiaCities';

/** Ключ города: регистр, ё и лишние пробелы не важны. */
export const cityKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9 -]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Разговорные названия и сокращения.
const ALIASES: Record<string, string> = {
  мск: 'Москва',
  msk: 'Москва',
  moscow: 'Москва',
  спб: 'Санкт-Петербург',
  питер: 'Санкт-Петербург',
  петербург: 'Санкт-Петербург',
  'санкт петербург': 'Санкт-Петербург',
  ленинград: 'Санкт-Петербург',
  екб: 'Екатеринбург',
  екат: 'Екатеринбург',
  нск: 'Новосибирск',
  новосиб: 'Новосибирск',
  нн: 'Нижний Новгород',
  нижний: 'Нижний Новгород',
  'н новгород': 'Нижний Новгород',
  ростов: 'Ростов-на-Дону',
  'ростов на дону': 'Ростов-на-Дону',
  владик: 'Владивосток',
  челны: 'Набережные Челны',
  'наб челны': 'Набережные Челны',
  'петропавловск камчатский': 'Петропавловск-Камчатский',
  камчатка: 'Петропавловск-Камчатский',
  'южно сахалинск': 'Южно-Сахалинск',
  'комсомольск на амуре': 'Комсомольск-на-Амуре',
};

const BY_KEY = new Map<string, number>(RU_CITIES.map((c, i) => [cityKey(c[0]), i]));
// Дефис и пробел — одно и то же: «Ростов на Дону» = «Ростов-на-Дону».
const loose = (key: string) => key.replace(/-/g, ' ');
const BY_LOOSE = new Map<string, number>(RU_CITIES.map((c, i) => [loose(cityKey(c[0])), i]));

/** Город из справочника по любому написанию или undefined. */
export function knownCity(s: string): (typeof RU_CITIES)[number] | undefined {
  const key = cityKey(s);
  const alias = ALIASES[key] ?? ALIASES[loose(key)];
  const i = BY_KEY.get(alias ? cityKey(alias) : key) ?? BY_LOOSE.get(loose(key));
  return i == null ? undefined : RU_CITIES[i];
}

/** Ключ для группировки: у городов из справочника — ключ его названия. */
export const canonicalKey = (s: string) => {
  const c = knownCity(s);
  return c ? cityKey(c[0]) : cityKey(s);
};

/** Подсказки при вводе: города справочника, начинающиеся с введённого (крупные — первыми). */
export function citySuggest(s: string, limit = 6): string[] {
  const key = loose(cityKey(s));
  if (key.length < 2) return [];
  const out: string[] = [];
  const alias = ALIASES[key];
  if (alias) out.push(alias);
  for (const c of RU_CITIES) {
    if (out.length >= limit) break;
    if (loose(cityKey(c[0])).startsWith(key) && !out.includes(c[0])) out.push(c[0]);
  }
  return out;
}
