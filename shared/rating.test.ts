import { describe, expect, it } from 'vitest';
import { cupsChange, leagueOf, seasonAt } from './rating';

describe('rating', () => {
  it('равные соперники: +30 / −20', () => {
    expect(cupsChange(500, 500)).toEqual({ win: 30, loss: 20 });
  });
  it('победа над сильным дороже, кубки не уходят в минус', () => {
    expect(cupsChange(100, 600).win).toBe(45);
    expect(cupsChange(600, 100).win).toBe(15);
    expect(cupsChange(0, 5).loss).toBe(5);
  });
  it('лиги по кубкам', () => {
    expect(leagueOf(0).name).toBe('Деревянная');
    expect(leagueOf(1250).name).toBe('Золотая');
    expect(leagueOf(9999).name).toBe('Легенда');
  });
  it('сезоны по 4 недели', () => {
    expect(seasonAt(Date.UTC(2026, 9, 20))).toBe(1);
    expect(seasonAt(Date.UTC(2026, 10, 17))).toBe(2);
  });
});
