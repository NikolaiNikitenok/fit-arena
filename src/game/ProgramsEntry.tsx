import { type Exercise } from '../repCounter';
import { Plan } from '../icons';
import { availability, programById, programsOf, type SetPlan } from './programs';
import type { Progress } from './progress';
import type { QuickWorkout } from './Programs';
import './Programs.css';

// Вход в программы на главном экране. Лёгкий модуль: сам экран программ с камерой грузится по нажатию.

/** Карточка на главном экране: идущая программа и её день или приглашение выбрать. */
export function ProgramsEntry({ progress, onOpen }: { progress: Progress; onOpen: () => void }) {
  const run = programsOf(progress).run;
  const def = run && programById(run.id);
  const av = run && availability(run, Date.now());
  return (
    <button className="prog-entry" onClick={onOpen}>
      <span className="prog-icon">
        <Plan size={24} />
      </span>
      <span className="prog-card-text">
        <b>Программы Грома</b>
        {def && run ? (
          <>
            <small>
              {def.title} · день {run.day} из {def.days}
            </small>
            <span className="pass-bar">
              <span style={{ display: 'block', width: `${((run.day - 1) / def.days) * 100}%`, background: def.color }} />
            </span>
          </>
        ) : (
          <small>От новичка до 5 минут планки: план на 2–4 недели</small>
        )}
      </span>
      {av === 'ready' && <span className="ach-entry-new">сегодня</span>}
      <span className="chev">›</span>
    </button>
  );
}

/** Подходы на планку под задание дня: остаток делим на удержания чуть короче рекорда. */
export function plankDailyWorkout(left: number, baseline: number, ask: string): QuickWorkout {
  const hold = Math.max(10, Math.round((baseline * 0.8) / 5) * 5);
  const n = Math.max(1, Math.ceil(left / hold));
  const per = Math.max(10, Math.round(left / n / 5) * 5);
  const sets: SetPlan[] = Array.from({ length: n }, (_, i) => ({ exercise: 'plank' as Exercise, target: per, rest: i === n - 1 ? 0 : 45 }));
  return { kind: 'daily', tag: 'Задание дня', title: ask, sets };
}

