import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { seasonEndsAt } from '../shared/rating';
import { canBuy, invoicePayload, nextUntil, parsePayload, PRO_PRICE, ProSales, payloadAccount, STARTER_PRICE } from './proSales';

const dir = mkdtempSync(join(tmpdir(), 'pro-sales-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const DAY = 86_400_000;
// Середина сезона и последние дни сезона.
const MID = Date.UTC(2026, 9, 26);
const LATE = seasonEndsAt(MID) - 3 * DAY;
const ids = (a: string) => [a];

describe('Pro за звёзды', () => {
  it('счёт несёт аккаунт, чужое не принимаем', () => {
    expect(payloadAccount(invoicePayload('tg:42'))).toBe('tg:42');
    expect(payloadAccount('pro1:')).toBeNull();
    expect(payloadAccount('evil')).toBeNull();
  });

  it('в середине сезона — до конца сезона, в последнюю неделю — и следующий', () => {
    expect(nextUntil(0, MID)).toBe(seasonEndsAt(MID));
    expect(nextUntil(0, LATE)).toBe(seasonEndsAt(seasonEndsAt(MID)));
    // Продление: следующий сезон после оплаченного; дальше вперёд купить нельзя.
    expect(nextUntil(seasonEndsAt(MID), MID)).toBe(seasonEndsAt(seasonEndsAt(MID)));
    expect(canBuy(seasonEndsAt(MID), MID)).toBe(true);
    expect(canBuy(seasonEndsAt(seasonEndsAt(MID)), MID)).toBe(false);
  });

  it('проверка перед оплатой, оплата, повтор, возврат и сохранение', () => {
    let now = MID;
    const file = join(dir, 'sales.json');
    const s = new ProSales(file, () => now);
    const pay = invoicePayload('ya:7');
    expect(s.checkout(pay, 'XTR', PRO_PRICE, ids)).toBeNull();
    expect(s.checkout(pay, 'XTR', PRO_PRICE - 1, ids)).toMatch(/Цена/);
    expect(s.checkout('x', 'XTR', PRO_PRICE, ids)).toMatch(/устарел/);
    expect(s.active(['ya:7'])).toBe(false);

    const p = s.paid(pay, 'ch1', 'tg:5', PRO_PRICE, ids, 'Аня')!;
    expect(p).toMatchObject({ n: 1, account: 'ya:7', payer: 'tg:5', until: seasonEndsAt(MID) });
    // Pro и на аккаунте, и у того, кто платил.
    expect(s.active(['ya:7'])).toBe(true);
    expect(s.active(['tg:5'])).toBe(true);
    expect(s.active(['tg:6'])).toBe(false);
    // Тот же платёж второй раз не продлевает.
    expect(s.paid(pay, 'ch1', 'tg:5', PRO_PRICE, ids)!.n).toBe(1);
    expect(s.offer(['ya:7'])).toEqual({ until: seasonEndsAt(MID), canBuy: true, price: PRO_PRICE });

    // Продлил на следующий сезон — больше купить нельзя.
    s.paid(pay, 'ch2', 'tg:5', PRO_PRICE, ids);
    expect(s.offer(['ya:7']).canBuy).toBe(false);
    expect(s.checkout(pay, 'XTR', PRO_PRICE, ids)).toMatch(/уже оплачен/);

    s.refunded(2);
    expect(s.offer(['ya:7']).until).toBe(seasonEndsAt(MID));
    s.flush();
    const again = new ProSales(file, () => now);
    expect(again.get(2)?.refunded).toBeTruthy();
    expect(again.stats()).toMatchObject({ count: 1, stars: PRO_PRICE });

    // Сезон кончился (с запасом на часовые пояса) — Pro погас.
    now = seasonEndsAt(MID) + DAY;
    expect(again.active(['ya:7'])).toBe(false);
  });

  it('подарок даёт Pro только другу, набор «Новичок» — один раз и без Pro', () => {
    const s = new ProSales(null, () => MID);
    expect(parsePayload(invoicePayload('tg:9', 'gift'))).toEqual({ kind: 'gift', account: 'tg:9' });
    expect(parsePayload(invoicePayload('tg:5', 'starter'))).toEqual({ kind: 'starter', account: 'tg:5' });
    // Цена подарка — как у Pro, набора — своя.
    expect(s.checkout(invoicePayload('tg:9', 'gift'), 'XTR', PRO_PRICE, ids)).toBeNull();
    expect(s.checkout(invoicePayload('tg:5', 'starter'), 'XTR', PRO_PRICE, ids)).toMatch(/Цена/);

    s.paid(invoicePayload('tg:9', 'gift'), 'g1', 'tg:5', PRO_PRICE, ids, 'Аня');
    expect(s.active(['tg:9'])).toBe(true);
    expect(s.active(['tg:5'])).toBe(false);

    expect(s.starter(['tg:5'])).toEqual({ price: STARTER_PRICE, bought: false });
    expect(s.checkout(invoicePayload('tg:5', 'starter'), 'XTR', STARTER_PRICE, ids)).toBeNull();
    const p = s.paid(invoicePayload('tg:5', 'starter'), 's1', 'tg:5', STARTER_PRICE, ids)!;
    expect(p).toMatchObject({ kind: 'starter', until: 0 });
    expect(s.starter(['tg:5']).bought).toBe(true);
    expect(s.active(['tg:5'])).toBe(false);
    expect(s.checkout(invoicePayload('tg:5', 'starter'), 'XTR', STARTER_PRICE, ids)).toMatch(/уже куплен/);
    // Вернули звёзды — набор снова можно купить.
    s.refunded(p.n);
    expect(s.starter(['tg:5']).bought).toBe(false);
  });
});
