import { describe, expect, it } from 'vitest';
import { achDone, ACHIEVEMENTS, heroBadge, newAchievements } from './achievements';
import { claimAchievement, loadProgress, markAchSeen, type Progress } from './progress';

const NOW = new Date(2026, 9, 20, 12).getTime();
const ach = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!;

describe('достижения', () => {
  it('считаются из прогресса, награда и титул — один раз', () => {
    let p: Progress = { ...loadProgress(), days: { '2026-10-20': 120 }, stars: { 10: 3 } };
    expect(achDone(ach('day100'), p, NOW)).toBe(true);
    expect(achDone(ach('boss1'), p, NOW)).toBe(true);
    expect(achDone(ach('reps500'), p, NOW)).toBe(false);
    const fresh = newAchievements(p, NOW).map((a) => a.id);
    expect(fresh).toEqual(expect.arrayContaining(['first', 'day100', 'boss1']));
    p = markAchSeen(p, fresh);
    expect(newAchievements(p, NOW)).toHaveLength(0);
    const got = claimAchievement(p, 'day100', 50)!;
    expect(got.coins).toBe(p.coins + 50);
    expect(heroBadge(got)?.id).toBe('day100');
    expect(claimAchievement(got, 'day100', 50)).toBeNull();
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});
