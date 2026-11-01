import { describe, expect, it } from 'vitest';
import { bossWon, dueOffer, markOffer } from './offers';
import { loadProgress, passOf, type Progress } from './progress';
import { LEVELS } from './levels';
import { passRewards } from './pass';
import { STARTER_PACK } from './starter';

const NOW = new Date(2026, 10, 10, 12).getTime();
const DAY = 86_400_000;
const key = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const base = (): Progress => ({ ...loadProgress(), gates: 'all' });
const boss = LEVELS.find((l) => l.type === 'boss')!;
const open = { starterOpen: true, pro: false, canPay: true };

describe('время предложения покупки', () => {
  it('набор — не в первую минуту, а после первого босса', () => {
    const p = base();
    expect(dueOffer(p, open, NOW)).not.toBe('starter');
    const won = { ...p, stars: { ...p.stars, [boss.id]: 3 } };
    expect(bossWon(won)).toBe(true);
    expect(dueOffer(won, open, NOW)).toBe('starter');
  });

  it('…или на 3-й день серии', () => {
    const p = { ...base(), days: { [key(NOW - 2 * DAY)]: 20, [key(NOW - DAY)]: 20, [key(NOW)]: 20 } };
    expect(dueOffer(p, open, NOW)).toBe('starter');
  });

  it('один раз, не чаще раза в день, только где можно платить', () => {
    const won = { ...base(), stars: { [boss.id]: 3 } };
    expect(dueOffer(won, { ...open, canPay: false }, NOW)).toBeNull();
    expect(dueOffer(won, { ...open, starterOpen: false }, NOW)).not.toBe('starter');
    const seen = markOffer(won, 'starter', NOW);
    expect(dueOffer(seen, open, NOW + 2 * DAY)).not.toBe('starter');
  });

  it('Pro — когда в пропуске появилась закрытая золотая награда, и не в тот же день, что набор', () => {
    expect(dueOffer(base(), { ...open, starterOpen: false }, NOW)).toBeNull();
    const p = { ...base(), pass: { ...passOf(base(), NOW), xp: 300 } };
    expect(dueOffer(p, { ...open, starterOpen: false }, NOW)).toBe('pro');
    expect(dueOffer(p, { ...open, starterOpen: false, pro: true }, NOW)).toBeNull();
    expect(dueOffer(markOffer(p, 'starter', NOW), { ...open, starterOpen: false }, NOW + 1000)).toBeNull();
  });
});

describe('за звёзды не продаём жизни и силу', () => {
  it('в наборе «Новичок» нет зелий бодрости', () => {
    expect(STARTER_PACK).not.toHaveProperty('vigor');
  });
  it('на золотой дорожке пропуска — только свитки замены из зелий', () => {
    for (let tier = 1; tier <= 30; tier++) {
      const r = passRewards(tier).pro;
      if (r.kind === 'potion') expect(r.id).toBe('swap');
    }
  });
});
