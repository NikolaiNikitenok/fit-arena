// Сервер матчей Fit Arena: комнаты на двоих и бой по WebSocket.
//   PORT — порт (по умолчанию 8787)
//   BOT_TOKEN — токен бота: проверяем подпись Telegram и узнаём имя бота для ссылок
//   APP_URL — адрес мини-приложения для кнопок бота (по умолчанию https://arena.nikitenok.ru)
//   BOT_USERNAME — имя бота для ссылок-приглашений, если Telegram недоступен с сервера
//   ALLOW_GUESTS=1 — пускать без подписи Telegram (для разработки в браузере)
//   DATA_FILE — где хранить профили и кубки (по умолчанию ./data/profiles.json)
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import type { ClientMessage, ProfileView, ServerMessage } from '../shared/protocol';
import { EXERCISE_LABELS, type Exercise } from '../src/repCounter';
import { makeCode, type MatchEnd, Room, type Player } from './rooms';
import { type Profile, Store } from './store';
import { type Clan, ClanStore, type Who } from './clans';
import { runBot } from './bot';
import { verifyInitData } from './telegramAuth';

const PORT = Number(process.env.PORT ?? 8787);
const BOT_TOKEN = process.env.BOT_TOKEN ?? '';
const ALLOW_GUESTS = process.env.ALLOW_GUESTS === '1' || !BOT_TOKEN;

const store = new Store(process.env.DATA_FILE ?? 'data/profiles.json');
const clans = new ClanStore(process.env.CLANS_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'clans.json'));
// Соединения экрана клана: у игрока может быть открыто несколько.
const clanSockets = new Map<string, Set<(msg: ServerMessage) => void>>();
const isOnline = (id: string) => (clanSockets.get(id)?.size ?? 0) > 0 || online.has(id);

/** Каждому участнику — его вид клана (роль, «я»). */
function sendClan(clan: Clan): void {
  const now = Date.now();
  for (const m of clan.members) for (const send of clanSockets.get(m.id) ?? []) send({ type: 'clan', clan: clans.view(clan, m.id, isOnline, now) });
}
function toClan(clan: Clan, msg: ServerMessage): void {
  for (const m of clan.members) for (const send of clanSockets.get(m.id) ?? []) send(msg);
}
// Здоровье босса рассылаем не чаще трёх раз в секунду, даже если бьют все сразу.
const raidPending = new Map<string, ReturnType<typeof setTimeout>>();
function sendRaid(clan: Clan): void {
  if (raidPending.has(clan.id)) return;
  raidPending.set(
    clan.id,
    setTimeout(() => {
      raidPending.delete(clan.id);
      const now = Date.now();
      for (const m of clan.members) for (const send of clanSockets.get(m.id) ?? []) send({ type: 'raid', raid: clans.raidView(clan, m.id, now) });
    }, 300),
  );
}
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
let botUsername: string | null = process.env.BOT_USERNAME?.replace(/^@/, '') || null;

async function loadBotUsername(): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    const body = (await res.json()) as { ok: boolean; result?: { username: string } };
    botUsername = body.result?.username ?? botUsername;
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

