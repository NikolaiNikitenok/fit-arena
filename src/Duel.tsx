import { type ReactNode, useEffect, useRef, useState } from 'react';
import { track } from './telemetry';
import { useBusy } from './updates/busy';
import { StartGate } from './StartGate';
import { ArenaStage } from './ArenaStage';
import { MAX_HP } from '../shared/battle';
import type { ClientMessage, FighterView, PlayerInfo, ProfileView, ServerMessage, TopEntry } from '../shared/protocol';
import { LEAGUES, leagueOf, seasonEndsAt } from '../shared/rating';
import { CameraGuide } from './CameraGuide';
import { Exercise, EXERCISE_LABELS, RepExercise } from './repCounter';
import { guestId, inviteCode, inviteLink, share, tg, userName } from './telegram';
import { preloadPose, useRepCamera } from './useRepCamera';
import { useMusic } from './audio';
import { useDuelSounds } from './gameSounds';
import { useVoiceCoach } from './voice';
import { recordDuel, recordOutsideReps, recordTrainerDuel } from './game/progress';
import { TrainerDuel } from './TrainerDuel';
import { FriendsScreen } from './friends/FriendsScreen';
import { Users } from './icons';
import { t } from './i18n';
import { openProfile } from './social/bus';

/** Войти в эту комнату боя: вызов друга. seq — чтобы тот же код можно было передать снова. */
export type JoinRoom = { code: string; seq: number };

type Phase = 'connecting' | 'offline' | 'menu' | 'room' | 'countdown' | 'fight' | 'over';

interface RoomInfo {
  code: string;
  exercise: Exercise;
  players: PlayerInfo[];
}

const RESULT_TEXT = { win: t('Победа!'), lose: t('Поражение'), draw: t('Ничья') };
const REASON_TEXT = { ko: t('нокаутом'), time: t('по очкам'), left: t('соперник покинул бой') };

const freshFighter = (name: string): FighterView => ({ name, hp: MAX_HP, maxHp: MAX_HP, hits: 0, combo: false });

/** Вкладка дуэлей: живой бой через сервер, бой с тренером на устройстве или друзья. */
export function Duel({ exercise, join, friends: openFriends = false }: { exercise: RepExercise; join?: JoinRoom; friends?: boolean }) {
  const [trainer, setTrainer] = useState(false);
  const [friends, setFriends] = useState(openFriends);
  const [room, setRoom] = useState(join);
  const [note, setNote] = useState<string | null>(null);
  // Приняли вызов из карточки: сразу в комнату.
  useEffect(() => {
    if (!join) return;
    setTrainer(false);
    setFriends(false);
    setNote(null);
    setRoom(join);
  }, [join?.seq]);
  if (friends)
    return (
      <FriendsScreen
        exercise={exercise}
        onBack={() => setFriends(false)}
        onRoom={(code, n) => {
          setRoom({ code, seq: Date.now() });
          setNote(n ?? null);
          setFriends(false);
        }}
      />
    );
  return trainer ? <TrainerDuel exercise={exercise} onExit={() => setTrainer(false)} /> : <LiveDuel exercise={exercise} onTrainer={() => setTrainer(true)} onFriends={() => {
        // Старую комнату вызова не повторяем, когда вернёмся с экрана друзей.
        setRoom(undefined);
        setFriends(true);
      }}
      join={room} note={note} />;
}

