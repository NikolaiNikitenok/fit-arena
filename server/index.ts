// Сервер матчей Fit Arena: комнаты на двоих и бой по WebSocket.
//   PORT — порт (по умолчанию 8787)
//   BOT_TOKEN — токен бота: проверяем подпись Telegram и узнаём имя бота для ссылок
//   ALLOW_GUESTS=1 — пускать без подписи Telegram (для разработки в браузере)
//   DATA_FILE — где хранить профили и кубки (по умолчанию ./data/profiles.json)
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ClientMessage, ProfileView, ServerMessage } from '../shared/protocol';
import { EXERCISE_LABELS, type Exercise } from '../src/repCounter';
import { makeCode, type MatchEnd, Room, type Player } from './rooms';
import { type Profile, Store } from './store';
import { verifyInitData } from './telegramAuth';

const PORT = Number(process.env.PORT ?? 8787);
const BOT_TOKEN = process.env.BOT_TOKEN ?? '';
const ALLOW_GUESTS = process.env.ALLOW_GUESTS === '1' || !BOT_TOKEN;

const store = new Store(process.env.DATA_FILE ?? 'data/profiles.json');
const rooms = new Map<string, Room>();
// Последнее соединение каждого игрока: туда шлём новые кубки после боя.
const online = new Map<string, Player>();
// Быстрый бой: кто ждёт соперника по каждому упражнению.
const queue = new Map<Exercise, Player>();

const profileView = (p: Profile): ProfileView => ({
  cups: p.cups,
  wins: p.wins,
  losses: p.losses,
  draws: p.draws,
  rank: store.rank(p.id),
  season: p.season,
});

function onMatchEnd(end: MatchEnd): void {
  const a = online.get(end.a);
  const b = online.get(end.b);
  if (!a || !b) return;
  const pa = store.get(a.id, a.name);
  const pb = store.get(b.id, b.name);
  const delta = store.result(pa, pb, end.outcome);
  a.send({ type: 'profile', profile: profileView(pa), delta: delta.a });
  b.send({ type: 'profile', profile: profileView(pb), delta: delta.b });
}

function newRoom(exercise: Exercise): Room {
  let code = makeCode();
  while (rooms.has(code)) code = makeCode();
  const room = new Room(code, exercise, Date.now, onMatchEnd);
  rooms.set(code, room);
  return room;
}
let botUsername: string | null = null;

async function loadBotUsername(): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    const body = (await res.json()) as { ok: boolean; result?: { username: string } };
    botUsername = body.result?.username ?? null;
    console.log('bot:', botUsername);
  } catch (e) {
    console.error('getMe failed:', e);
  }
}

function cleanName(name: unknown): string {
  const s = typeof name === 'string' ? name.replace(/[\u0000-\u001f]/g, '').trim() : '';
  return s.slice(0, 24) || 'Боец';
}

const http = createServer((req, res) => {
  if (req.url?.startsWith('/api/top')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(store.top(50).map((p) => ({ name: p.name, cups: p.cups, wins: p.wins }))));
    return;
  }
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', (ws: WebSocket & { alive?: boolean }) => {
  let player: Player | null = null;
  let room: Room | null = null;
  const attach = (r: Room) => {
    room = r;
  };
  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));

  const send = (msg: ServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  const leaveRoom = () => {
    if (!room || !player) return;
    room.leave(player.id);
    if (room.empty) {
      room.dispose();
      rooms.delete(room.code);
    }
    room = null;
  };

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (msg.type === 'hello') {
      const tgUser = BOT_TOKEN ? verifyInitData(msg.initData, BOT_TOKEN) : null;
      if (!tgUser && !ALLOW_GUESTS) {
        send({ type: 'error', message: 'Открой приложение из Telegram' });
        ws.close();
        return;
      }
      player = tgUser
        ? { id: `tg:${tgUser.id}`, name: cleanName(tgUser.first_name), send, joinedRoom: attach }
        : { id: `guest:${/^[\w-]{8,40}$/.test(msg.guestId ?? '') ? msg.guestId : randomUUID()}`, name: cleanName(msg.name), send, joinedRoom: attach };
      online.set(player.id, player);
      send({ type: 'welcome', id: player.id, name: player.name, botUsername });
      send({ type: 'profile', profile: profileView(store.get(player.id, player.name)) });
      return;
    }
    if (!player) return;

    switch (msg.type) {
      case 'create': {
        if (!(msg.exercise in EXERCISE_LABELS)) return;
        leaveRoom();
        room = newRoom(msg.exercise as Exercise);
        room.join(player);
        break;
      }
      case 'quick': {
        if (!(msg.exercise in EXERCISE_LABELS)) return;
        const exercise = msg.exercise as Exercise;
        leaveRoom();
        const other = queue.get(exercise);
        if (!other || other.id === player.id || online.get(other.id) !== other) {
          queue.set(exercise, player);
          send({ type: 'queue', waiting: true });
          return;
        }
        queue.delete(exercise);
        const r = newRoom(exercise);
        r.join(other);
        r.join(player);
        other.send({ type: 'queue', waiting: false });
        send({ type: 'queue', waiting: false });
        other.joinedRoom?.(r);
        room = r;
        break;
      }
      case 'cancelQuick':
        for (const [ex, p] of queue) if (p.id === player.id) queue.delete(ex);
        send({ type: 'queue', waiting: false });
        break;
      case 'top': {
        const top = store.top(50);
        send({ type: 'top', players: top.map((p) => ({ name: p.name, cups: p.cups, wins: p.wins, me: p.id === player!.id })) });
        break;
      }
      case 'join': {
        const target = rooms.get(String(msg.code).toUpperCase().trim());
        if (!target) {
          send({ type: 'error', message: 'Бой с таким кодом не найден' });
          return;
        }
        if (target === room) return;
        const error = target.has(player.id) ? null : target.join(player);
        if (error) {
          send({ type: 'error', message: error });
          return;
        }
        leaveRoom();
        room = target;
        break;
      }
      case 'ready':
        room?.ready(player.id);
        break;
      case 'rep':
        room?.rep(player.id);
        break;
      case 'leave':
        leaveRoom();
        break;
    }
  });

  ws.on('close', () => {
    leaveRoom();
    if (!player) return;
    for (const [ex, p] of queue) if (p === player) queue.delete(ex);
    if (online.get(player.id) === player) online.delete(player.id);
  });
});

// Обрываем соединения, которые перестали отвечать (телефон ушёл в сон, пропала сеть).
setInterval(() => {
  for (const ws of wss.clients as Set<WebSocket & { alive?: boolean }>) {
    if (!ws.alive) ws.terminate();
    ws.alive = false;
    ws.ping();
  }
}, 30_000);

http.listen(PORT, () => console.log(`fit-arena server on :${PORT}, guests ${ALLOW_GUESTS ? 'allowed' : 'off'}`));
loadBotUsername();

for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    store.flush();
    process.exit(0);
  });
