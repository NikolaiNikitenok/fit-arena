// Названия городов: один город — один ключ, как бы его ни написали («Питер», «спб», «Санкт-Петербург», «Paris»).
// Справочник — города мира с глобуса (shared/worldCities.ts); город не из справочника тоже можно выбрать,
// он попадёт в таблицу своей страны, но не на глобус.
import { type WorldCity, WORLD_CITIES } from './worldCities';

/** Латинская буква без надстрочных знаков: «São» → «sao». Кириллицу не трогаем (й остаётся й). */
const plain = (s: string) => [...s].map((ch) => (ch.charCodeAt(0) < 0x400 ? ch.normalize('NFD')[0] : ch)).join('');

/** Ключ города: регистр, ё, надстрочные знаки и лишние пробелы не важны. */
export const cityKey = (s: string) =>
  plain(s.toLowerCase())
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
  // Мир.
  алматы: 'Алма-Ата',
  almaty: 'Алма-Ата',
  'нур султан': 'Астана',
  киев: 'Киев',
  kyiv: 'Киев',
  'нью йорк': 'Нью-Йорк',
  nyc: 'Нью-Йорк',
  ny: 'Нью-Йорк',
  'лос анджелес': 'Лос-Анджелес',
  la: 'Лос-Анджелес',
  dubai: 'Дубай',
  дубаи: 'Дубай',
  бишкек: 'Бишкек',
  стамбул: 'Стамбул',
  istanbul: 'Стамбул',
};

// Латиницей: привычные английские названия крупных городов, остальные — транслитом.
const EN_NAMES: Record<string, string> = {
  Москва: 'Moscow',
  'Санкт-Петербург': 'Saint Petersburg',
  'Нижний Новгород': 'Nizhny Novgorod',
  'Ростов-на-Дону': 'Rostov-on-Don',
  Самара: 'Samara',
  Казань: 'Kazan',
  Уфа: 'Ufa',
  Пермь: 'Perm',
  Тюмень: 'Tyumen',
  Хабаровск: 'Khabarovsk',
  Ярославль: 'Yaroslavl',
  'Набережные Челны': 'Naberezhnye Chelny',
  'Комсомольск-на-Амуре': 'Komsomolsk-on-Amur',
  'Петропавловск-Камчатский': 'Petropavlovsk-Kamchatsky',
  'Южно-Сахалинск': 'Yuzhno-Sakhalinsk',
};
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Название города латиницей: «Ярославль» → «Yaroslavl», «Нижний Тагил» → «Nizhny Tagil». */
export function cityLatin(name: string): string {
  if (EN_NAMES[name]) return EN_NAMES[name];
  // «-ий» и «-ый» в конце слова — одна «y», как пишут по-английски.
  const base = name.replace(/([иы])й(?=$|[\s-])/g, 'ы');
  return [...base]
    .map((ch) => {
      const low = ch.toLowerCase();
      const out = TRANSLIT[low];
      if (out === undefined) return ch;
      return ch === low ? out : out.charAt(0).toUpperCase() + out.slice(1);
    })
    .join('');
}

// Дефис и пробел — одно и то же: «Ростов на Дону» = «Ростов-на-Дону».
const loose = (key: string) => key.replace(/-/g, ' ');
/** Первый (самый крупный) город с таким ключом. */
const index = (key: (c: WorldCity) => string) => {
  const m = new Map<string, number>();
  WORLD_CITIES.forEach((c, i) => {
    const k = key(c);
    if (k && !m.has(k)) m.set(k, i);
  });
  return m;
};
const BY_KEY = index((c) => cityKey(c[0]));
const BY_LOOSE = index((c) => loose(cityKey(c[0])));
// Город, написанный латиницей (англоязычный игрок): «Kazan», «Saint Petersburg», «Paris».
const BY_LATIN = index((c) => loose(cityKey(c[1])));
const BY_TRANSLIT = index((c) => (c[2] === 'RU' ? loose(cityKey(cityLatin(c[0]))) : ''));

/** Город из справочника по любому написанию или undefined. */
export function knownCity(s: string): WorldCity | undefined {
  const key = cityKey(s);
  const alias = ALIASES[key] ?? ALIASES[loose(key)];
  const i = BY_KEY.get(alias ? cityKey(alias) : key) ?? BY_LOOSE.get(loose(key)) ?? BY_TRANSLIT.get(loose(key)) ?? BY_LATIN.get(loose(key));
  return i == null ? undefined : WORLD_CITIES[i];
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
  for (const c of WORLD_CITIES) {
    if (out.length >= limit) break;
    if ((loose(cityKey(c[0])).startsWith(key) || loose(cityKey(c[1])).startsWith(key) || (c[2] === 'RU' && loose(cityKey(cityLatin(c[0]))).startsWith(key))) && !out.includes(c[0])) out.push(c[0]);
  }
  return out;
}

/** Страна города из справочника (ISO) или undefined. */
export const cityCountry = (s: string): string | undefined => knownCity(s)?.[2];