/** Сообщения экрана клана. Ошибки возвращаются строкой и показываются игроку. */
function onClanMessage(msg: ClientMessage, who: Who, send: (m: ServerMessage) => void): void {
  const now = Date.now();
  const fail = (r: unknown): r is string => {
    if (typeof r !== 'string') return false;
    send({ type: 'clanError', message: r });
    return true;
  };
  const mine = () => clans.clanOf(who.id);
  switch (msg.type) {
    case 'clanMine': {
      const c = mine();
      send({ type: 'clan', clan: c ? clans.view(c, who.id, isOnline, now) : null });
      if (c) send({ type: 'chat', messages: c.chat });
      break;
    }
    case 'clanSearch':
      send({ type: 'clanList', clans: clans.search(String(msg.q ?? '')) });
      break;
    case 'clanCreate': {
      const r = clans.create(who, msg.clan, now);
      if (fail(r)) return;
      sendClan(r);
      send({ type: 'chat', messages: r.chat });
      break;
    }
    case 'clanJoin': {
      const r = clans.join(who, { id: msg.id, code: msg.code }, now);
      if (fail(r)) return;
      sendClan(r);
      toClan(r, { type: 'chatMsg', message: r.chat[r.chat.length - 1] });
      send({ type: 'chat', messages: r.chat });
      break;
    }
    case 'clanLeave': {
      const r = clans.leave(who.id, now);
      send({ type: 'clan', clan: null });
      if (r) {
        sendClan(r);
        toClan(r, { type: 'chatMsg', message: r.chat[r.chat.length - 1] });
      }
      break;
    }
    case 'clanUpdate': {
      const r = clans.update(who.id, msg.clan);
      if (!fail(r)) sendClan(r);
      break;
    }
    case 'clanRole': {
      if (!['leader', 'officer', 'member'].includes(msg.role)) return;
      const r = clans.setRole(who.id, String(msg.id), msg.role, now);
      if (fail(r)) return;
      sendClan(r);
      toClan(r, { type: 'chat', messages: r.chat });
      break;
    }
    case 'clanKick': {
      const target = String(msg.id);
      const r = clans.kick(who.id, target, now);
      if (fail(r)) return;
      for (const s of clanSockets.get(target) ?? []) s({ type: 'clan', clan: null });
      sendClan(r);
      toClan(r, { type: 'chatMsg', message: r.chat[r.chat.length - 1] });
      break;
    }
    case 'chatSend': {
      const r = clans.chat(who.id, String(msg.text ?? ''), now);
      if (fail(r)) return;
      toClan(mine()!, { type: 'chatMsg', message: r });
      break;
    }
    case 'raidStart': {
      const r = clans.raidStart(who.id, now);
      if (fail(r)) return;
      send({ type: 'raidAttack', ...r });
      sendRaid(mine()!);
      break;
    }
    case 'raidHit': {
      const c = mine();
      const lastMsg = c?.nextMsg;
      const r = clans.raidHit(who.id, String(msg.attackId), Number(msg.damage), now);
      if (typeof r === 'string') return;
      sendRaid(r.clan);
      // Босс повержен или клан вырос в уровне: всем новый клан и сообщения.
      if (r.killed || r.clan.nextMsg !== lastMsg) {
        toClan(r.clan, { type: 'chat', messages: r.clan.chat });
        sendClan(r.clan);
      }
      break;
    }
    case 'clanReps': {
      const c = mine();
      const lastMsg = c?.nextMsg;
      const level = c && clans.level(c);
      const r = clans.reps(who.id, Number(msg.reps), now);
      if (!r) return;
      if (r.nextMsg !== lastMsg) toClan(r, { type: 'chat', messages: r.chat });
      if (clans.level(r) !== level || r.nextMsg !== lastMsg) sendClan(r);
      else send({ type: 'clan', clan: clans.view(r, who.id, isOnline, now) });
      break;
    }
    case 'raidEnd':
      clans.raidEnd(String(msg.attackId));
      break;
  }
}

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', (ws: WebSocket & { alive?: boolean }) => {
  let player: Player | null = null;
  let clanChannel = false;
  let who: Who | null = null;
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
      send({ type: 'welcome', id: player.id, name: player.name, botUsername, botRunning: !!BOT_TOKEN, telegram: !!tgUser });
      if (msg.channel === 'clan') {
        // Когда сервер знает токен бота, в кланах только настоящие игроки Telegram: гости из браузера каждый раз новые.
        if (BOT_TOKEN && !tgUser) {
          send({ type: 'clan', clan: null });
          return;
        }
        clanChannel = true;
        who = { id: player.id, name: player.name, level: Math.max(1, Math.min(999, Math.round(Number(msg.level) || 1))) };
        if (!clanSockets.has(player.id)) clanSockets.set(player.id, new Set());
        clanSockets.get(player.id)!.add(send);
        clans.touch(who);
        const mine = clans.clanOf(player.id);
        send({ type: 'clan', clan: mine ? clans.view(mine, player.id, isOnline, Date.now()) : null });
        if (mine) send({ type: 'chat', messages: mine.chat });
        return;
      }
      online.set(player.id, player);
      send({ type: 'profile', profile: profileView(store.get(player.id, player.name)) });
      return;
    }
    if (!player) return;
    if (clanChannel && who) return onClanMessage(msg, who, send);

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
    if (clanChannel) {
      clanSockets.get(player.id)?.delete(send);
      if (!clanSockets.get(player.id)?.size) clanSockets.delete(player.id);
      return;
    }
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
if (BOT_TOKEN)
  runBot(BOT_TOKEN, process.env.APP_URL ?? 'https://arena.nikitenok.ru', (code) => {
    const c = clans.byCode(code);
    return c && { name: c.name, tag: c.tag, members: c.members.length };
  });
loadBotUsername();

for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    store.flush();
    clans.flush();
    process.exit(0);
  });
