// Страны для «Битвы городов»: проверка кода и название на нужном языке.
import { type Country, COUNTRIES } from './countries';

const BY_CODE = new Map<string, Country>(COUNTRIES.map((c) => [c[0], c]));

/** Код страны, если такая есть в справочнике: 'ru' → 'RU'. */
export function cleanCountry(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const code = s.trim().toUpperCase();
  return BY_CODE.has(code) ? code : null;
}

export const countryInfo = (code: string): Country | undefined => BY_CODE.get(code);

/** Название страны: по-русски или по-английски; неизвестный код — как есть. */
export const countryTitle = (code: string, en = false): string => {
  const c = BY_CODE.get(code);
  return c ? (en ? c[2] : c[1]) : code;
};
