// Known delivery limitation, not a successful recovery contract. Keep the failure
// visible until client acknowledgements and durable replay are designed together.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RAID_PREP_S } from '../shared/raid';
import { claimRaid as applyRaid, claimWar as applyWar, loadProgress } from '../src/game/progress';
import { ClanStore, type Clan } from './clans';
import { Guard } from './guard';
import { warPair, warSettle } from './wars';

const msk = (iso: string) => Date.parse(`${iso}+03:00`);
const SAT = msk('2026-10-31T12:00:00');
const MON = msk('2026-11-02T10:00:00');
const settings = { name: 'Честные', tag: 'ЧЕС', description: '', open: true, minLevel: 1, flag: '', country: '', city: '' };

function raid(file: string | null = null, guardFile: string | null = null) {
  const s = new ClanStore(file);
  s.guard = new Guard(guardFile);
  s.guard.log = () => {};
  s.create({ id: 'tg:1', name: 'Аня', level: 5 }, settings, SAT);
  const attack = s.raidStart('tg:1', SAT, 'squat') as { attackId: string };
  s.raidHit('tg:1', attack.attackId, 50, SAT + RAID_PREP_S * 1000);
  return s;
}

function war() {
  const s = new ClanStore(null);
  const create = (name: string, base: number) => {
    const c = s.create({ id: `tg:${base}`, name, level: 5 }, { ...settings, name, tag: name.slice(0, 3).toUpperCase() }, msk('2026-10-27T12:00:00')) as Clan;
    for (let i = 1; i < 3; i++) s.join({ id: `tg:${base + i}`, name: `${name}${i}`, level: 5 }, { id: c.id }, msk('2026-10-27T12:00:00'));
    s.setWar(`tg:${base}`, true);
  };
  create('Сокол', 100);
  create('Ворон', 200);
  warPair(s, msk('2026-10-30T19:00:00'));
  s.reps('tg:100', 200, SAT);
  warSettle(s, MON);
  return s;
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    if (!resolve(dir).startsWith(resolve(tmpdir(), 'arena-claim-delivery-'))) throw new Error('Unexpected test directory');
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('known limitation: reward response delivery is not acknowledged', () => {
  it('raid: dropping a successful response leaves the client unpaid and retry denied', () => {
    const s = raid();
    const before = loadProgress();
    const response = s.claimRaid('tg:1', MON);
    expect(response).toMatchObject({ kind: 'raid', key: '2026-10-31' });
    // No applyRaid call: emulate a WebSocket response lost before the UI receives it.
    expect(before.raidClaimed ?? []).not.toContain('2026-10-31');
    expect(s.claimRaid('tg:1', MON)).toMatch(/уже забрана/);
    expect(before.coins).toBe(0);
  });

  it('war: dropping the successful response cannot be recovered by another claim', () => {
    const s = war();
    const before = loadProgress();
    expect(s.claimWar('tg:100', MON)).toMatchObject({ kind: 'war', points: 200 });
    expect(s.claimWar('tg:100', MON)).toMatch(/уже забрана/);
    expect(before.coins).toBe(0);
    expect(before.warClaimed).toBeUndefined();
  });

  it('the unpaid raid stays claimed after flushing and restarting both stores', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arena-claim-delivery-'));
    dirs.push(dir);
    const file = join(dir, 'clans.json');
    const guardFile = join(dir, 'guard.json');
    const s = raid(file, guardFile);
    expect(s.claimRaid('tg:1', MON)).toMatchObject({ kind: 'raid' });
    s.guard.flush();
    s.flush();
    const restarted = new ClanStore(file);
    restarted.guard = new Guard(guardFile);
    expect(restarted.claimRaid('tg:1', MON)).toMatch(/уже забрана/);
    expect(restarted.claimRaid('tg:2', MON)).toMatch(/не в клане/);
    expect(restarted.guard.claimed('tg:2', 'raid:2026-10-31')).toBe(false);
  });

  it('legacy claims without receipts remain denied instead of being paid again', () => {
    const s = raid();
    s.guard.claim('tg:1', 'raid:2026-10-31');
    expect(s.claimRaid('tg:1', MON)).toMatch(/уже забрана/);
  });
});

describe('client-only replay deduplication has a bounded lifetime', () => {
  it.each([
    ['raid', applyRaid, 'raidClaimed'],
    ['war', applyWar, 'warClaimed'],
  ] as const)('%s: a receipt applied after eviction can credit the same reward again', (_kind, apply, field) => {
    const reward = { coins: 10, potions: {}, chest: false };
    let p = loadProgress();
    const first = apply(p, 'week-0', reward, 1)!;
    p = first.progress;
    expect(apply(p, 'week-0', reward, 1)).toBeNull();
    for (let i = 1; i <= 21; i++) p = apply(p, `week-${i}`, reward, 1)!.progress;
    expect(p[field]).not.toContain('week-0');
    // A server-only receipt cache must not presume an unbounded client dedupe log.
    const replay = apply(p, 'week-0', reward, 1)!;
    expect(replay.progress.coins).toBe(p.coins + reward.coins);
  });
});