function LiveDuel({ exercise, onTrainer, onFriends, join, note }: { exercise: RepExercise; onTrainer: () => void; onFriends: () => void; join?: JoinRoom; note: string | null }) {
  // Меню дуэли без камеры: распознавание качаем, только когда игрок в комнате.
  const camera = useRepCamera(false);
  const ws = useRef<WebSocket | null>(null);
  const [phase, setPhase] = useState<Phase>('connecting');
  // Ждём соперника или бьёмся: обновление игры подождёт.
  useBusy(phase === 'room' || phase === 'countdown' || phase === 'fight');
  useEffect(() => {
    if (phase === 'room' || phase === 'countdown') void preloadPose().catch(() => {});
  }, [phase]);
  const [me, setMe] = useState<{ id: string; pro: boolean; bot: { username: string | null; running: boolean } } | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [state, setState] = useState<{ me: FighterView; opponent: FighterView } | null>(null);
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<Extract<ServerMessage, { type: 'end' }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [shared, setShared] = useState<string | null>(null);
  const [connectSeq, setConnectSeq] = useState(0);
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [top, setTop] = useState<TopEntry[] | null>(null);

  // Комната, куда войти после подключения (вызов друга); welcomed — сервер уже ответил.
  const joinRef = useRef(join);
  const welcomed = useRef(false);

  // Свои повторы в бою: после боя засчитываем их в серию, задание дня и клан.
  const fight = useRef<{ exercise: Exercise; hits: number; ghost?: boolean } | null>(null);

  const send = (msg: ClientMessage) => ws.current?.readyState === WebSocket.OPEN && ws.current.send(JSON.stringify(msg));

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${proto}//${location.host}/ws`);
    ws.current = socket;
    setPhase('connecting');
    socket.onopen = () => socket.send(JSON.stringify({ type: 'hello', initData: tg?.initData ?? '', name: userName(), guestId: guestId() }));
    socket.onclose = () => {
      if (ws.current !== socket) return;
      camera.stop();
      setPhase('offline');
    };
    socket.onmessage = (event) => {
      const msg: ServerMessage = JSON.parse(event.data);
      switch (msg.type) {
        case 'welcome': {
          setMe({ id: msg.id, pro: !!msg.pro, bot: { username: msg.botUsername, running: msg.botRunning } });
          setPhase('menu');
          welcomed.current = true;
          const invite = joinRef.current?.code ?? inviteCode();
          joinRef.current = undefined;
          if (invite) socket.send(JSON.stringify({ type: 'join', code: invite }));
          break;
        }
        case 'room':
          setRoom({ code: msg.code, exercise: msg.exercise, players: msg.players });
          // Соперник — запись игрока («призрак» пустой очереди, server/ghosts.ts): бой тренировочный.
          fight.current = { exercise: msg.exercise, hits: fight.current?.hits ?? 0, ghost: msg.players.some((p) => p.id.startsWith('ghost:')) };
          setPhase((p) => (p === 'countdown' || p === 'fight' || p === 'over' ? p : 'room'));
          break;
        case 'profile':
          setProfile(msg.profile);
          if (msg.delta != null) setDelta(msg.delta);
          break;
        case 'queue':
          setWaiting(msg.waiting);
          break;
        case 'top':
          setTop(msg.players);
          break;
        case 'countdown':
          setDelta(null);
          setResult(null);
          setState(null);
          setEndsAt(Date.now() + msg.startsInMs);
          setPhase('countdown');
          break;
        case 'state':
          setState({ me: msg.me, opponent: msg.opponent });
          if (fight.current) fight.current.hits = msg.me.hits;
          setEndsAt(Date.now() + msg.leftMs);
          setPhase('fight');
          break;
        case 'end':
          if (fight.current?.hits) recordOutsideReps(fight.current.exercise, fight.current.hits, Date.now());
          // Победа над записью не идёт в «выиграй дуэль» пропуска (как бой с тренером), иначе это бесплатная ферма.
          if (fight.current?.ghost) {
            recordTrainerDuel(Date.now());
            track('ghost_fight', msg.result);
          } else if (fight.current) recordDuel(msg.result, Date.now());
          if (fight.current) fight.current.hits = 0;
          setResult(msg);
          setPhase('over');
          camera.stop();
          break;
        case 'error':
          setError(t(msg.message));
          break;
      }
    };
    return () => {
      ws.current = null;
      welcomed.current = false;
      socket.close();
    };
  }, [connectSeq]);

  // Вызов друга, когда соединение уже есть.
  useEffect(() => {
    if (!join) return;
    if (welcomed.current && ws.current?.readyState === WebSocket.OPEN) send({ type: 'join', code: join.code });
    else joinRef.current = join;
  }, [join?.seq]);

  // Таймер на экране: тикаем, пока идёт отсчёт или бой.
  useEffect(() => {
    if (phase !== 'countdown' && phase !== 'fight') return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [phase]);

  const ready = async () => {
    setError(null);
    try {
      // Первый раз камера включается с кнопкой «Начать»: «готов» уходит сопернику, когда игрок встал в кадр.
      if (!camera.active) return void (await camera.start(room?.exercise ?? exercise, () => send({ type: 'rep' }), undefined, { gate: true }));
      send({ type: 'ready' });
      track('duel_start', 'live');
    } catch (e) {
      setError(t('Не удалось запустить камеру: {0}', { 0: e instanceof Error ? e.message : t('ошибка модели') }));
    }
  };

  const invite = async () => {
    if (!room) return;
    const how = await share(
      inviteLink(room.code, me?.bot ?? { username: null, running: false }),
      t('Вызываю тебя на бой в NikitenokArena: {0}, кто больше за минуту!', { 0: EXERCISE_LABELS[room.exercise].toLowerCase() }),
    ).catch(() => null);
    setShared(how === 'copied' ? t('Ссылка скопирована') : null);
  };

  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const opponentInfo = room?.players.find((p) => p.id !== me?.id);
  const myInfo = room?.players.find((p) => p.id === me?.id);
  const view = state ?? { me: { ...freshFighter(userName()), pro: me?.pro }, opponent: freshFighter(opponentInfo?.name ?? t('Соперник')) };
  // В меню спокойная тема, на арене барабаны.
  useMusic(phase === 'room' || phase === 'countdown' || phase === 'fight' || phase === 'over' ? 'arena' : 'calm');
  useDuelSounds(phase, seconds, view.me, view.opponent, result);
  useVoiceCoach(phase === 'fight', view.me.hits, seconds, camera.hint, 60);

  let overlay: ReactNode = null;
  if (phase === 'countdown') overlay = <div className="result-title">{seconds || t('Бой!')}</div>;
  if (phase === 'over' && result)
    overlay = (
      <>
        <div className="result-title">{RESULT_TEXT[result.result]}</div>
        <div className="muted">
          {result.reason === 'left' ? REASON_TEXT.left : t('{0} · {1} повторов', { 0: REASON_TEXT[result.reason], 1: view.me.hits })}
        </div>
        {delta != null && delta !== 0 && <div className={`cups-delta ${delta > 0 ? 'up' : 'down'}`}>{delta > 0 ? `+${delta}` : delta} 🏆</div>}
      </>
    );
  if (phase === 'connecting') overlay = <div className="muted">{t('Подключаюсь к арене…')}</div>;
  if (phase === 'offline')
    overlay = (
      <>
        <div className="muted">{t('Нет связи с ареной')}</div>
        <button className="primary" onClick={() => setConnectSeq((n) => n + 1)}>
          {t('Переподключиться')}
        </button>
      </>
    );

  return (
    <>
      <ArenaStage me={view.me} opponent={view.opponent} seconds={phase === 'fight' ? seconds : 60} camera={camera} overlay={overlay} result={phase === 'over' ? result?.result : null}>
        {camera.waiting && room && (
          <StartGate
            title={t('Дуэль · {0}', { 0: EXERCISE_LABELS[room.exercise] })}
            sub={room.players.length < 2 ? t('Соперник ещё не пришёл. Встань так, чтобы в кадре было всё тело') : undefined}
            hint={camera.hint}
            onGo={() => {
              if (!camera.go()) return;
              send({ type: 'ready' });
              track('duel_start', 'live');
            }}
          />
        )}
      </ArenaStage>

      <div className="hint-line">
        {error ??
          (phase === 'fight'
            ? camera.hint ?? t('Отлично, продолжай!')
            : phase === 'room' && !opponentInfo
              ? note ?? t('Отправь другу приглашение и жди его на арене')
              : phase === 'room' && myInfo?.ready
                ? t('Ждём, пока {0} будет готов', { 0: opponentInfo?.name })
                : phase === 'room'
                  ? t('{0} на арене. Встань в кадр и жми «Я готов»', { 0: opponentInfo?.name })
                  : '')}
      </div>

      {phase === 'menu' && profile && <LeagueCard profile={profile} />}

      {(phase === 'connecting' || phase === 'offline') && (
        <button className="secondary daily" onClick={onTrainer}>
          {t('Бой с тренером')}
          <small>{t('в любое время и без сети, кубки не меняются')}</small>
        </button>
      )}

      {phase === 'menu' && (
        <>
          {waiting ? (
            <>
              <button className="secondary" onClick={() => send({ type: 'cancelQuick' })}>
                {t('Ищу соперника… отменить')}
              </button>
              <div className="muted small-note">{t('Никого нет за 10 секунд — бой с записью игрока твоей силы, без кубков.')}</div>
            </>
          ) : (
            <button className="primary" onClick={() => send({ type: 'quick', exercise })}>
              {t('Быстрый бой: {0}', { 0: EXERCISE_LABELS[exercise].toLowerCase() })}
            </button>
          )}
          <button className="secondary" onClick={() => send({ type: 'create', exercise })}>
            {t('Создать бой: {0}', { 0: EXERCISE_LABELS[exercise].toLowerCase() })}
          </button>
          <button className="secondary" onClick={onFriends}>
            <Users /> {t('Друзья')}
          </button>
          <div className="join">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t('Код боя')}
              maxLength={5}
              autoCapitalize="characters"
            />
            <button disabled={code.length !== 5} onClick={() => send({ type: 'join', code })}>
              {t('Войти')}
            </button>
          </div>
          <button className="secondary daily" onClick={onTrainer}>
            {t('Бой с тренером')}
            <small>{t('в любое время и без сети, кубки не меняются')}</small>
          </button>
          <button className="link" onClick={() => (top ? setTop(null) : send({ type: 'top' }))}>
            {top ? t('Скрыть рейтинг') : t('Рейтинг сезона')}
          </button>
          {top && (
            <div className="top">
              {top.length === 0 && <div className="muted">{t('Пока никто не сыграл в этом сезоне. Будь первым!')}</div>}
              {top.map((p, i) => (
                <div key={i} className={`top-row ${p.me ? 'me' : ''} ${p.pid ? 'to-profile' : ''}`} onClick={p.pid ? () => openProfile({ pid: p.pid! }) : undefined}>
                  <span className="top-place">{i + 1}</span>
                  <span className="top-name">
                    <span className={p.pro ? 'pro-name' : ''}>{p.name}</span>
                  </span>
                  <span style={{ color: leagueOf(p.cups).color }}>{leagueOf(p.cups).name}</span>
                  <b>{p.cups} 🏆</b>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {(phase === 'room' || phase === 'over') && room && (
        <>
          <div className="room-card">
            <div>
              {t('Код боя')} <b>{room.code}</b> · {EXERCISE_LABELS[room.exercise]}
            </div>
            <div className="muted">
              {room.players.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && t(' против ')}
                  <span className={p.pro ? 'pro-name' : ''}>{p.name}</span>
                  {p.ready && ' ✓'}
                </span>
              ))}
              {room.players.length < 2 && t(' · ждём соперника')}
            </div>
          </div>
          {phase === 'room' && !myInfo?.ready && <CameraGuide exercise={room.exercise} />}
          {room.players.length < 2 && (
            <button className="secondary" onClick={invite}>
              {shared ?? t('Позвать друга')}
            </button>
          )}
          {room.players.length === 2 && !myInfo?.ready && !camera.waiting && (
            <button className="primary" onClick={ready}>
              {phase === 'over' ? t('Реванш') : t('Я готов')}
            </button>
          )}
          <button
            className="link"
            onClick={() => {
              camera.stop();
              send({ type: 'leave' });
              setRoom(null);
              setState(null);
              setResult(null);
              setPhase('menu');
            }}
          >
            {t('Выйти из боя')}
          </button>
        </>
      )}
    </>
  );
}

function LeagueCard({ profile }: { profile: ProfileView }) {
  const league = leagueOf(profile.cups);
  const next = LEAGUES[LEAGUES.indexOf(league) + 1];
  const days = Math.max(1, Math.ceil((seasonEndsAt(Date.now()) - Date.now()) / 86_400_000));
  return (
    <div className="league-card" style={{ borderColor: league.color }}>
      <div className="league-row">
        <span className="league-name" style={{ color: league.color }}>
          {t('{0} лига', { 0: league.name })}
        </span>
        <b>{profile.cups} 🏆</b>
      </div>
      {next && (
        <div className="bar">
          <div className="bar-fill" style={{ width: `${((profile.cups - league.from) / (next.from - league.from)) * 100}%`, background: league.color }} />
        </div>
      )}
      <div className="muted">
        {next ? t('До лиги «{0}» {1} 🏆 · ', { 0: next.name, 1: next.from - profile.cups }) : ''}
        {t('{0} побед, {1} поражений', { 0: profile.wins, 1: profile.losses })}
        {profile.rank ? t(' · {0} место', { 0: profile.rank }) : ''} {t('· сезон {0}, ещё {1} дн.', { 0: profile.season, 1: days })}
      </div>
    </div>
  );
}
