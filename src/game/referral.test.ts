import { describe, expect, it } from 'vitest';
import { claimRef, INVITED_COINS, REF_COINS, refCount, refPending } from './referral';
import type { Progress } from './progress';

const base = { coins: 0, items: ['starter'] } as unknown as Progress;
const refs = (active: boolean[], by: { active: boolean } | null = null, me = false) => ({
  brought: active.map((a, i) => ({ id: `tg:${i + 10}`, name: `Друг ${i + 1}`, active: a })),
  by: by && { id: 'tg:1', name: 'Аня', ...by },
  me,
});

describe('награды «Приведи друга»', () => {
  it('за друга — монеты и «Побратим», за третьего — «Вожак стаи»', () => {
    let p = base;
    const pending = refPending(refs([true, false, true, true]), p);
    expect(pending.map((r) => r.key)).toEqual(['ref:tg:10', 'ref:tg:12', 'ref:tg:13']);
    const r1 = claimRef(p, pending[0]);
    expect(r1).toMatchObject({ coins: REF_COINS, outfits: ['ref-brother'] });
    p = claimRef(claimRef(r1.progress, pending[1]).progress, pending[2]).progress;
    expect(p.items).toEqual(['starter', 'ref-brother', 'ref-leader']);
    expect(p.coins).toBe(3 * REF_COINS);
    expect(refCount(p)).toBe(3);
    // Второй раз ту же награду не выдать.
    expect(claimRef(p, pending[0]).coins).toBe(0);
    expect(refPending(refs([true, false, true, true]), p)).toEqual([]);
  });

  it('пришёл по ссылке сам — награда после своего первого боя', () => {
    expect(refPending(refs([], { active: true }, false), base)).toEqual([]);
    const [r] = refPending(refs([], { active: true }, true), base);
    expect(r).toEqual({ key: 'ref-by', name: 'Аня', self: true });
    expect(claimRef(base, r)).toMatchObject({ coins: INVITED_COINS, outfits: ['ref-brother'] });
  });
});
