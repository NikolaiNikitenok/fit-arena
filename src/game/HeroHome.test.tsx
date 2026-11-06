import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComponentProps } from 'react';
vi.mock('../settings', () => ({
  useSport: () => false,
  useSettings: () => ({ homeList: false }),
  getSettings: () => ({ lowPower: true }),
}));
vi.mock('../telegram', () => ({ platform: () => 'web' }));
vi.mock('../cloud', () => ({ useInClan: () => false }));
vi.mock('../social/useFeedBadge', () => ({ useFeedBadge: () => false }));
import { HeroHome } from './HeroHome';
import { fresh } from './progress';
import { LEVELS } from './levels';
import { dailyTask } from './daily';
import { setLangForTest } from '../i18n';

type Props = ComponentProps<typeof HeroHome>;
function props(): Props {
  const progress = fresh();
  const noop = () => {};
  return {
    progress, lives: '5/5', current: LEVELS[0], daily: dailyTask('2026-11-06', progress.baseline), dailyDone: 0,
    livesLeft: 5, pro: false, lockLeft: () => 0,
    onTrain: noop, onShop: noop, onStrength: noop, onWeekly: noop, onEquip: noop, onEquipGear: noop,
    onPotion: noop, onSettings: noop, onDaily: noop, onClaimDaily: noop, onAchievements: noop,
    onPass: noop, onEvent: noop, onPets: noop, onPrograms: noop, onGym: noop, onDungeon: noop,
    onFriends: noop, onHoliday: noop, onCollections: noop, onCity: noop, onFeed: noop, onRecap: noop,
    onTitan: noop, onLocked: noop, onClan: noop, onMap: noop, onVillage: noop,
  };
}

describe('illustrated adventure lobby', () => {
  beforeEach(() => setLangForTest('ru'));
  it('renders the four feature cards and Play, using real charge rather than sample artwork numbers', () => {
    const p = props();
    p.progress.village = { charge: 73, res: { wood: 0, stone: 0, gold: 0 } };
    const html = renderToStaticMarkup(<HeroHome {...p} />);
    for (const title of ['Тренировка', 'Кампания', 'Деревня', 'Герой', 'Играть']) expect(html).toContain(title);
    expect(html).toContain('aria-valuenow="73"');
    expect(html).toContain('aria-valuemax="300"');
    expect(html).toContain('arena-home--fantasy');
  });
  it('keeps locked daily/village sections and does not expose the claim action', () => {
    const p = props();
    p.lockLeft = () => 3;
    const html = renderToStaticMarkup(<HeroHome {...p} />);
    expect(html).toContain('arena-daily-locked');
    expect(html).toContain('откроется после ур. 10');
    expect(html).not.toContain('hb-daily-act');
  });
  it('renders a completed daily quest as claimed', () => {
    const p = props();
    p.dailyDone = p.daily.target;
    p.progress.dailyDone = p.daily.date;
    const html = renderToStaticMarkup(<HeroHome {...p} />);
    expect(html).toContain('hb-daily claimed');
    expect(html).toContain('disabled=""');
    expect(html).toContain('готово');
  });
});
