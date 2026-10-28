import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EN } from './en';
import { pl, setLangForTest, t } from './index';

// Все строки, что код переводит через t('…'), должны быть в английском словаре, с теми же подстановками.
const SRC = join(__dirname, '..');
const SHARED = join(__dirname, '../../shared');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'i18n' ? [] : files(p);
    return /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
}
const KEY = /\bt\('((?:[^'\\]|\\.)*)'/g;
const keys = new Set([...files(SRC), ...files(SHARED)].flatMap((f) => [...readFileSync(f, 'utf8').matchAll(KEY)].map((m) => m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'))));
const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('английский перевод', () => {
  it('есть для каждой строки t()', () => {
    expect([...keys].filter((k) => !(k in EN))).toEqual([]);
  });
  it('подстановки совпадают', () => {
    expect(Object.entries(EN).filter(([ru, en]) => slots(ru) !== slots(en))).toEqual([]);
  });
  it('подставляет значения и выбирает форму числа', () => {
    setLangForTest('en');
    expect(t('Уровень карты {0} · {1}', { 0: 3, 1: 'X' })).toBe('Map level 3 · X');
    expect(pl(1, ['день', 'дня', 'дней'], ['day', 'days'])).toBe('day');
    expect(pl(5, ['день', 'дня', 'дней'], ['day', 'days'])).toBe('days');
    setLangForTest('ru');
    expect(t('Уровень карты {0} · {1}', { 0: 3, 1: 'X' })).toBe('Уровень карты 3 · X');
    expect(pl(3, ['день', 'дня', 'дней'], ['day', 'days'])).toBe('дня');
    expect(pl(11, ['день', 'дня', 'дней'], ['day', 'days'])).toBe('дней');
  });
});
