import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BalanceFile } from './balance';
import { cleanBalance, DEFAULT_BALANCE } from '../shared/balance';

describe('баланс из файла', () => {
  it('без файла — по умолчанию', () => {
    expect(new BalanceFile('/nope/balance.json').get(0)).toEqual(DEFAULT_BALANCE);
  });
  it('читает файл, зажимает числа и переживает битый файл', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'bal-')), 'balance.json');
    writeFileSync(f, JSON.stringify({ enemyHp: 0.8, coins: 100, junk: 1 }));
    const b = new BalanceFile(f);
    expect(b.get(0)).toMatchObject({ enemyHp: 0.8, coins: 5 });
    writeFileSync(f, '{oops');
    expect(b.get(20_000).enemyHp).toBe(0.8);
  });
  it('лишнее и не числа отбрасывает', () => {
    expect(cleanBalance({ chargePerRep: 'x', earlyFloors: 3 })).toEqual({ ...DEFAULT_BALANCE, earlyFloors: 3 });
  });
});

describe('/balance в боте', () => {
  it('показывает и меняет', async () => {
    const { balanceCommand } = await import('./balance');
    const f = join(mkdtempSync(join(tmpdir(), 'bal-')), 'balance.json');
    const b = new BalanceFile(f);
    expect(balanceCommand(b, '/balance')).toContain('enemyHp = 1');
    expect(balanceCommand(b, '/balance enemyHp 0,9')).toContain('enemyHp = 0.9 (обычно 1)');
    expect(new BalanceFile(f).get(0).enemyHp).toBe(0.9);
    expect(balanceCommand(b, '/balance nope 1')).toContain('Нет такой');
    expect(balanceCommand(b, '/sales')).toBeNull();
  });
});
