import { useState } from 'react';
import { Adventure, AdventureTab } from './game/Adventure';
import { Duel } from './Duel';
import { Exercise, EXERCISE_LABELS } from './repCounter';
import { inviteCode } from './telegram';

type Tab = AdventureTab | 'duel';

const NAV: { tab: Tab; icon: string; label: string }[] = [
  { tab: 'hero', icon: '🛡️', label: 'Герой' },
  { tab: 'map', icon: '🗺️', label: 'Карта' },
  { tab: 'duel', icon: '⚔️', label: 'Дуэль' },
];

export function App() {
  const [tab, setTab] = useState<Tab>(inviteCode() ? 'duel' : 'hero');
  const [exercise, setExercise] = useState<Exercise>('pushup');
  const [playing, setPlaying] = useState(false);
  const full = tab === 'map' && !playing;

  return (
    <div className={`app ${full ? 'full' : ''} ${playing ? '' : 'with-nav'}`}>
      {!full && !playing && (
        <div className="app-head">
          <h1>Атлетия</h1>
          <div className="muted">Каждый честный повтор спасает мир от Лени.</div>
        </div>
      )}

      {tab === 'duel' ? (
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
      ) : (
        <Adventure tab={tab} onTab={setTab} onPlaying={setPlaying} />
      )}

      {!playing && (
        <nav className="bottom-nav">
          {NAV.map((n) => (
            <button key={n.tab} className={tab === n.tab ? 'active' : ''} onClick={() => setTab(n.tab)}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
