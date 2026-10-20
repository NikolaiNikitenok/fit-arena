import { describe, expect, it } from 'vitest';
import { build, finishDue, upgrade, villageBonus } from '../../shared/village';
import type { Progress } from '../game/progress';
import { villageOf } from '../game/resources';
import { dueRaid, nextRaidAt, unseenRaids } from './raids';
import { FIRST_RAID_MS, foundTown, hasTown, tickTown, townOf, withTown } from './state';
import { claimTask, openTasks, TASKS } from './tasks';

const base = { village: { charge: 40, res: { wood: 5000, stone: 5000, gold: 3000 } } } as unknown as Progress;
const T0 = Date.UTC(2026, 9, 20);

describe('деревня в прогрессе', () => {
  it('основание: ратуша, стартовые запасы, заряд не теряется', () => {
    const p = foundTown(base, T0);
    expect(hasTown(p)).toBe(true);
    expect(villageOf(p).charge).toBe(40);
    expect(villageOf(p).res.wood).toBe(5300);
    expect(villageOf(p).raidAt).toBe(T0 + FIRST_RAID_MS);
  });

  it('стройка доходит по часам, задание жителя выдаёт награду', () => {
    let p = foundTown(base, T0);
    p = withTown(p, build(townOf(p), 'lumbermill', 0, 0, T0) as ReturnType<typeof townOf>);
    expect(openTasks(p)[0].id).toBe('v-mill');
    expect(claimTask(p, 'v-mill')).toBeNull();
    p = tickTown(p, T0 + 20_000);
    const gold = villageOf(p).res.gold;
    p = claimTask(p, 'v-mill')!;
    expect(villageOf(p).res.gold).toBe(gold + 100);
    expect(claimTask(p, 'v-mill')).toBeNull();
    expect(TASKS.length).toBeGreaterThan(10);
  });

  it('набег Князя: только с ратуши 2, раз в полтора дня, мягкая потеря и запись для повтора', () => {
    let p = foundTown(base, T0);
    // На ратуше 1 набег откладывается.
    const skip = dueRaid(p, T0 + FIRST_RAID_MS + 1)!;
    expect(villageOf(skip).log ?? []).toHaveLength(0);
    expect(villageOf(skip).raidAt!).toBeGreaterThan(T0 + FIRST_RAID_MS);
    let t = finishDue(upgrade(townOf(p), 1, T0) as ReturnType<typeof townOf>, T0 + 3600_000);
    p = withTown(p, t);
    const before = villageOf(p).res;
    const r = dueRaid(p, T0 + FIRST_RAID_MS + 1)!;
    const v = villageOf(r);
    expect(v.log).toHaveLength(1);
    expect(unseenRaids(r)).toHaveLength(1);
    const e = v.log![0];
    expect(e.deploys!.length).toBeGreaterThan(0);
    // Уносят не больше 10% запасов (половина от 20%) и не ниже нуля.
    expect(before.wood - v.res.wood).toBeLessThanOrEqual(Math.ceil(before.wood * 0.1));
    expect(v.res.wood).toBeGreaterThanOrEqual(0);
    expect(dueRaid(r, T0 + FIRST_RAID_MS + 2)).toBeNull();
    expect(v.raidAt).toBe(nextRaidAt(T0 + FIRST_RAID_MS + 1, e.seed));
    t = townOf(r);
    expect(t.b.length).toBe(1);
  });

  it('сохранение деревни маленькое', () => {
    let p = foundTown(base, T0);
    let t = townOf(p);
    t = { ...t, res: { wood: 1e6, stone: 1e6, gold: 1e6 } };
    for (let k = 0; k < 30; k++) {
      const r = build(t, 'wall', k % 24, 20 + Math.floor(k / 24), T0);
      if (typeof r !== 'string') t = r;
    }
    p = withTown(p, t);
    expect(JSON.stringify(p.village).length).toBeLessThan(6000);
    expect(villageBonus(townOf(p).b).damage).toBe(0);
  });
});
