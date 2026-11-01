// Названия на экране: по-английски — латиницей (сервер хранит русское написание, оно же ключ).
import { cityLatin, knownCity } from '../../shared/cityNames';
import { countryTitle } from '../../shared/countryNames';
import { isEn } from '../i18n';

export const cityName = (s: string): string => {
  if (!isEn()) return s;
  const c = knownCity(s);
  if (!c) return cityLatin(s);
  // Россия — привычным транслитом, остальной мир — английским названием из справочника.
  return c[2] === 'RU' ? cityLatin(c[0]) : c[1];
};

export const countryName = (code: string): string => countryTitle(code, isEn());

/** Флаг страны из кода ISO: 'RU' → 🇷🇺. */
export const flag = (code: string): string => (/^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((ch) => 0x1f1a5 + ch.charCodeAt(0))) : '');
