// Название города на экране: по-английски — латиницей (сервер хранит русское написание, оно же ключ).
import { cityLatin, knownCity } from '../../shared/cityNames';
import { isEn } from '../i18n';

export const cityName = (s: string): string => {
  if (!isEn()) return s;
  const c = knownCity(s);
  return cityLatin(c ? c[0] : s);
};
