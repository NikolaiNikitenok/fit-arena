import { describe, expect, it } from 'vitest';
import { canonicalKey, cityLatin, citySuggest, knownCity } from './cityNames';
import { RU_CITIES } from './russiaCities';

describe('справочник городов', () => {
  it('разговорные названия и разное написание — один город', () => {
    expect(knownCity('Питер')?.[0]).toBe('Санкт-Петербург');
    expect(knownCity('СПб')?.[0]).toBe('Санкт-Петербург');
    expect(knownCity('екб')?.[0]).toBe('Екатеринбург');
    expect(knownCity('ростов на дону')?.[0]).toBe('Ростов-на-Дону');
    expect(knownCity('  орёл ')?.[0]).toBe('Орёл');
    expect(canonicalKey('мск')).toBe(canonicalKey('Москва'));
    expect(knownCity('Нью-Васюки')).toBeUndefined();
    expect(canonicalKey('Нью-Васюки')).toBe('нью-васюки');
  });

  it('подсказки: крупные первыми, сокращение раскрывается', () => {
    expect(citySuggest('ново')[0]).toBe('Новосибирск');
    expect(citySuggest('спб')).toContain('Санкт-Петербург');
    expect(citySuggest('н')).toEqual([]);
  });

  it('на карте есть крупные города и Крым, названия не повторяются', () => {
    const names = RU_CITIES.map((c) => c[0]);
    for (const n of ['Москва', 'Казань', 'Владивосток', 'Калининград', 'Севастополь', 'Симферополь', 'Петропавловск-Камчатский']) expect(names).toContain(n);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('города латиницей', () => {
  it('привычные названия и транслит', () => {
    expect(cityLatin('Москва')).toBe('Moscow');
    expect(cityLatin('Ярославль')).toBe('Yaroslavl');
    expect(cityLatin('Нижний Тагил')).toBe('Nizhny Tagil');
    expect(cityLatin('Красноярск')).toBe('Krasnoyarsk');
    expect(cityLatin('Йошкар-Ола')).toBe('Yoshkar-Ola');
    expect(cityLatin('Старый Оскол')).toBe('Stary Oskol');
  });
  it('город, написанный латиницей, узнаётся', () => {
    expect(knownCity('Kazan')?.[0]).toBe('Казань');
    expect(knownCity('saint petersburg')?.[0]).toBe('Санкт-Петербург');
    expect(knownCity('Krasnoyarsk')?.[0]).toBe('Красноярск');
    expect(citySuggest('Yaro')).toContain('Ярославль');
  });
});
