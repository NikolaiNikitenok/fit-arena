import { useState } from 'react';
import { Campaign } from './Campaign';
import { Duel } from './Duel';
import { Exercise, EXERCISE_LABELS } from './repCounter';
import { inviteCode } from './telegram';

type Mode = 'campaign' | 'duel';

export function App() {
  const [mode, setMode] = useState<Mode>(inviteCode() ? 'duel' : 'campaign');
  const [exercise, setExercise] = useState<Exercise>('pushup');

  return (
    <div className="app">
      <div>
        <h1>Fit Arena</h1>
        <div className="muted">Каждый повтор — удар по сопернику, три подряд — комбо.</div>
      </div>

      <div className="tabs">
        <button className={mode === 'campaign' ? 'active' : ''} onClick={() => setMode('campaign')}>
          Кампания
        </button>
        <button className={mode === 'duel' ? 'active' : ''} onClick={() => setMode('duel')}>
          Дуэль
        </button>
      </div>

      {mode === 'campaign' ? (
        <Campaign />
      ) : (
        <>
          <div className="tabs small">
            {(Object.keys(EXERCISE_LABELS) as Exercise[]).map((ex) => (
              <button key={ex} className={ex === exercise ? 'active' : ''} onClick={() => setExercise(ex)}>
                {EXERCISE_LABELS[ex]}
              </button>
            ))}
          </div>
          <Duel exercise={exercise} />
        </>
      )}
    </div>
  );
}
