import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseProIds, ProList } from './pro';

const dir = mkdtempSync(join(tmpdir(), 'pro-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('Pro Pass по id', () => {
  it('разбор: запятые, строки, комментарии, мусор', () => {
    expect([...parseProIds('123, 456\n789 # я\n# 111\nabc 12a 99')]).toEqual(['123', '456', '789', '99']);
    expect(parseProIds('').size).toBe(0);
  });

  it('из переменной и файла; гости никогда не Pro; файл перечитывается', () => {
    const file = join(dir, '.pro-ids');
    writeFileSync(file, '42\n');
    let now = 0;
    const list = new ProList(file, '7, 8', () => now);
    expect(list.has('tg:7')).toBe(true);
    expect(list.has('tg:42')).toBe(true);
    expect(list.has('tg:43')).toBe(false);
    expect(list.has('guest:42')).toBe(false);
    expect(list.has('42')).toBe(false);
    writeFileSync(file, '43\n');
    utimesSync(file, new Date(), new Date(Date.now() + 5000));
    now += 3000;
    expect(list.has('tg:43')).toBe(true);
    expect(list.has('tg:42')).toBe(false);
    rmSync(file);
    now += 3000;
    expect(list.has('tg:43')).toBe(false);
    expect(list.has('tg:8')).toBe(true);
  });

  it('без файла работает только переменная', () => {
    const list = new ProList(join(dir, 'нет'), undefined);
    expect(list.has('tg:1')).toBe(false);
  });
});
