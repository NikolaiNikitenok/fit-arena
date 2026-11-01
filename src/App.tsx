import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Adventure, AdventureTab } from './game/Adventure';
import type { JoinRoom } from './Duel';
import { PowerToast } from './PowerToast';
import { FriendInbox } from './friends/FriendInbox';
import { EXERCISE_LABELS, isRepExercise, REP_EXERCISES, RepExercise } from './repCounter';
import { Banner, Lock, MapIcon, Shield, Swords } from './icons';
import { lockedText } from './game/UnlockSheet';
import { hasHero, loadProgress, saveProgress } from './game/progress';
import { rememberUnlocks } from './game/unlocks';
import { linkUnlocks } from './game/unlockLinks';
import { markFirstOpen, track } from './telemetry';
import { onGift } from './cloud';
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

// До первого кадра: разделы, открытые ссылкой (клан, дуэль, друг), запоминаем в прогрессе —
// даже если игрок не заглянет на главную (пришёл по ссылке дуэли и сразу ушёл).
function rememberLinks() {
  const p = loadProgress();
  // Пришёл по кнопке письма бота (?from=wb3 / wb7 / weekly): сколько возвращается по каждому.
  const from = new URLSearchParams(location.search).get('from');
  // Один раз в день на письмо: перезагрузка той же страницы не считается вторым возвратом.
  if (from && /^[\w-]{1,20}$/.test(from)) {
    const key = `fit-arena-letter-${from}-${new Date().toDateString()}`;
    try {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, '1');
        track('letter_open', from);
      }
    } catch {
      track('letter_open', from);
    }
  }
  // Новичок: отсчёт «до первого повтора» — с момента, когда страница начала грузиться.
  if (!hasHero(p) && !p.onboarded) markFirstOpen(Math.round(performance.timeOrigin));
  const next = rememberUnlocks(p, linkUnlocks());
  if (next !== p) saveProgress(next);
}

export function App() {
  useState(rememberLinks);
  // Ссылка друга или кнопка бота «Друзья» открывают экран друзей во вкладке дуэли.
  const [friendsFirst, setFriendsFirst] = useState(() => !!friendInviteCode() || startTab() === 'friends');
  const [join, setJoin] = useState<JoinRoom>();
  const [tab, setTab] = useState<Tab>(inviteCode() || friendsFirst ? 'duel' : clanInviteCode() || startTab() === 'clan' ? 'clan' : startTab() === 'village' ? 'village' : 'hero');
  const [exercise, setExercise] = useState<RepExercise>('pushup');
  const [playing, setPlaying] = useState(false);
  useBusy(playing);
  const full = (tab === 'map' || tab === 'village') && !playing;
  // Вкладки, которые ещё не открыты уровнями карты (src/game/unlocks.ts): сколько уровней осталось.
  const [locks, setLocks] = useState<Partial<Record<Tab, number>>>({});
  const nearestLock = (Object.entries(locks) as [Tab, number][]).filter(([, n]) => n > 0).sort((a, b) => a[1] - b[1])[0]?.[0];
  const [lockToast, setLockToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Подарок бота за возвращение: короткий тост «🎁 …».
  useEffect(
    () =>
      onGift((text) => {
        setLockToast(t('🎁 Подарок за возвращение: {0}', { 0: text }));
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setLockToast(null), 5000);
      }),
    [],
  );
  const showLock = (tb: 'village' | 'clan' | 'duel') => {
    setLockToast(lockedText(tb, locks[tb] ?? 0));
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setLockToast(null), 3500);
  };

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
          onLocks={setLocks}
          onDuel={() => {
            setFriendsFirst(false);
            setJoin(undefined);
            setTab('duel');
          }}
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

      {lockToast && !playing && <div className="toast global">{lockToast}</div>}

      {!playing && (
        <nav className="bottom-nav">
          {NAV.map((n) => {
            const left = locks[n.tab] ?? 0;
            // Как на главной: из закрытых вкладок видна только ближайшая, остальные появятся позже.
            if (left && n.tab !== tab && n.tab !== nearestLock) return null;
            return (
              <button
                key={n.tab}
                className={`${tab === n.tab ? 'active' : ''} ${left ? 'locked' : ''}`}
                onClick={() => {
                  if (left && n.tab !== tab && (n.tab === 'village' || n.tab === 'clan' || n.tab === 'duel')) return showLock(n.tab);
                  setTab(n.tab);
                  setFriendsFirst(false);
                  setJoin(undefined);
                }}
              >
                {left ? <Lock size={22} /> : <n.Icon />}
                {n.label}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
