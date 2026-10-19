// Звуки боёв: следят за состоянием экрана и играют эффекты на изменения, не вмешиваясь в логику.
import { sfx, useChange } from './audio';
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
