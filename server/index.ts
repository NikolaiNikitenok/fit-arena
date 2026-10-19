// Сервер матчей Fit Arena: комнаты на двоих и бой по WebSocket.
//   PORT — порт (по умолчанию 8787)
//   BOT_TOKEN — токен бота: проверяем подпись Telegram и узнаём имя бота для ссылок
//   ALLOW_GUESTS=1 — пускать без подписи Telegram (для разработки в браузере)
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ClientMessage, ServerMessage } from '../shared/protocol';
import { EXERCISE_LABELS, type Exercise } from '../src/repCounter';
import { makeCode, Room, type Player } from './rooms';
import { verifyInitData } from './telegramAuth';

const PORT = Number(process.env.PORT ?? 8787);
const BOT_TOKEN = process.env.BOT_TOKEN ?? '';
const ALLOW_GUESTS = process.env.ALLOW_GUESTS === '1' || !BOT_TOKEN;

const rooms = new Map<string, Room>();
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
        ? { id: `tg:${tgUser.id}`, name: cleanName(tgUser.first_name), send }
        : { id: `guest:${randomUUID()}`, name: cleanName(msg.name), send };
      send({ type: 'welcome', id: player.id, name: player.name, botUsername });
      return;
    }
    if (!player) return;

    switch (msg.type) {
      case 'create': {
        if (!(msg.exercise in EXERCISE_LABELS)) return;
        leaveRoom();
        let code = makeCode();
        while (rooms.has(code)) code = makeCode();
        room = new Room(code, msg.exercise as Exercise);
        rooms.set(code, room);
        room.join(player);
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

  ws.on('close', leaveRoom);
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
