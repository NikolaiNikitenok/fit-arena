import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ArenaStage } from './ArenaStage';
import { MAX_HP } from '../shared/battle';
import type { ClientMessage, FighterView, PlayerInfo, ServerMessage } from '../shared/protocol';
import { Exercise, EXERCISE_LABELS } from './repCounter';
import { inviteCode, inviteLink, share, tg, userName } from './telegram';
import { useRepCamera } from './useRepCamera';

type Phase = 'connecting' | 'offline' | 'menu' | 'room' | 'countdown' | 'fight' | 'over';

interface RoomInfo {
  code: string;
  exercise: Exercise;
  players: PlayerInfo[];
}

const RESULT_TEXT = { win: 'Победа!', lose: 'Поражение', draw: 'Ничья' };
const REASON_TEXT = { ko: 'нокаутом', time: 'по очкам', left: 'соперник покинул бой' };

const freshFighter = (name: string): FighterView => ({ name, hp: MAX_HP, maxHp: MAX_HP, hits: 0, combo: false });

export function Duel({ exercise }: { exercise: Exercise }) {
  const camera = useRepCamera();
  const ws = useRef<WebSocket | null>(null);
  const [phase, setPhase] = useState<Phase>('connecting');
  const [me, setMe] = useState<{ id: string; botUsername: string | null } | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [state, setState] = useState<{ me: FighterView; opponent: FighterView } | null>(null);
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<Extract<ServerMessage, { type: 'end' }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [shared, setShared] = useState<string | null>(null);
  const [connectSeq, setConnectSeq] = useState(0);

  const send = (msg: ClientMessage) => ws.current?.readyState === WebSocket.OPEN && ws.current.send(JSON.stringify(msg));

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${proto}//${location.host}/ws`);
    ws.current = socket;
    setPhase('connecting');
    socket.onopen = () => socket.send(JSON.stringify({ type: 'hello', initData: tg?.initData ?? '', name: userName() }));
    socket.onclose = () => {
      if (ws.current !== socket) return;
      camera.stop();
      setPhase('offline');
    };
    socket.onmessage = (event) => {
      const msg: ServerMessage = JSON.parse(event.data);
      switch (msg.type) {
        case 'welcome': {
          setMe({ id: msg.id, botUsername: msg.botUsername });
          setPhase('menu');
          const invite = inviteCode();
          if (invite) socket.send(JSON.stringify({ type: 'join', code: invite }));
          break;
        }
        case 'room':
          setRoom({ code: msg.code, exercise: msg.exercise, players: msg.players });
          setPhase((p) => (p === 'countdown' || p === 'fight' || p === 'over' ? p : 'room'));
          break;
        case 'countdown':
          setResult(null);
          setState(null);
          setEndsAt(Date.now() + msg.startsInMs);
          setPhase('countdown');
          break;
        case 'state':
          setState({ me: msg.me, opponent: msg.opponent });
          setEndsAt(Date.now() + msg.leftMs);
          setPhase('fight');
          break;
        case 'end':
          setResult(msg);
          setPhase('over');
          camera.stop();
          break;
        case 'error':
          setError(msg.message);
          break;
      }
    };
    return () => {
      ws.current = null;
      socket.close();
    };
  }, [connectSeq]);

  // Таймер на экране: тикаем, пока идёт отсчёт или бой.
  useEffect(() => {
    if (phase !== 'countdown' && phase !== 'fight') return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [phase]);

  const ready = async () => {
    setError(null);
    try {
      if (!camera.active) await camera.start(room?.exercise ?? exercise, () => send({ type: 'rep' }));
      send({ type: 'ready' });
    } catch (e) {
      setError(`Не удалось запустить камеру: ${e instanceof Error ? e.message : 'ошибка модели'}`);
    }
  };

  const invite = async () => {
    if (!room) return;
    const how = await share(
      inviteLink(room.code, me?.botUsername ?? null),
      `Вызываю тебя на бой в Fit Arena: ${EXERCISE_LABELS[room.exercise].toLowerCase()}, кто больше за минуту!`,
    ).catch(() => null);
    setShared(how === 'copied' ? 'Ссылка скопирована' : null);
  };

  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const opponentInfo = room?.players.find((p) => p.id !== me?.id);
  const myInfo = room?.players.find((p) => p.id === me?.id);
  const view = state ?? { me: freshFighter(userName()), opponent: freshFighter(opponentInfo?.name ?? 'Соперник') };

  let overlay: ReactNode = null;
  if (phase === 'countdown') overlay = <div className="result-title">{seconds || 'Бой!'}</div>;
  if (phase === 'over' && result)
    overlay = (
      <>
        <div className="result-title">{RESULT_TEXT[result.result]}</div>
        <div className="muted">
          {result.reason === 'left' ? REASON_TEXT.left : `${REASON_TEXT[result.reason]} · ${view.me.hits} повторов`}
        </div>
      </>
    );
  if (phase === 'connecting') overlay = <div className="muted">Подключаюсь к арене…</div>;
  if (phase === 'offline')
    overlay = (
      <>
        <div className="muted">Нет связи с ареной</div>
        <button className="primary" onClick={() => setConnectSeq((n) => n + 1)}>
          Переподключиться
        </button>
      </>
    );

  return (
    <>
      <ArenaStage me={view.me} opponent={view.opponent} seconds={phase === 'fight' ? seconds : 60} camera={camera} overlay={overlay} />

      <div className="hint-line">
        {error ??
          (phase === 'fight'
            ? camera.hint ?? 'Отлично, продолжай!'
            : phase === 'room' && !opponentInfo
              ? 'Отправь другу приглашение и жди его на ринге'
              : phase === 'room' && myInfo?.ready
                ? `Ждём, пока ${opponentInfo?.name} будет готов`
                : phase === 'room'
                  ? `${opponentInfo?.name} на ринге. Встань в кадр и жми «Я готов»`
                  : '')}
      </div>

      {phase === 'menu' && (
        <>
          <button className="primary" onClick={() => send({ type: 'create', exercise })}>
            Создать бой: {EXERCISE_LABELS[exercise].toLowerCase()}
          </button>
          <div className="join">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Код боя"
              maxLength={5}
              autoCapitalize="characters"
            />
            <button disabled={code.length !== 5} onClick={() => send({ type: 'join', code })}>
              Войти
            </button>
          </div>
        </>
      )}

      {(phase === 'room' || phase === 'over') && room && (
        <>
          <div className="room-card">
            <div>
              Код боя <b>{room.code}</b> · {EXERCISE_LABELS[room.exercise]}
            </div>
            <div className="muted">
              {room.players.map((p) => `${p.name}${p.ready ? ' ✓' : ''}`).join(' против ')}
              {room.players.length < 2 && ' · ждём соперника'}
            </div>
          </div>
          {room.players.length < 2 && (
            <button className="secondary" onClick={invite}>
              {shared ?? 'Позвать друга'}
            </button>
          )}
          {room.players.length === 2 && !myInfo?.ready && (
            <button className="primary" onClick={ready}>
              {phase === 'over' ? 'Реванш' : 'Я готов'}
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
            Выйти из боя
          </button>
        </>
      )}
    </>
  );
}
