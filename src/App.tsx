import { useState } from 'react';
import { BotFight } from './BotFight';
import { Duel } from './Duel';
import { Exercise, EXERCISE_LABELS } from './repCounter';
import { inviteCode } from './telegram';

type Mode = 'bot' | 'duel';

export function App() {
  const [mode, setMode] = useState<Mode>(inviteCode() ? 'duel' : 'bot');
  const [exercise, setExercise] = useState<Exercise>('pushup');

  return (
    <div className="app">
      <div>
        <h1>Fit Arena</h1>
        <div className="muted">Каждый повтор — удар по сопернику, три подряд — комбо.</div>
      </div>

      <div className="tabs">
        <button className={mode === 'bot' ? 'active' : ''} onClick={() => setMode('bot')}>
          С ботом
        </button>
        <button className={mode === 'duel' ? 'active' : ''} onClick={() => setMode('duel')}>
          Дуэль
        </button>
      </div>

      <div className="tabs small">
        {(Object.keys(EXERCISE_LABELS) as Exercise[]).map((ex) => (
          <button key={ex} className={ex === exercise ? 'active' : ''} onClick={() => setExercise(ex)}>
            {EXERCISE_LABELS[ex]}
          </button>
        ))}
      </div>

      {mode === 'bot' ? <BotFight exercise={exercise} /> : <Duel exercise={exercise} />}
    </div>
  );
}
