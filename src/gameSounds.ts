// Звуки боёв: следят за состоянием экрана и играют эффекты на изменения, не вмешиваясь в логику.
import { BattleSfx, sfx, useChange } from './audio';
import { BattleState, HEAL_RADIUS, UnitKind } from '../shared/villageBattle';
import type { FighterView } from '../shared/protocol';
import type { MissionView } from './game/mission';

/** Миссия: отсчёт, удары по врагам, фазы и удары босса, итог. */
export function useMissionSounds(status: string, countdown: number, view: MissionView, boss: boolean): void {
  const running = status === 'running';
  useChange(running ? countdown : -1, (prev, c) => {
    if (c > 0) sfx('beep');
    else if (prev > 0) {
      sfx('go');
      if (boss) setTimeout(() => sfx('roar'), 250);
    }
  });
  useChange(view.reps, (prev, reps) => {
    if (!running || reps <= prev || view.damage <= 0) return;
    sfx('hit');
    if (reps % 4 === 0) setTimeout(() => sfx('hurt'), 90);
  });
  useChange(view.hearts ?? 0, (prev, h) => running && h < prev && sfx('ouch'));
  useChange(view.phase ?? 0, (prev, p) => running && boss && p > prev && view.outcome === 'running' && setTimeout(() => sfx('roar'), 150));
  useChange(status, (_, s) => (s === 'won' ? sfx('win') : s === 'lost' ? sfx('lose') : undefined));
}

/** Дуэль: отсчёт, свои удары, удары соперника, комбо, нокаут и итог. */
export function useDuelSounds(phase: string, seconds: number, me: FighterView, opponent: FighterView, result: { result: 'win' | 'lose' | 'draw'; reason: string } | null): void {
  useChange(phase === 'countdown' ? seconds : -1, (_, s) => s > 0 && sfx('beep'));
  useChange(opponent.hp, (prev, hp) => phase === 'fight' && hp < prev && sfx('hit'));
  useChange(me.hp, (prev, hp) => phase === 'fight' && hp < prev && sfx('ouch'));
  useChange(me.combo, (prev, c) => c && !prev && sfx('combo'));
  useChange(phase, (prev, p) => {
    if (p === 'fight' && prev === 'countdown') sfx('go');
    if (p !== 'over' || !result) return;
    const end = () => sfx(result.result === 'win' ? 'win' : result.result === 'lose' ? 'lose' : 'coin');
    if (result.reason === 'ko') {
      sfx('ko');
      setTimeout(end, 450);
    } else end();
  });
}

/** Рейд: отсчёт, удары по боссу клана, его рык и победа. */
export function useRaidSounds(phase: string, left: number, reps: number, dead: boolean): void {
  useChange(phase === 'prep' ? left : -1, (_, l) => l > 0 && sfx('beep'));
  useChange(phase, (_, p) => {
    if (p === 'fight') {
      sfx('go');
      setTimeout(() => sfx('roar'), 250);
    }
    if (p === 'done' && dead) sfx('win');
  });
  useChange(reps, (prev, r) => {
    if (r <= prev) return;
    sfx('hit');
    if (r % 5 === 0) setTimeout(() => sfx('hurt'), 90);
  });
}

const STRIKE: Partial<Record<UnitKind, BattleSfx>> = { warrior: 'sword', hero: 'slash', archer: 'bow', giant: 'smash' };

/**
 * Набег на деревню: после каждого шага боя собирает, что случилось (удары, выстрелы, взрывы,
 * рухнувшие постройки, умения), а play() играет каждый звук один раз — толпа слышна громче, но не кашей.
 */
export class BattleSounds {
  private n: Partial<Record<BattleSfx, number>> = {};
  private dead = new Set<number>();
  constructor(s: BattleState) {
    s.buildings.forEach((b, k) => !b.alive && this.dead.add(k));
  }
  private add(k: BattleSfx, n = 1) {
    if (n > 0) this.n[k] = (this.n[k] ?? 0) + n;
  }
  /** Вызвать сразу после stepBattle. */
  collect(s: BattleState) {
    const tick = s.tick - 1;
    let bows = 0;
    for (const u of s.units) {
      if (u.hit === tick) {
        const k = STRIKE[u.u];
        if (k) this.add(k);
        if (u.u === 'archer') bows++;
      }
      if (u.alive && u.def.prefer === 'heal' && s.units.some((o) => o.alive && o.def.prefer !== 'heal' && o.hp < o.maxHp && (o.x - u.x) ** 2 + (o.y - u.y) ** 2 <= HEAL_RADIUS * HEAL_RADIUS)) this.add('heal');
    }
    let arrows = 0;
    for (const f of s.fx) {
      if (f.k === 'arrow') arrows++;
      else if (f.k === 'shell') this.add('cannon');
      else if (f.k === 'boom') this.add('blast');
      else if (f.k === 'cast') this.add('skill');
      else if (f.k === 'bolt') this.add('thunder');
    }
    // Стрелы лучников уже озвучены тетивой, остальные — выстрелы башен.
    this.add('shot', arrows - bows);
    s.buildings.forEach((b, k) => {
      if (b.alive || this.dead.has(k)) return;
      this.dead.add(k);
      this.add(b.wall ? 'wallbreak' : 'crumble');
    });
  }
  play() {
    for (const [k, n] of Object.entries(this.n) as [BattleSfx, number][]) sfx(k, n);
    this.n = {};
  }
}
