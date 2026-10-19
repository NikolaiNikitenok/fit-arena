import { useState } from 'react';
import { Adventure, AdventureTab } from './game/Adventure';
import { Duel } from './Duel';
import { Exercise, EXERCISE_LABELS } from './repCounter';
import { Banner, MapIcon, Shield, Swords } from './icons';
import { clanInviteCode, inviteCode, startTab } from './telegram';

type Tab = AdventureTab | 'duel';

const NAV: { tab: Tab; Icon: typeof Shield; label: string }[] = [
  { tab: 'hero', Icon: Shield, label: 'Герой' },
  { tab: 'map', Icon: MapIcon, label: 'Карта' },
  { tab: 'clan', Icon: Banner, label: 'Клан' },
  { tab: 'duel', Icon: Swords, label: 'Дуэль' },
];

export function App() {
  const [tab, setTab] = useState<Tab>(inviteCode() ? 'duel' : clanInviteCode() || startTab() === 'clan' ? 'clan' : 'hero');
  const [exercise, setExercise] = useState<Exercise>('pushup');
  const [playing, setPlaying] = useState(false);
  const full = tab === 'map' && !playing;

  return (
    <div className={`app ${full ? 'full' : ''} ${playing ? '' : 'with-nav'}`}>
      {tab === 'duel' ? (
        <>
          <div className="app-head">
            <h1>Дуэль</h1>
            <span className="muted">кто больше за минуту</span>
          </div>
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
              <n.Icon />
              {n.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
