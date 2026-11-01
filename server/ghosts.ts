// «Призраки» для быстрого боя: пока игроков мало, очередь часто пустая. Через 10 секунд ожидания
// сервер сажает напротив запись настоящего боя игрока похожей силы — повторы приходят в тех же местах
// минуты, что и у него. Имя подписано «запись», кубков за такой бой нет.
// Записей ещё нет — тренировочная «Тень Грома» с ровным темпом по силе самого игрока (тоже без кубков).
//   GHOSTS_FILE — записи (по умолчанию ghosts.json рядом с DATA_FILE)
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Exercise } from '../src/repCounter';
import { ROUND_MS } from './rooms';

export const GHOST_WAIT_MS = 10_000;
export const GHOST_PREFIX = 'ghost:';
// Записей на упражнение: свежие вытесняют старые.
const KEEP = 60;
// Слишком короткий бой (вышел, не начав) записью не годится.
const MIN_REPS = 5;

export interface Recording {
  // Чей бой: свою же запись игроку не подсовываем.
  id: string;
  name: string;
  reps: number;
  times: number[];
  at: number;
}

export const isGhost = (id: string) => id.startsWith(GHOST_PREFIX);

/** Ровный темп «Тени»: target повторов за минуту, к концу чуть медленнее. */
export function shadowTimes(target: number): number[] {
  const n = Math.max(5, Math.min(80, Math.round(target)));
  // Время k-го повтора растёт чуть быстрее линейного: усталость к концу минуты.
  return Array.from({ length: n }, (_, k) => Math.round(ROUND_MS * 0.97 * Math.pow((k + 1) / n, 1.12)));
}

export class GhostStore {
  private data: Partial<Record<Exercise, Recording[]>> = {};
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly file: string | null) {
    if (!file) return;
    try {
      this.data = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      this.data = {};
    }
  }

  /** Запомнить бой игрока (только настоящего и только содержательный). */
  record(exercise: Exercise, rec: Omit<Recording, 'reps'>): void {
    if (isGhost(rec.id) || rec.times.length < MIN_REPS) return;
    const times = rec.times.filter((x) => x >= 0 && x <= ROUND_MS).slice(0, 200);
    // Не больше двух записей одного игрока: новая и одна прошлая, чтобы очередь не заполнил один активный.
    const all = this.data[exercise] ?? [];
    const prev = all.filter((r) => r.id === rec.id).slice(-1);
    const list = [...all.filter((r) => r.id !== rec.id), ...prev];
    list.push({ ...rec, times, reps: times.length });
    this.data[exercise] = list.slice(-KEEP);
    this.schedule();
  }

  /** Запись, ближе всего к нужной силе (target повторов за минуту); не своя. */
  pick(exercise: Exercise, target: number, me: string): Recording | null {
    const list = (this.data[exercise] ?? []).filter((r) => r.id !== me);
    if (!list.length) return null;
    return list.reduce((best, r) => (Math.abs(r.reps - target) < Math.abs(best.reps - target) ? r : best));
  }

  count(exercise: Exercise): number {
    return this.data[exercise]?.length ?? 0;
  }

  private schedule() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 5000);
  }

  flush(): void {
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(`${this.file}.tmp`, JSON.stringify(this.data));
      renameSync(`${this.file}.tmp`, this.file);
    } catch (e) {
      console.error('ghosts save failed', e);
    }
  }
}
