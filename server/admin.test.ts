import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { AdminList, adminToken, checkAdminToken } from './admin';
import { Telemetry } from './telemetry';

const dir = mkdtempSync(join(tmpdir(), 'admin-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('доступ админа', () => {
  const t = new Telemetry(null, Date.now, Buffer.alloc(32, 1));
  const sign = (s: string) => t.sign(s);
  const now = Date.UTC(2026, 9, 1);

  it('список из переменной и файла, гости не админы', () => {
    const file = join(dir, '.admin-ids');
    writeFileSync(file, '42 # владелец\n');
    const list = new AdminList(file, '7');
    expect(list.has('tg:42')).toBe(true);
    expect(list.has('tg:7')).toBe(true);
    expect(list.has('guest:42')).toBe(false);
    expect(list.has('tg:8')).toBe(false);
    expect(list.ids().sort()).toEqual(['42', '7']);
  });

  it('ссылка из бота: подпись, срок и живой список', () => {
    let admins = new Set(['tg:42']);
    const isAdmin = (id: string) => admins.has(id);
    const tok = adminToken(sign, '42', now);
    expect(checkAdminToken(sign, tok, now, isAdmin)).toBe('42');
    // Срок вышел.
    expect(checkAdminToken(sign, tok, now + 8 * 86_400_000, isAdmin)).toBeNull();
    // Подделка: чужой id с той же подписью или другая подпись.
    const [, exp, sig] = tok.split('.');
    expect(checkAdminToken(sign, `43.${exp}.${sig}`, now, () => true)).toBeNull();
    expect(checkAdminToken(sign, `42.${exp}.${'0'.repeat(32)}`, now, isAdmin)).toBeNull();
    expect(checkAdminToken(sign, 'мусор', now, isAdmin)).toBeNull();
    expect(checkAdminToken(sign, undefined, now, isAdmin)).toBeNull();
    // Подпись другого сервера не подходит.
    const other = new Telemetry(null, Date.now, Buffer.alloc(32, 2));
    expect(checkAdminToken((s) => other.sign(s), tok, now, isAdmin)).toBeNull();
    // Убрали из списка — ссылка больше не пускает.
    admins = new Set();
    expect(checkAdminToken(sign, tok, now, isAdmin)).toBeNull();
  });
});
