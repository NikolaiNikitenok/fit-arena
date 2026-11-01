import { describe, expect, it } from 'vitest';
import { canonicalKey, cityLatin, citySuggest, knownCity } from './cityNames';
import { WORLD_CITIES } from './worldCities';

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

  it('на глобусе есть крупные города России и Крым, названия не повторяются', () => {
    expect(WORLD_CITIES.filter((c) => c[2] === 'RU').length).toBeGreaterThan(250);
    const names = WORLD_CITIES.map((c) => c[0]);
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

describe('города мира', () => {
  it('по-русски, по-английски, с надстрочными знаками и сокращениями', () => {
    expect(knownCity('Париж')?.[2]).toBe('FR');
    expect(knownCity('paris')?.[0]).toBe('Париж');
    expect(knownCity('Sao Paulo')?.[0]).toBe(knownCity('São Paulo')?.[0]);
    expect(knownCity('Минск')?.[2]).toBe('BY');
    expect(knownCity('Алматы')?.[2]).toBe('KZ');
    expect(knownCity('Астана')?.[2]).toBe('KZ');
    expect(knownCity('NYC')?.[0]).toBe('Нью-Йорк');
  });
  it('российский город главнее одноимённого за границей', () => {
    expect(knownCity('Санкт-Петербург')?.[2]).toBe('RU');
    expect(knownCity('Москва')?.[2]).toBe('RU');
    expect(knownCity('Буйнакск')?.[2]).toBe('RU');
  });
  it('подсказки находят города мира', () => {
    expect(citySuggest('Берл')).toContain('Берлин');
    expect(citySuggest('Toky')).toContain('Токио');
  });
});
