import { describe, expect, it } from 'vitest';
import { ProTrials, TRIAL_DAYS } from './proTrials';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 28, 12);

describe('пробный Pro другу', () => {
  it('раз в сезон, другу без Pro, один раз за всё время', () => {
    const t = new ProTrials(null);
    expect(t.give(['tg:1'], ['tg:2'], false, false, NOW)).toMatch(/только игроки с Pro/);
    const gift = t.give(['tg:1'], ['tg:2'], true, false, NOW);
    expect(gift).toMatchObject({ from: 'tg:1', to: 'tg:2', until: NOW + TRIAL_DAYS * DAY });
    expect(t.active(['tg:2'], NOW + DAY)).toBe(true);
    expect(t.active(['tg:2'], NOW + TRIAL_DAYS * DAY + 1)).toBe(false);
    expect(t.status(['tg:1'], true, NOW)).toEqual({ canGive: false, givenTo: 'tg:2', until: null });
    expect(t.status(['tg:2'], false, NOW)).toEqual({ canGive: false, givenTo: null, until: NOW + TRIAL_DAYS * DAY });
    // Второй подарок в том же сезоне — нельзя.
    expect(t.give(['tg:1'], ['tg:3'], true, false, NOW + DAY)).toMatch(/уже дарил/);
    // Тот, кто покупал Pro, и тот, кто уже пробовал, пробник не получают.
    expect(t.give(['tg:4'], ['tg:5'], true, true, NOW)).toMatch(/уже был Pro/);
    expect(t.give(['tg:4'], ['tg:9', 'tg:2'], true, false, NOW)).toMatch(/уже получал/);
    // В следующем сезоне можно снова.
    expect(t.give(['tg:1'], ['tg:3'], true, false, NOW + 30 * DAY)).toMatchObject({ to: 'tg:3' });
  });
});
