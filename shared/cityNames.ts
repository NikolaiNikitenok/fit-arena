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

const BY_KEY = new Map<string, number>(RU_CITIES.map((c, i) => [cityKey(c[0]), i]));
// Город, написанный латиницей (англоязычный игрок): «Kazan», «Saint Petersburg».
const BY_LATIN = new Map<string, number>(RU_CITIES.map((c, i) => [cityKey(cityLatin(c[0])).replace(/-/g, ' '), i]));
// Дефис и пробел — одно и то же: «Ростов на Дону» = «Ростов-на-Дону».
const loose = (key: string) => key.replace(/-/g, ' ');
const BY_LOOSE = new Map<string, number>(RU_CITIES.map((c, i) => [loose(cityKey(c[0])), i]));

/** Город из справочника по любому написанию или undefined. */
export function knownCity(s: string): (typeof RU_CITIES)[number] | undefined {
  const key = cityKey(s);
  const alias = ALIASES[key] ?? ALIASES[loose(key)];
  const i = BY_KEY.get(alias ? cityKey(alias) : key) ?? BY_LOOSE.get(loose(key)) ?? BY_LATIN.get(loose(key));
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
    if ((loose(cityKey(c[0])).startsWith(key) || loose(cityKey(cityLatin(c[0]))).startsWith(key)) && !out.includes(c[0])) out.push(c[0]);
  }
  return out;
}
