import { lazy, Suspense, useState } from 'react';
import { Adventure, AdventureTab } from './game/Adventure';
import type { JoinRoom } from './Duel';
import { PowerToast } from './PowerToast';
import { FriendInbox } from './friends/FriendInbox';
import { EXERCISE_LABELS, isRepExercise, REP_EXERCISES, RepExercise } from './repCounter';
import { Banner, MapIcon, Shield, Swords } from './icons';
import { House } from './village/icons';
import { UpdateBanner } from './updates/UpdateBanner';
import { useBusy } from './updates/busy';
import { clanInviteCode, friendInviteCode, inviteCode, startTab } from './telegram';
import { t } from './i18n';

// Дуэль с 3D-ареной и камерой грузится, когда её открыли.
const Duel = lazy(() => import('./Duel').then((m) => ({ default: m.Duel })));

type Tab = AdventureTab | 'duel';

const NAV: { tab: Tab; Icon: typeof Shield; label: string }[] = [
  { tab: 'hero', Icon: Shield, label: t('Герой') },
  { tab: 'map', Icon: MapIcon, label: t('Карта') },
  { tab: 'village', Icon: House, label: t('Деревня') },
  { tab: 'clan', Icon: Banner, label: t('Клан') },
  { tab: 'duel', Icon: Swords, label: t('Дуэль') },
];

export function App() {
  // Ссылка друга или кнопка бота «Друзья» открывают экран друзей во вкладке дуэли.
  const [friendsFirst, setFriendsFirst] = useState(() => !!friendInviteCode() || startTab() === 'friends');
  const [join, setJoin] = useState<JoinRoom>();
  const [tab, setTab] = useState<Tab>(inviteCode() || friendsFirst ? 'duel' : clanInviteCode() || startTab() === 'clan' ? 'clan' : startTab() === 'village' ? 'village' : 'hero');
  const [exercise, setExercise] = useState<RepExercise>('pushup');
  const [playing, setPlaying] = useState(false);
  useBusy(playing);
  const full = (tab === 'map' || tab === 'village') && !playing;

  return (
    <div className={`app ${full ? 'full' : ''} ${playing ? '' : 'with-nav'}`}>
      {tab === 'duel' ? (
        <>
          <div className="app-head">
            <h1>{t('Дуэль')}</h1>
            <span className="muted">{t('кто больше за минуту')}</span>
          </div>
          <div className="tabs small">
            {/* Планка на время в дуэли не годится: бой идёт на повторы. */}
            {REP_EXERCISES.map((ex) => (
              <button key={ex} className={ex === exercise ? 'active' : ''} onClick={() => setExercise(ex)}>
                {EXERCISE_LABELS[ex]}
              </button>
            ))}
          </div>
          <Suspense fallback={<div className="lazy-loading muted">{t('Загружаем…')}</div>}>
            <Duel exercise={exercise} join={join} friends={friendsFirst} />
          </Suspense>
        </>
      ) : (
        <Adventure
          tab={tab}
          onTab={setTab}
          onPlaying={setPlaying}
          onFriends={() => {
            setFriendsFirst(true);
            setJoin(undefined);
            setTab('duel');
          }}
        />
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

      <UpdateBanner />

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
