// Ход миссии: повторы и время превращаются в прогресс, победу или поражение.
// Логика чистая, без React и камеры, чтобы её можно было проверить тестами.
import type { Exercise } from '../repCounter';
import { Baseline, LevelDef, targetReps } from './levels';

export type Outcome = 'running' | 'won' | 'lost';

export interface MissionView {
  outcome: Outcome;
  exercise: Exercise;
  reps: number;
  // 0..1 — сколько сделано (доски моста, высота подъёма, здоровье босса…).
  progress: number;
  // Строка под прогрессом: «12 из 30», «Волна 2 из 3».
  label: string;
  leftMs: number;
  // Погоня: насколько далеко чудище (0 — догнало, 1 — далеко).
  gap?: number;
  // Босс: сердца игрока и фаза.
  hearts?: number;
  phase?: number;
  // Спасение: сколько жителей расколдовано.
  saved?: number;
  savedOf?: number;
  // Испытание: результат для базы игрока.
  record?: number;
}

const DEFEND_WAVES = 3;
const RESCUE_EVERY = 5;
const BOSS_HEARTS = 3;
// Босс бьёт, если игрок отдыхает дольше этого.
const BOSS_IDLE_MS = 7000;
// Погоня: столько секунд без повторов чудище догоняет с полного отрыва;
// при медленном темпе цели — не меньше трёх интервалов между повторами.
const CHASE_CATCH_S = 8;
const CHASE_CATCH_REPS = 3;

export class Mission {
  private reps = 0;
  private phaseReps = 0;
  private startedAt: number | null = null;
  private lastRepAt = 0;
  private outcome: Outcome = 'running';
  private gap = 1;
  private hearts = BOSS_HEARTS;
  private phase = 0;
  private lastTick = 0;
  readonly target: number;
  private readonly phaseTargets: number[];
  private readonly catchS: number;

  constructor(
    readonly level: LevelDef,
    baseline: Baseline,
  ) {
    this.target = targetReps(level, baseline);
    // У босса здоровье делится на фазы, в каждой своё упражнение и своя цель.
    this.phaseTargets =
      level.type === 'boss'
        ? level.exercises.map((ex) => Math.max(3, Math.round(targetReps(level, baseline, ex) / level.exercises.length)))
        : [this.target];
    this.catchS = Math.max(CHASE_CATCH_S, (CHASE_CATCH_REPS * level.seconds) / this.target);
  }

  get started(): boolean {
    return this.startedAt !== null;
  }

  start(now: number): void {
    this.startedAt = now;
    this.lastRepAt = now;
    this.lastTick = now;
  }

  get exercise(): Exercise {
    return this.level.exercises[Math.min(this.phase, this.level.exercises.length - 1)];
  }

  rep(now: number): void {
    if (this.outcome !== 'running' || this.startedAt === null) return;
    this.tick(now);
    if (this.outcome !== 'running') return;
    this.reps += 1;
    this.phaseReps += 1;
    this.lastRepAt = now;
    const { type } = this.level;
    if (type === 'chase') {
      // Повтор даёт рывок: целевой темп ровно удерживает отрыв.
      const perSecond = this.target / this.level.seconds;
      this.gap = Math.min(1, this.gap + 1 / (this.catchS * perSecond));
    }
    if (type === 'boss' && this.phaseReps >= this.phaseTargets[this.phase]) {
      this.phase += 1;
      this.phaseReps = 0;
      if (this.phase >= this.phaseTargets.length) this.outcome = 'won';
      return;
    }
    if (type === 'build' || type === 'climb' || type === 'rescue') {
      if (this.reps >= this.target) this.outcome = 'won';
    }
    if (type === 'defend' && this.reps >= this.target) this.outcome = 'won';
  }

  tick(now: number): void {
    if (this.outcome !== 'running' || this.startedAt === null) return;
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;
    const elapsed = now - this.startedAt;
    const { type, seconds } = this.level;

    if (type === 'chase') {
      this.gap = Math.max(0, this.gap - dt / this.catchS);
      if (this.gap === 0) this.outcome = 'lost';
    }
    if (type === 'boss' && now - this.lastRepAt >= BOSS_IDLE_MS) {
      this.hearts -= 1;
      this.lastRepAt = now;
      if (this.hearts <= 0) this.outcome = 'lost';
    }
    if (type === 'defend') {
      // Волна прорывается, если к её концу не набрано нужное число повторов.
      const wave = Math.floor(elapsed / ((seconds * 1000) / DEFEND_WAVES));
      const needed = Math.ceil((this.target / DEFEND_WAVES) * Math.min(wave, DEFEND_WAVES));
      if (wave > 0 && this.reps < needed) this.outcome = 'lost';
    }
    if (this.outcome === 'running' && elapsed >= seconds * 1000) {
      // Испытание и погоня заканчиваются победой, если игрок дотянул до конца.
      this.outcome = type === 'trial' || type === 'chase' ? 'won' : 'lost';
    }
  }

  view(now: number): MissionView {
    const { type, seconds } = this.level;
    const elapsed = this.startedAt === null ? 0 : now - this.startedAt;
    const leftMs = Math.max(0, seconds * 1000 - elapsed);
    const base = { outcome: this.outcome, exercise: this.exercise, reps: this.reps, leftMs };
    switch (type) {
      case 'trial':
        return { ...base, progress: elapsed / (seconds * 1000), label: `${this.reps} повторов`, record: this.reps };
      case 'chase':
        return { ...base, progress: elapsed / (seconds * 1000), label: `Продержись ещё ${Math.ceil(leftMs / 1000)} с`, gap: this.gap };
      case 'rescue': {
        const savedOf = Math.max(1, Math.round(this.target / RESCUE_EVERY));
        const saved = Math.min(savedOf, Math.floor((this.reps / this.target) * savedOf));
        return { ...base, progress: this.reps / this.target, label: `Спасено ${saved} из ${savedOf}`, saved, savedOf };
      }
      case 'defend': {
        const wave = Math.min(DEFEND_WAVES, Math.floor(elapsed / ((seconds * 1000) / DEFEND_WAVES)) + 1);
        return { ...base, progress: this.reps / this.target, label: `Волна ${wave} из ${DEFEND_WAVES} · ${this.reps}/${this.target}` };
      }
      case 'boss': {
        const total = this.phaseTargets.reduce((a, b) => a + b, 0);
        const done = this.phaseTargets.slice(0, this.phase).reduce((a, b) => a + b, 0) + this.phaseReps;
        return {
          ...base,
          progress: Math.min(1, done / total),
          label: `Фаза ${Math.min(this.phase + 1, this.phaseTargets.length)} из ${this.phaseTargets.length}`,
          hearts: this.hearts,
          phase: this.phase,
        };
      }
      default:
        return { ...base, progress: Math.min(1, this.reps / this.target), label: `${this.reps} из ${this.target}` };
    }
  }

  /** Звёзды: за запас времени, а у босса — за оставшиеся сердца. */
  stars(now: number): number {
    if (this.outcome !== 'won') return 0;
    const { type, seconds } = this.level;
    if (type === 'trial' || type === 'chase') return type === 'chase' ? (this.gap > 0.6 ? 3 : this.gap > 0.3 ? 2 : 1) : 3;
    if (type === 'boss') return this.hearts;
    const used = (now - (this.startedAt ?? now)) / (seconds * 1000);
    return used <= 0.6 ? 3 : used <= 0.85 ? 2 : 1;
  }
}
