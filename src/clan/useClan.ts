import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, ClanClientMessage, ClanListItem, ClanView, RaidView } from '../../shared/clan';
import type { ServerMessage } from '../../shared/protocol';
import { guestId, tg, userName } from '../telegram';

export type ClanStatus = 'connecting' | 'online' | 'offline';

/** Соединение экрана клана: клан, чат и рейд приходят с сервера и обновляются вживую. */
export function useClan(level: number) {
  const ws = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ClanStatus>('connecting');
  const [clan, setClan] = useState<ClanView | null | undefined>(undefined);
  const [list, setList] = useState<ClanListItem[] | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attack, setAttack] = useState<{ attackId: string; endsAt: number } | null>(null);
  const [bot, setBot] = useState<{ username: string | null; running: boolean }>({ username: null, running: false });
  const [telegram, setTelegram] = useState(false);
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${proto}//${location.host}/ws`);
    ws.current = socket;
    setStatus('connecting');
    socket.onopen = () => socket.send(JSON.stringify({ type: 'hello', initData: tg?.initData ?? '', name: userName(), guestId: guestId(), channel: 'clan', level }));
    socket.onclose = () => {
      if (ws.current === socket) setStatus('offline');
    };
    socket.onmessage = (e) => {
      const msg: ServerMessage = JSON.parse(e.data);
      switch (msg.type) {
        case 'welcome':
          setBot({ username: msg.botUsername, running: msg.botRunning });
          setTelegram(msg.telegram);
          setStatus('online');
          break;
        case 'clan':
          setClan(msg.clan);
          if (!msg.clan) setChat([]);
          break;
        case 'clanList':
          setList(msg.clans);
          break;
        case 'chat':
          setChat(msg.messages);
          break;
        case 'chatMsg':
          setChat((c) => (c.some((m) => m.id === msg.message.id) ? c : [...c, msg.message].slice(-100)));
          break;
        case 'raid':
          setClan((c) => (c ? { ...c, raid: msg.raid as RaidView } : c));
          break;
        case 'raidAttack':
          setAttack({ attackId: msg.attackId, endsAt: msg.endsAt });
          break;
        case 'clanError':
        case 'error':
          setError(msg.message);
          setTimeout(() => setError((x) => (x === msg.message ? null : x)), 4000);
          break;
      }
    };
    return () => {
      ws.current = null;
      socket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  const send = (msg: ClanClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
  };

  return { status, clan, list, chat, error, attack, setAttack, bot, telegram, send, reconnect: () => setSeq((n) => n + 1) };
}

export type ClanApi = ReturnType<typeof useClan>;
