import { lazy, Suspense, useState } from 'react';
import { Adventure, AdventureTab } from './game/Adventure';
import type { JoinRoom } from './Duel';
import { PowerToast } from './PowerToast';
import { FriendInbox } from './friends/FriendInbox';
import { EXERCISE_LABELS, isRepExercise, REP_EXERCISES, RepExercise } from './repCounter';
import { Banner, MapIcon, Shield, Swords } from './icons';
import { clanInviteCode, friendInviteCode, inviteCode, startTab } from './telegram';

// Дуэль с 3D-ареной и камерой грузится, когда её открыли.
const Duel = lazy(() => import('./Duel').then((m) => ({ default: m.Duel })));

type Tab = AdventureTab | 'duel';

const NAV: { tab: Tab; Icon: typeof Shield; label: string }[] = [
  { tab: 'hero', Icon: Shield, label: 'Герой' },
  { tab: 'map', Icon: MapIcon, label: 'Карта' },
  { tab: 'clan', Icon: Banner, label: 'Клан' },
  { tab: 'duel', Icon: Swords, label: 'Дуэль' },
];

export function App() {
  // Ссылка друга или кнопка бота «Друзья» открывают экран друзей во вкладке дуэли.
  const [friendsFirst, setFriendsFirst] = useState(() => !!friendInviteCode() || startTab() === 'friends');
  const [join, setJoin] = useState<JoinRoom>();
  const [tab, setTab] = useState<Tab>(inviteCode() || friendsFirst ? 'duel' : clanInviteCode() || startTab() === 'clan' ? 'clan' : 'hero');
  const [exercise, setExercise] = useState<RepExercise>('pushup');
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
            {/* Планка на время в дуэли не годится: бой идёт на повторы. */}
            {REP_EXERCISES.map((ex) => (
              <button key={ex} className={ex === exercise ? 'active' : ''} onClick={() => setExercise(ex)}>
                {EXERCISE_LABELS[ex]}
              </button>
            ))}
          </div>
          <Suspense fallback={<div className="lazy-loading muted">Загружаем…</div>}>
            <Duel exercise={exercise} join={join} friends={friendsFirst} />
          </Suspense>
        </>
      ) : (
        <Adventure tab={tab} onTab={setTab} onPlaying={setPlaying} />
      )}

      <FriendInbox
        paused={playing}
        onAccept={(c) => {
          if (isRepExercise(c.exercise)) setExercise(c.exercise);
          setJoin({ code: c.room, seq: Date.now() });
          setTab('duel');
        }}
      />

      <PowerToast />

      {!playing && (
        <nav className="bottom-nav">
          {NAV.map((n) => (
            <button
              key={n.tab}
              className={tab === n.tab ? 'active' : ''}
              onClick={() => {
                setTab(n.tab);
                setFriendsFirst(false);
                setJoin(undefined);
              }}
            >
              <n.Icon />
              {n.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
