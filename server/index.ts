// Сервер матчей NikitenokArena: комнаты на двоих и бой по WebSocket.
//   PORT — порт (по умолчанию 8787)
//   BOT_TOKEN — токен бота: проверяем подпись Telegram и узнаём имя бота для ссылок
//   BOT_TOKEN_FILE — файл с токеном, он главнее BOT_TOKEN (по умолчанию .bot-token рядом с сервером;
//     его кладёт автодеплой из секрета репозитория BOT_TOKEN)
//   APP_URL — адрес мини-приложения для кнопок бота (по умолчанию https://arena.nikitenok.ru)
//   BOT_USERNAME — имя бота для ссылок-приглашений, если Telegram недоступен с сервера
//   ALLOW_GUESTS=1 — пускать без подписи Telegram (для разработки в браузере)
//   DATA_FILE — где хранить профили и кубки (по умолчанию ./data/profiles.json)
//   FAMILY_WEBHOOK_URL, FAMILY_WEBHOOK_SECRET — отчёты о тренировках на семейный сайт (server/family.ts)
//   PRO_IDS — id в Telegram с Pro Pass через запятую; ещё можно файлом .pro-ids рядом с сервером (PRO_FILE)
//   GUARD_FILE — защита от читов: забранные награды и подозрения (по умолчанию guard.json рядом с DATA_FILE, server/guard.ts)
//   ADMIN_IDS — id админов (статистика, сводка и тревоги в боте); ещё файлом .admin-ids (ADMIN_FILE)
//   TELEMETRY_FILE — ошибки и анонимная статистика (по умолчанию data/telemetry.json)
//   VILLAGES_FILE — деревни для набегов, кубки, щиты и набеги за неделю (по умолчанию villages.json рядом с DATA_FILE, server/villages.ts)
//   MAX_BOT_TOKEN (или файл .max-token), MAX_CA_FILE — бот и мини-приложение в Max (server/maxBot.ts)
//   ACCOUNTS_FILE — какие входы (Telegram, потом Max и браузер) ведут в один аккаунт (server/accounts.ts)
//   MODERATION_FILE, REPORTS_FILE — чёрный список, запреты писать и жалобы (server/moderation.ts, server/reports.ts); о жалобах бот пишет ADMIN_IDS
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import type { ClientMessage, ProfileView, ServerMessage } from '../shared/protocol';
import { leagueOf } from '../shared/rating';
import { EXERCISE_LABELS, goalText, isRepExercise, type Exercise } from '../src/repCounter';
import { Family, parseClientItem, parseGymItem, RateLimit, telegramId } from './family';
import { makeCode, type MatchEnd, Room, type Player } from './rooms';
import { type Profile, Store } from './store';
import { type Clan, ClanStore, type Who } from './clans';
import { botApi, botStatus, botUploadFiles, currentAgent, runBot, TG_PROXY, type Update, webhookReply, webhookSecret } from './bot';
import { dueReminders, SaveStore } from './saves';
import { raidNotices, type RaidNotice } from './raidNotices';
import { warNotices } from './warNotices';
import { opponent, warTick } from './wars';
import { dailyTask, npcName } from '../src/game/daily';
import { DEFAULT_BASELINE } from '../src/game/levels';
import { verifyInitData } from './telegramAuth';
import { ProList } from './pro';
import type { ChatMessage } from '../shared/clan';
import { FriendStore } from './friends';
import { type FriendsDeps, friendsApi } from './friendsApi';
import { Guard } from './guard';
import { clanPerks } from '../shared/clanLevel';
import { heroPower } from '../src/game/power';
import type { Progress } from '../src/game/progress';
import { handleTelemetry, Telemetry } from './telemetry';
import { AdminList, adminToken, checkAdminToken } from './admin';
import { statsHtml } from './statsPage';
import { deletePlayer } from './deleteMe';
import { alertText, FEEDBACK_THANKS, feedbackLimit, feedbackText } from './adminBot';
import { ModerationStore } from './moderation';
import { ReportStore } from './reports';
import { adminCommand, type ModerationDeps, moderationApi } from './moderationApi';
import { badName } from '../shared/profanity';
import { VillageStore } from './villages';
import { villageApi } from './villageApi';
import { Channel, type ChannelDeps } from './channel';
import { PersonalChannel } from './personalChannel';
import { mediaDir } from './channelMedia';
import { runClaudeCode } from './claudeCode';
import { AccountStore } from './accounts';
import { type AccountDeps, accountApi } from './accountApi';
import { Reels } from './reels';
import { MAX_TOKEN, maxSend, maxStatus, maxUsername, maxWebhookSecret, type MaxUpdate, onMaxUpdate, startMaxBot } from './maxBot';

const PORT = Number(process.env.PORT ?? 8787);
const readToken = (file: string) => {
  try {
    return readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
};
const TOKEN_FILE = process.env.BOT_TOKEN_FILE ?? join(__dirname, '.bot-token');
// Файл из автодеплоя свежее, чем строка в /etc/arena-server.env, поэтому он главнее.
const FILE_TOKEN = readToken(TOKEN_FILE);
const TOKEN_SOURCE = FILE_TOKEN ? 'file' : process.env.BOT_TOKEN ? 'env' : 'none';
const BOT_TOKEN = FILE_TOKEN || process.env.BOT_TOKEN || '';
const ALLOW_GUESTS = process.env.ALLOW_GUESTS === '1' || !BOT_TOKEN;

const family = new Family();
const activityLimit = new RateLimit();
const store = new Store(process.env.DATA_FILE ?? 'data/profiles.json');
const saves = new SaveStore(process.env.SAVES_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'saves.json'));
const clans = new ClanStore(process.env.CLANS_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'clans.json'));
const friends = new FriendStore(process.env.FRIENDS_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'friends.json'));
const pro = new ProList(process.env.PRO_FILE ?? join(__dirname, '.pro-ids'), process.env.PRO_IDS);
// Единый аккаунт: вход tg:123 → аккаунт, под которым лежит всё остальное (server/accounts.ts).
const accounts = new AccountStore(process.env.ACCOUNTS_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'accounts.json'));
// Pro и админ выдаются по id в Telegram: годится любой вход аккаунта.
const isPro = (id: string) => pro.has(id) || accounts.logins(id).some((l) => pro.has(l));
/** Игрок вошёл через мессенджер (не гость из браузера): ему рейтинг, кланы и набеги. */
const signedId = (id: string) => !id.startsWith('guest:');
const telemetry = new Telemetry(process.env.TELEMETRY_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'telemetry.json'));
const admins = new AdminList(process.env.ADMIN_FILE ?? join(__dirname, '.admin-ids'), process.env.ADMIN_IDS);
const isAdminAccount = (id: string) => admins.has(id) || accounts.logins(id).some((l) => admins.has(l));
clans.isPro = isPro;
// Защита от читов (server/guard.ts): забранные награды, атаки по игроку, темп, подозрения.
const guard = new Guard(process.env.GUARD_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'guard.json'));
clans.guard = guard;
saves.onClip = (id, xp, cap) => guard.flag(id, 'heroXp', `${xp} > ${cap}`, Date.now());
// Урон за повтор в рейде — не больше силы героя: уровень из проверенного опыта, вещи из копии прогресса,
// эликсир силы считаем выпитым, плюс 10% запаса на копию, отставшую на секунду.
clans.maxDamage = (id, c) => {
  const p = saves.get(id)?.progress as Progress | null | undefined;
  const xp = saves.publicXp(id);
  if (!p || xp === null) return null;
  const hero = heroPower({ ...p, days: { all: xp }, stars: {}, programs: undefined } as Progress, true);
  return Math.ceil(hero.damage * (1 + clanPerks(clans.level(c)).raidDamage) * 1.1) + 2;
};
/** Общий топ: без игроков под подозрением (себя игрок видит) и, когда есть бот, только игроки Telegram. */
const publicTop = (me?: string) => {
  const now = Date.now();
  return store
    .top(Infinity)
    .filter((p) => p.id === me || ((!BOT_TOKEN || signedId(p.id)) && !guard.flagged(p.id, now)))
    .slice(0, 50);
};
// Модерация (server/moderation.ts, server/reports.ts): чёрный список, запреты писать в чат и жалобы.
const mod = new ModerationStore(process.env.MODERATION_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'moderation.json'));
const reports = new ReportStore(process.env.REPORTS_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'reports.json'));
clans.mutedUntil = (id) => mod.mutedUntil(id);
clans.hiddenFor = (id) => mod.blockedBy(id).map((b) => b.id);
friends.blocked = (a, b) => mod.either(a, b);
// Набеги на деревни (server/villages.ts): снимки деревень из копий прогресса, поиск соперника, бой на сервере.
const villages = new VillageStore(process.env.VILLAGES_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'villages.json'), {
  blocked: (a, b) => mod.either(a, b),
  eligible: (id) => !BOT_TOKEN || signedId(id),
  heroLevel: (id) => saves.heroLevel(id),
  flag: (id, kind, detail) => guard.flag(id, kind, detail, Date.now()),
  claim: (id, key) => guard.claim(id, key),
  hidden: (id) => guard.flagged(id, Date.now()),
  botBlocked: (id) => !!saves.get(id)?.blocked,
});
// Отметка Pro у автора ставится при отправке: список мог поменяться после сообщения.
const proChat = (m: ChatMessage): ChatMessage => (m.from && isPro(m.from) ? { ...m, pro: true } : m);
const chatOf = (c: Clan) => c.chat.map(proChat);
// Соединения экрана клана: у игрока может быть открыто несколько.
const clanSockets = new Map<string, Set<(msg: ServerMessage) => void>>();
const isOnline = (id: string) => (clanSockets.get(id)?.size ?? 0) > 0 || online.has(id);

/** Каждому участнику — его вид клана (роль, «я»). */
function sendClan(clan: Clan): void {
  const now = Date.now();
  for (const m of clan.members) for (const send of clanSockets.get(m.id) ?? []) send({ type: 'clan', clan: clans.view(clan, m.id, isOnline, now) });
}
// Счёт войны: свой клан и соперника обновляем не чаще раза в две секунды.
const warPending = new Map<string, ReturnType<typeof setTimeout>>();
function sendWar(clan: Clan): void {
  for (const c of [clan, opponent(clans, clan)]) {
    if (!c || warPending.has(c.id)) continue;
    const id = c.id;
    warPending.set(
      id,
      setTimeout(() => {
        warPending.delete(id);
        const fresh = clans.get(id);
        if (fresh) sendClan(fresh);
      }, 2000),
    );
  }
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
  // Кубки — только за бой двух игроков Telegram (гостя можно завести сколько угодно и «сливать» ему бои)
  // и не больше DUEL_PAIR_PER_DAY боёв одной пары в день.
  const rated = (!BOT_TOKEN || (signedId(a.id) && signedId(b.id))) && guard.ratedPair(a.id, b.id, Date.now());
  const delta = rated ? store.result(pa, pb, end.outcome) : { a: 0, b: 0 };
  a.send({ type: 'profile', profile: profileView(pa), delta: delta.a });
  b.send({ type: 'profile', profile: profileView(pb), delta: delta.b });
  reportDuel(pa, end.reps.a, end.outcome === 'draw' ? null : end.outcome === 'a', end.exercise);
  reportDuel(pb, end.reps.b, end.outcome === 'draw' ? null : end.outcome === 'b', end.exercise);
}

function reportDuel(p: Profile, reps: number, won: boolean | null, exercise: Exercise): void {
  const tgId = accounts.tgChat(p.id) ?? telegramId(p.id);
  if (tgId === null) return;
  family.report({ telegram_id: tgId, kind: 'duel', exercise, reps, won, cups: p.cups, league: leagueOf(p.cups).name });
}

/** POST /api/activity — клиент сообщает о тренировке вне дуэли: { initData, items: [{ id, kind, exercise, reps }] }
 *  или о тренировке в зале из дневника: { initData, gym: { id, title, minutes, volume_kg, records, exercises } }. */
function handleActivity(req: IncomingMessage, res: ServerResponse): void {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 16 * 1024) req.destroy();
  });
  req.on('end', () => {
    const reply = (status: number) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: status === 200 }));
    let msg: { initData?: unknown; items?: unknown; gym?: unknown };
    try {
      msg = JSON.parse(body);
    } catch {
      return reply(400);
    }
    const tgUser = BOT_TOKEN && typeof msg.initData === 'string' ? verifyInitData(msg.initData, BOT_TOKEN) : null;
    if (!tgUser) return reply(403);
    if (msg.gym !== undefined) {
      const gym = parseGymItem(msg.gym);
      if (!gym) return reply(400);
      if (!activityLimit.take(tgUser.id)) return reply(429);
      family.report({ ...gym, kind: 'gym', telegram_id: tgUser.id });
      return reply(200);
    }
    const items = Array.isArray(msg.items) ? msg.items.slice(0, 3).map(parseClientItem) : [];
    if (!items.length || items.some((i) => !i)) return reply(400);
    if (!activityLimit.take(tgUser.id)) return reply(429);
    for (const item of items) if (item) family.report({ ...item, telegram_id: tgUser.id });
    reply(200);
  });
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
    const body = (await botApi(BOT_TOKEN)('getMe', {}, 15_000)) as { ok: boolean; result?: { username: string }; description?: string };
    if (!body.ok) botStatus.lastError = `getMe: ${body.description ?? 'ошибка'}`;
    botUsername = body.result?.username ?? botUsername;
    console.log('bot:', botUsername);
  } catch (e) {
    botStatus.lastError = `getMe: ${e instanceof Error ? e.message : e}`;
    console.error('getMe failed:', botStatus.lastError);
  }
}

function cleanName(name: unknown): string {
  const s = typeof name === 'string' ? name.replace(/[\u0000-\u001f]/g, '').trim() : '';
  // Имя из Telegram с матом в клане и у друзей не показываем.
  return (badName(s) ? '' : s.slice(0, 24)) || 'Боец';
}

/** Вход по подписи мессенджера: 'tg:123' и имя оттуда. Max и браузер добавятся сюда же. */
// Подпись у Telegram и Max устроена одинаково, ключи разные: подпись одного мессенджера другим не проверится.
function loginOf(body: { initData?: unknown }): { login: string; name: string } | null {
  if (typeof body.initData !== 'string' || !body.initData) return null;
  const tgUser = BOT_TOKEN ? verifyInitData(body.initData, BOT_TOKEN) : null;
  if (tgUser) return { login: `tg:${tgUser.id}`, name: cleanName(tgUser.first_name) };
  const maxUser = MAX_TOKEN ? verifyInitData(body.initData, MAX_TOKEN) : null;
  return maxUser ? { login: `max:${maxUser.id}`, name: cleanName(maxUser.first_name) } : null;
}

/** Игрок по подписи: его аккаунт (server/accounts.ts), вход и имя. */
function signedIn(body: { initData?: unknown }): { id: string; login: string; name: string } | null {
  const l = loginOf(body);
  return l && { ...l, id: accounts.seen(l.login) };
}

/** Кто прислал запрос: игрок по подписи или гость по id из браузера. */
function identify(body: { initData?: unknown; guestId?: unknown }): { id: string; login?: string; guest?: string } | null {
  const me = signedIn(body);
  const guest = typeof body.guestId === 'string' && /^[\w-]{8,40}$/.test(body.guestId) ? `guest:${body.guestId}` : undefined;
  if (me) return { id: me.id, login: me.login, guest };
  return ALLOW_GUESTS && guest ? { id: guest } : null;
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 300_000) req.destroy();
      else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/** Имя деревни для соперников: из подписи Telegram, у гостя — из друзей (без него — «Соседняя деревня»). */
function villageName(id: string, body: Record<string, unknown>): string | undefined {
  return loginOf(body)?.name ?? friends.get(id)?.name;
}

/** Может ли бот сейчас написать игроку: мессенджер, куда пойдут напоминания, отвечает серверу. */
const botReady = (id: string) => {
  const t = accounts.target(id);
  if (t?.platform === 'max') return !!MAX_TOKEN && maxStatus.lastOkAt != null;
  return !!BOT_TOKEN && botStatus.lastOkAt != null;
};

/** Прогресс и напоминания: POST /api/progress/load, /api/progress/save, /api/remind, /api/raid-notify. */
async function onProgressApi(path: string, req: IncomingMessage, res: ServerResponse) {
  const reply = (code: number, body: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  const body = await readJson(req).catch(() => null);
  const who = body && identify(body);
  if (!who) return reply(401, { error: 'Открой приложение из Telegram' });
  if (path === '/api/progress/load') {
    if (who.guest) {
      saves.adopt(who.id, who.guest);
      villages.adopt(who.id, who.guest);
    }
    const s = saves.get(who.id);
    if (s?.progress && !villages.get(who.id)) villages.update(who.id, s.progress, villageName(who.id, body!));
    return reply(200, { progress: s?.progress ?? null, remind: s?.remind ?? null, bot: botReady(who.id), telegram: accounts.target(who.id) !== null, maxBot: maxUsername(), pro: isPro(who.id), raidNotify: !s?.raidOff, admin: isAdminAccount(who.id), account: who.id, linkable: !!who.login });
  }
  if (path === '/api/progress/save') {
    // Копия от героя, которого на этом входе уже нет (вход привязали к другому аккаунту): не принимаем, телефон перезагрузит прогресс.
    if (typeof body!.account === 'string' && body!.account !== who.id) return reply(409, { error: 'account changed', account: who.id });
    const s = saves.put(who.id, body!.progress);
    // Копия принята: обновляем снимок деревни для набегов (невозможный снимок отклоняется и отмечается).
    if (s.progress === body!.progress) villages.update(who.id, s.progress, villageName(who.id, body!));
    return reply(200, { savedAt: s.savedAt });
  }
  if (path === '/api/remind') {
    const r = body!.remind as { hour: number; tz: number } | null;
    return reply(200, { remind: saves.setRemind(who.id, r && { hour: Number(r.hour), tz: Number(r.tz) }).remind ?? null });
  }
  if (path === '/api/raid-notify') return reply(200, { raidNotify: !saves.setRaidNotify(who.id, body!.on !== false).raidOff });
  reply(404, { error: 'not found' });
}

const APP_URL = process.env.APP_URL ?? 'https://arena.nikitenok.ru';
// Автопостинг в канал (server/channel.ts): подписка Claude через Claude Code или ключ API — файлы рядом с сервером из секретов репозитория.
const ANTHROPIC_KEY_FILE = process.env.ANTHROPIC_KEY_FILE ?? join(__dirname, '.anthropic-key');
const CLAUDE_TOKEN_FILE = process.env.CLAUDE_TOKEN_FILE ?? join(__dirname, '.claude-token');
const CHANNEL_ID = process.env.CHANNEL_ID ?? '@NikitenokArena';
const channelDeps: ChannelDeps = {
  // Файл читаем каждый раз: ключ можно положить без перезапуска.
  apiKey: () => process.env.ANTHROPIC_API_KEY || readToken(ANTHROPIC_KEY_FILE),
  // Подписка: токен из `claude setup-token` (секрет CLAUDE_CODE_OAUTH_TOKEN → .claude-token).
  claudeToken: () => process.env.CLAUDE_CODE_OAUTH_TOKEN || readToken(CLAUDE_TOKEN_FILE),
  claudeCode: (system, prompt) =>
    runClaudeCode({ token: process.env.CLAUDE_CODE_OAUTH_TOKEN || readToken(CLAUDE_TOKEN_FILE), system, prompt, proxy: TG_PROXY, dir: join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'claude-code') }),
  channel: CHANNEL_ID,
  agent: currentAgent,
  changelog: () => readToken(join(__dirname, 'changelog.txt')),
  bot: (method, body) => botApi(BOT_TOKEN)(method, body, 30_000),
  upload: (method, fields, files) => botUploadFiles(BOT_TOKEN, method, fields, files),
  mediaDir: mediaDir(__dirname),
  appLink: () => `https://t.me/${botUsername ?? 'ArenaNikitenokBot'}`,
  log: (m) => console.log(m),
};
const channel = new Channel(process.env.CHANNEL_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'channel.json'), channelDeps);
// Личный канал автора: черновик раз в день, публикация только по кнопке админа.
const PERSONAL_CHANNEL = process.env.PERSONAL_CHANNEL ?? '@nikitenokN';
const personal = new PersonalChannel(process.env.PERSONAL_CHANNEL_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'personal-channel.json'), {
  ...channelDeps,
  channel: PERSONAL_CHANNEL,
  approvers: () => admins.ids().map(Number),
  stats: () => telemetry.summaryText(),
  ignoreText: (t) => t.trim() in ADMIN_BUTTONS,
});
// Рилсы для Instagram: кнопка запускает сборку в GitHub Actions (server/reels.ts), токен — секрет GH_ACTIONS_TOKEN → .gh-token.
const reels = new Reels(process.env.REELS_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'reels.json'), {
  token: () => process.env.GH_ACTIONS_TOKEN || readToken(join(__dirname, '.gh-token')),
});
/** Кнопки и ответы на черновики личного канала (опрос и вебхук). */
const channelUpdate = (u: Update): boolean =>
  PERSONAL_CHANNEL !== 'off' &&
  personal.onUpdate(
    u,
    (chatId, text) => void botApi(BOT_TOKEN)('sendMessage', { chat_id: chatId, text }, 15_000).catch(() => null),
    (id, text) => void botApi(BOT_TOKEN)('answerCallbackQuery', { callback_query_id: id, text }, 15_000).catch(() => null),
  );
/** Команды канала от админа: /channel, /channel_draft, /channel_post. */
// Клавиатура админа внизу чата: кнопка шлёт свой текст, его переводим в команду.
const ADMIN_BUTTONS: Record<string, string> = {
  '📊 Статус каналов': '/channel',
  '📝 Черновик Арены': '/channel_draft',
  '📣 Пост в Арену сейчас': '/channel_post',
  '✍️ Личный канал': '/channel_me',
  '🚩 Жалобы': '/reports',
  '🎬 Новый рилс': '/reel',
};
const ADMIN_KEYBOARD = {
  keyboard: [[{ text: '📊 Статус каналов' }], [{ text: '📝 Черновик Арены' }, { text: '📣 Пост в Арену сейчас' }], [{ text: '✍️ Личный канал' }, { text: '🚩 Жалобы' }], [{ text: '🎬 Новый рилс' }]],
  resize_keyboard: true,
  is_persistent: true,
};
/** Текст кнопки админа → команда; остальное как есть. */
const adminText = (chatId: number, text: string): string => (admins.has(`tg:${chatId}`) && ADMIN_BUTTONS[text.trim()]) || text;
const channelCommand = (chatId: number, raw: string): boolean => {
  const text = adminText(chatId, raw);
  if (!/^\/(channel|admin|reel\b)/.test(text.trim())) return false;
  const isAdmin = admins.has(`tg:${chatId}`);
  const reply = (t: string) => void botApi(BOT_TOKEN)('sendMessage', { chat_id: chatId, text: t, reply_markup: isAdmin ? ADMIN_KEYBOARD : undefined }, 15_000).catch((e: Error) => console.log(`channel reply: ${e.message}`));
  if (/^\/admin\b/.test(text.trim()) && isAdmin) return reply('Админ-меню внизу чата: статус каналов, черновики, пост сейчас, жалобы, новый рилс для Instagram. «✍️ Личный канал» спросит тему поста — ответь фразой.'), true;
  // Не админу отвечаем, а не молчим: так сразу видно, чей id добавить в .admin-ids.
  if (!admins.has(`tg:${chatId}`)) return reply(`Команды канала только для админов. Твой Telegram ID: ${chatId}. Его нужно добавить в /opt/arena-server/.admin-ids.`), true;
  if (/^\/channel\s*$/.test(text.trim())) return reply(`${channel.status()}\n\n${personal.status()}`), true;
  return reels.command(chatId, text, reply) || personal.command(chatId, text, reply) || channel.command(chatId, text, reply);
};
const clanInfo = (code: string) => {
  const c = clans.byCode(code);
  return c && { name: c.name, tag: c.tag, members: c.members.length };
};

// Друзья (server/friendsApi.ts): только игроки Telegram; без токена бота (разработка) — и гости.
/**
 * Сообщение игроку от бота туда, где он сейчас (server/accounts.ts: выбор в настройках или последний вход).
 * query — адрес в приложении для кнопки (?tab=clan, ?friend=…). Telegram ответил 403 — игрок остановил бота.
 */
async function notifyPlayer(to: string, text: string, button: string, query: string): Promise<{ status?: number; retryAfter?: number } | null> {
  const t = accounts.target(to);
  const url = `${APP_URL.replace(/\/$/, '')}/${query.replace(/^\//, '')}`;
  if (t?.platform === 'max') {
    if (!MAX_TOKEN) return null;
    const r = await maxSend(t.id, text, { text: button, url }).catch(() => null);
    return r && { status: r.status };
  }
  if (!BOT_TOKEN || !t) return null;
  const r = await botApi(BOT_TOKEN)('sendMessage', { chat_id: t.id, text, reply_markup: { inline_keyboard: [[{ text: button, web_app: { url } }]] } }, 15_000).catch(() => null);
  if (r?.error_code === 403) saves.setBlocked(to, true);
  return r && { status: r.ok ? 200 : r.error_code, retryAfter: r.parameters?.retry_after };
}
const sendFriendBot = (to: string, text: string, button: string, query: string) => void notifyPlayer(to, text, button, query);
const friendsDeps: FriendsDeps = {
  friends,
  now: Date.now,
  bot: () => ({ username: botUsername, running: !!BOT_TOKEN }),
  cups: (id) => store.cupsOf(id),
  progress: (id) => (saves.get(id)?.progress as ReturnType<FriendsDeps['progress']>) ?? null,
  heroLevel: (id) => saves.heroLevel(id),
  clanTag: (id) => clans.clanOf(id)?.tag,
  isPro,
  connected: isOnline,
  blocked: (id) => !!saves.get(id)?.blocked,
  createRoom: (exercise) => {
    const room = newRoom(exercise);
    // Никто так и не пришёл: пустую комнату вызова убираем, когда вызов истёк.
    setTimeout(() => {
      if (room.empty && rooms.get(room.code) === room) {
        room.dispose();
        rooms.delete(room.code);
      }
    }, 10 * 60_000 + 5_000).unref();
    return room.code;
  },
  roomAlive: (code) => !!rooms.get(code) && !rooms.get(code)!.empty,
  sendBot: sendFriendBot,
  tellDuel: (id, text) => online.get(id)?.send({ type: 'error', message: text }),
};
const moderationDeps: ModerationDeps = {
  mod,
  account: (login) => accounts.resolve(login),
  reports,
  isAdmin: isAdminAccount,
  nameOf: (id) => friends.get(id)?.name ?? clans.clanOf(id)?.members.find((m) => m.id === id)?.name,
  chatMessage: (me, msgId) => {
    const c = clans.clanOf(me);
    const m = c?.chat.find((x) => x.id === msgId && !x.system);
    return c && m && { from: m.from, name: m.name, text: m.text, clan: c.name };
  },
  unfriend: (me, other) => friends.remove(me, other),
  notifyAdmins: (text) => toAdmins(text),
  muted: (id) => {
    const c = clans.clanOf(id);
    if (c) sendClan(c);
  },
};
async function onFriendsApi(path: string, req: IncomingMessage, res: ServerResponse) {
  const reply = (code: number, body: unknown) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  const body = await readJson(req).catch(() => null);
  if (!body) return reply(400, { error: 'bad json' });
  const signed = signedIn(body);
  const guest = !BOT_TOKEN && typeof body.guestId === 'string' && /^[\w-]{8,40}$/.test(body.guestId) ? `guest:${body.guestId}` : null;
  const me = signed ? { id: signed.id, name: signed.name } : guest ? { id: guest, name: cleanName(body.name) } : null;
  if (!me) return reply(401, { error: 'Друзья — только в Telegram', telegram: false });
  // Модерация пускает так же, как друзья.
  const r = path.startsWith('/api/moderation') ? moderationApi(moderationDeps, path, me, body) : friendsApi(friendsDeps, path, me, body);
  reply(r.status, r.body);
}

/** Страница статистики: GET по подписанной ссылке (?t=…) или POST с initData. Ссылка — POST /api/admin/link. */
async function onAdminApi(path: string, req: IncomingMessage, res: ServerResponse) {
  const now = Date.now();
  const sign = (t: string) => telemetry.sign(t);
  const deny = () => res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Доступ только для админов NikitenokArena');
  let adminId: string | null = null;
  let inApp = false;
  if (req.method === 'GET') {
    const url = new URL(req.url ?? '/', 'http://x');
    adminId = checkAdminToken(sign, url.searchParams.get('t'), now, (id) => admins.has(id));
    inApp = url.searchParams.get('app') === '1';
  } else if (req.method === 'POST') {
    const body = await readJson(req).catch(() => null);
    const tgUser = BOT_TOKEN && typeof body?.initData === 'string' ? verifyInitData(body.initData, BOT_TOKEN) : null;
    adminId = tgUser && admins.has(`tg:${tgUser.id}`) ? String(tgUser.id) : null;
    if (adminId && path === '/api/admin/link') {
      return res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ url: `/api/admin/stats?t=${adminToken(sign, adminId, now)}&app=1` }));
    }
    inApp = true;
  }
  if (!adminId || path !== '/api/admin/stats') return deny();
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'",
  });
  res.end(statsHtml(telemetry.stats(30), { inApp }));
}

/** Набеги на деревни: POST /api/village/… (только игроки Telegram, без токена бота — и гости), GET /api/village/top. */
async function onVillageApi(path: string, req: IncomingMessage, res: ServerResponse) {
  const reply = (code: number, body: unknown) => res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
  if (req.method === 'GET' && path === '/api/village/top') {
    const r = villageApi(villages, path, null, {});
    return reply(r.status, r.body);
  }
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  const body = await readJson(req).catch(() => null);
  if (!body) return reply(400, { error: 'bad json' });
  const signed = signedIn(body);
  const guest = !BOT_TOKEN && typeof body.guestId === 'string' && /^[\w-]{8,40}$/.test(body.guestId) ? `guest:${body.guestId}` : null;
  const me = signed ? { id: signed.id, name: signed.name } : guest ? { id: guest, name: cleanName(body.name) } : null;
  const r = villageApi(villages, path, me, body);
  reply(r.status, r.body);
}

/** POST /api/delete-me: игрок стирает свои данные (кнопка в настройках). */
async function onDeleteMe(req: IncomingMessage, res: ServerResponse) {
  const reply = (code: number, body: unknown) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  const body = await readJson(req).catch(() => null);
  const who = body && identify(body);
  if (!who) return reply(401, { error: 'Открой приложение из Telegram' });
  const now = Date.now();
  accounts.forget(who.id);
  for (const id of [who.id, who.guest].filter((x): x is string => !!x)) {
    const { clan } = deletePlayer({ store, saves, clans, friends, telemetry, villages }, id, now);
    if (clan) {
      sendClan(clan);
      toClan(clan, { type: 'chat', messages: chatOf(clan) });
    }
    for (const s of clanSockets.get(id) ?? []) s({ type: 'clan', clan: null });
  }
  reply(200, { ok: true });
}

/** Убрать героя аккаунта, которого не выбрали при привязке: копия прогресса и кубки — в архив, остальное как «Удалить мои данные». */
function dropAccount(id: string): void {
  accounts.archiveOf({ account: id, logins: accounts.logins(id), progress: saves.get(id)?.progress ?? null, cups: store.cupsOf(id) });
  const { clan } = deletePlayer({ store, saves, clans, friends, telemetry, villages }, id, Date.now());
  if (clan) {
    sendClan(clan);
    toClan(clan, { type: 'chat', messages: chatOf(clan) });
  }
  for (const s of clanSockets.get(id) ?? []) s({ type: 'clan', clan: null });
}
const accountDeps: AccountDeps = {
  accounts,
  card: (id) => {
    const p = saves.get(id)?.progress as Partial<Progress> | null | undefined;
    const stages = Object.keys(p?.stars ?? {}).length;
    const reps = Object.keys(p?.days ?? {}).length;
    const cups = store.cupsOf(id);
    const clan = clans.clanOf(id)?.name;
    if (!stages && !reps && !cups && !clan) return null;
    return { level: saves.heroLevel(id) ?? 1, stages, cups, clan };
  },
  drop: dropAccount,
  progress: (id) => saves.get(id)?.progress ?? null,
};
/** Аккаунт и привязка входов: POST /api/account/… (только по подписи мессенджера, гостям — нет). */
async function onAccountApi(path: string, req: IncomingMessage, res: ServerResponse) {
  const reply = (code: number, body: unknown) => res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  const body = await readJson(req).catch(() => null);
  if (!body) return reply(400, { error: 'bad json' });
  const me = signedIn(body);
  if (!me) return reply(401, { error: 'Привязка доступна, когда ты вошёл через мессенджер' });
  const r = accountApi(accountDeps, path, me, body);
  reply(r.status, r.body);
}

/** Сообщение админам от бота. Токен бота в логи не пишем. */
const toAdmins = (text: string, link = false) => {
  if (!BOT_TOKEN) return;
  for (const id of admins.ids()) {
    const reply_markup = link ? { inline_keyboard: [[{ text: 'Открыть статистику', url: `${APP_URL.replace(/\/$/, '')}/api/admin/stats?t=${adminToken((t) => telemetry.sign(t), id, Date.now())}` }]] } : undefined;
    botApi(BOT_TOKEN)('sendMessage', { chat_id: Number(id), text, reply_markup }, 15_000).catch(() => null);
  }
};
/** Игрок написал боту не команду: пересылаем разработчику. */
const onPlayerText = (msg: NonNullable<Update['message']>): Record<string, unknown> | null => {
  if (!msg.text || msg.text.startsWith('/') || !admins.ids().length || admins.has(`tg:${msg.chat.id}`)) return null;
  const text = feedbackText(msg, Date.now());
  if (!text) return null;
  toAdmins(text);
  return { method: 'sendMessage', chat_id: msg.chat.id, text: FEEDBACK_THANKS };
};

const http = createServer((req, res) => {
  if (req.url === '/api/activity' && req.method === 'POST') {
    handleActivity(req, res);
    return;
  }
  const path = req.url?.split('?')[0] ?? '';
  if (path === '/api/tg' && req.method === 'POST') {
    if (!BOT_TOKEN || req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret(BOT_TOKEN)) return void res.writeHead(403).end();
    readJson(req)
      .then((update) => {
        botStatus.webhook = true;
        botStatus.webhookAt = Date.now();
        const chat = (update as unknown as Update).message?.chat;
        if (chat?.type === 'private') saves.setBlocked(accounts.resolve(`tg:${chat.id}`), false);
        const msg = (update as unknown as Update).message;
        if (channelUpdate(update as unknown as Update)) return void res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
        // Команды модерации от админа (/mute_…, /unmute_…, /reports).
        if (msg?.text && chat?.type === 'private' && channelCommand(chat.id, msg.text)) return void res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
        const admin = msg?.text && chat?.type === 'private' ? adminCommand(moderationDeps, chat.id, adminText(chat.id, msg.text)) : null;
        const answer = admin ? { method: 'sendMessage', chat_id: chat!.id, text: admin } : (webhookReply(update as unknown as Update, APP_URL, clanInfo) ?? (msg?.text && !msg.text.startsWith('/') ? onPlayerText(msg) : null));
        if (answer) botStatus.handled++;
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(answer ? JSON.stringify(answer) : '{}');
      })
      .catch(() => res.writeHead(400).end());
    return;
  }
  if (path.startsWith('/api/progress/') || path === '/api/remind' || path === '/api/raid-notify') {
    onProgressApi(path, req, res).catch(() => res.writeHead(500).end());
    return;
  }
  if (path === '/api/telemetry') return handleTelemetry(telemetry, req, res);
  if (path.startsWith('/api/village/')) {
    onVillageApi(path, req, res).catch(() => res.writeHead(500).end());
    return;
  }
  if (path === '/api/admin/stats' || path === '/api/admin/link') {
    onAdminApi(path, req, res).catch(() => res.writeHead(500).end());
    return;
  }
  if (path === '/api/max' && req.method === 'POST') {
    if (!MAX_TOKEN || req.headers['x-max-bot-api-secret'] !== maxWebhookSecret()) return void res.writeHead(403).end();
    // Max ждёт 200 не дольше 30 секунд: отвечаем сразу, сообщение игроку уходит отдельным запросом.
    readJson(req)
      .then((u) => {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
        return onMaxUpdate(u as MaxUpdate, {
          appUrl: APP_URL,
          clanByCode: clanInfo,
          onUser: (id) => saves.setBlocked(accounts.resolve(`max:${id}`), false),
          onText: (from, text) => {
            if (!feedbackLimit.take(`max:${from.id}`, Date.now())) return null;
            toAdmins(`✉️ Сообщение от игрока в Max ${[from.name, from.username && `@${from.username}`].filter(Boolean).join(' ')} (id max:${from.id}):\n\n${text.slice(0, 2000)}`);
            return FEEDBACK_THANKS;
          },
        });
      })
      .catch(() => (res.headersSent ? null : res.writeHead(400).end()));
    return;
  }
  if (path.startsWith('/api/account/')) {
    onAccountApi(path, req, res).catch(() => res.writeHead(500).end());
    return;
  }
  if (path === '/api/delete-me') {
    onDeleteMe(req, res).catch(() => res.writeHead(500).end());
    return;
  }
  if (path === '/api/friends' || path.startsWith('/api/friends/') || path === '/api/moderation' || path.startsWith('/api/moderation/')) {
    onFriendsApi(path, req, res).catch(() => res.writeHead(500).end());
    return;
  }
  if (req.url?.startsWith('/api/top')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(publicTop().map((p) => ({ name: p.name, cups: p.cups, wins: p.wins, pro: isPro(p.id) }))));
    return;
  }
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, bot: { token: TOKEN_SOURCE, username: botUsername, ...botStatus }, max: maxStatus }));
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
      if (c) send({ type: 'chat', messages: chatOf(c) });
      break;
    }
    case 'clanSearch':
      send({ type: 'clanList', clans: clans.search(String(msg.q ?? '')) });
      break;
    case 'clanCreate': {
      const r = clans.create(who, msg.clan, now);
      if (fail(r)) return;
      sendClan(r);
      send({ type: 'chat', messages: chatOf(r) });
      break;
    }
    case 'clanJoin': {
      const r = clans.join(who, { id: msg.id, code: msg.code }, now);
      if (fail(r)) return;
      sendClan(r);
      toClan(r, { type: 'chatMsg', message: proChat(r.chat[r.chat.length - 1]) });
      send({ type: 'chat', messages: chatOf(r) });
      break;
    }
    case 'clanLeave': {
      const r = clans.leave(who.id, now);
      send({ type: 'clan', clan: null });
      if (r) {
        sendClan(r);
        toClan(r, { type: 'chatMsg', message: proChat(r.chat[r.chat.length - 1]) });
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
      toClan(r, { type: 'chat', messages: chatOf(r) });
      break;
    }
    case 'clanKick': {
      const target = String(msg.id);
      const r = clans.kick(who.id, target, now);
      if (fail(r)) return;
      for (const s of clanSockets.get(target) ?? []) s({ type: 'clan', clan: null });
      sendClan(r);
      toClan(r, { type: 'chatMsg', message: proChat(r.chat[r.chat.length - 1]) });
      break;
    }
    case 'chatSend': {
      const r = clans.chat(who.id, String(msg.text ?? ''), now);
      if (fail(r)) return;
      toClan(mine()!, { type: 'chatMsg', message: proChat(r) });
      break;
    }
    case 'chatDelete': {
      const id = Number(msg.id);
      const r = clans.deleteMessage(who.id, id);
      if (!fail(r)) toClan(r, { type: 'chatDel', id });
      break;
    }
    case 'clanMute': {
      const r = clans.mute(who.id, String(msg.id), Number(msg.hours), now);
      if (fail(r)) return;
      sendClan(r);
      toClan(r, { type: 'chatMsg', message: r.chat[r.chat.length - 1] });
      break;
    }
    case 'raidStart': {
      const r = clans.raidStart(who.id, now, String(msg.exercise ?? ''));
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
      if (r.clan.war) sendWar(r.clan);
      // Босс повержен или клан вырос в уровне: всем новый клан и сообщения.
      if (r.killed || r.clan.nextMsg !== lastMsg) {
        toClan(r.clan, { type: 'chat', messages: chatOf(r.clan) });
        sendClan(r.clan);
      }
      break;
    }
    case 'clanReps': {
      const c = mine();
      const lastMsg = c?.nextMsg;
      const level = c && clans.level(c);
      // Не больше, чем можно сделать с прошлого отчёта (server/guard.ts).
      const reps = c ? guard.clanReps(who.id, Number(msg.reps), now) : 0;
      const r = clans.reps(who.id, reps, now, Number(msg.since) || now);
      if (!r) return;
      if (r.nextMsg !== lastMsg) toClan(r, { type: 'chat', messages: chatOf(r) });
      if (clans.level(r) !== level || r.nextMsg !== lastMsg) sendClan(r);
      else send({ type: 'clan', clan: clans.view(r, who.id, isOnline, now) });
      if (r.war) sendWar(r);
      break;
    }
    case 'clanWar': {
      const r = clans.setWar(who.id, msg.on === true);
      if (!fail(r)) sendClan(r);
      break;
    }
    case 'raidEnd':
      clans.raidEnd(String(msg.attackId));
      break;
    case 'clanClaim': {
      // Награду выдаёт телефон, но только после того, как сервер проверил право и отметил её выданной.
      const r = msg.kind === 'raid' ? clans.claimRaid(who.id, now) : msg.kind === 'war' ? clans.claimWar(who.id, now) : msg.kind === 'gift' ? clans.claimGift(who.id, msg.from) : 'Награда не найдена';
      if (fail(r)) return;
      send({ type: 'clanClaimed', claim: r });
      const c = mine();
      if (c) send({ type: 'clan', clan: clans.view(c, who.id, isOnline, now) });
      break;
    }
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
      const signed = signedIn({ initData: msg.initData });
      if (!signed && !ALLOW_GUESTS) {
        send({ type: 'error', message: 'Открой приложение из Telegram' });
        ws.close();
        return;
      }
      player = signed
        ? { id: signed.id, name: signed.name, send, joinedRoom: attach }
        : { id: `guest:${/^[\w-]{8,40}$/.test(msg.guestId ?? '') ? msg.guestId : randomUUID()}`, name: cleanName(msg.name), send, joinedRoom: attach };
      player.pro = isPro(player.id);
      // Раньше на этом телефоне играли гостем: клан и кубки переходят в аккаунт Telegram.
      if (signed && /^[\w-]{8,40}$/.test(msg.guestId ?? '')) {
        store.adopt(player.id, `guest:${msg.guestId}`);
        clans.adopt(player.id, `guest:${msg.guestId}`);
        guard.adopt(player.id, `guest:${msg.guestId}`);
        villages.adopt(player.id, `guest:${msg.guestId}`);
      }
      send({ type: 'welcome', id: player.id, name: player.name, botUsername, botRunning: !!BOT_TOKEN, telegram: !!signed, pro: !!player.pro });
      if (msg.channel === 'clan') {
        // Когда сервер знает токен бота, в кланах только настоящие игроки Telegram: гости из браузера каждый раз новые.
        if (BOT_TOKEN && !signed) {
          send({ type: 'clan', clan: null });
          return;
        }
        clanChannel = true;
        // Уровень героя видят в клане: не выше проверенного сервером по копии прогресса (+1 на копию, отставшую на секунду).
        const claimed = Math.max(1, Math.min(999, Math.round(Number(msg.level) || 1)));
        who = { id: player.id, name: player.name, level: Math.min(claimed, (saves.heroLevel(player.id) ?? 1) + 1) };
        if (!clanSockets.has(player.id)) clanSockets.set(player.id, new Set());
        clanSockets.get(player.id)!.add(send);
        clans.touch(who);
        const mine = clans.clanOf(player.id);
        send({ type: 'clan', clan: mine ? clans.view(mine, player.id, isOnline, Date.now()) : null });
        if (mine) send({ type: 'chat', messages: chatOf(mine) });
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
        // Дуэль только на повторы: планки на время здесь нет.
        if (!isRepExercise(msg.exercise)) return;
        leaveRoom();
        room = newRoom(msg.exercise as Exercise);
        room.join(player);
        break;
      }
      case 'quick': {
        if (!isRepExercise(msg.exercise)) return;
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
        const top = publicTop(player.id);
        send({ type: 'top', players: top.map((p) => ({ name: p.name, cups: p.cups, wins: p.wins, me: p.id === player!.id, pro: isPro(p.id) })) });
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
        friends.roomJoined(target.code, player.id);
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
// Напоминания: раз в несколько минут ищем тех, у кого наступил их час, а тренировки сегодня ещё не было.
// Пишет игрокам хотя бы один бот: Telegram или Max.
const ANY_BOT = !!(BOT_TOKEN || MAX_TOKEN);
if (ANY_BOT)
  setInterval(() => {
    for (const { save, date } of dueReminders(saves.all(), Date.now())) {
      if (!accounts.target(save.id)) continue;
      saves.markReminded(save.id, date);
      const p = save.progress as { baseline?: typeof DEFAULT_BASELINE; dailyDone?: string } | null;
      const task = dailyTask(date, { ...DEFAULT_BASELINE, ...p?.baseline });
      const text =
        p?.dailyDone === date
          ? 'Мастер Гром: «Сегодня ещё ни одного повтора. Пять минут — и день не потерян!»'
          : `${npcName(task.npc)}: «${task.ask}»\n\nЗадание дня: ${goalText(task.exercise, task.target)}. Награда: ${task.coins} монет.`;
      void notifyPlayer(save.id, text, 'Тренироваться', '').then((r) => {
        // Игрок остановил бота: больше не пишем.
        if (r?.status === 403) saves.setRemind(save.id, null);
      });
    }
  }, 5 * 60_000);
// Рейд клана: раз в минуту смотрим, кому пора написать (начало, напоминание, итог).
// Разосланное клан отмечает сразу, до отправки: после перезапуска повторов не будет.
// Шлём по одному, не больше 20 сообщений в секунду (у Telegram предел около 30).
let raidSending = false;
async function sendRaidNotices(list: RaidNotice[]): Promise<void> {
  for (const n of list) {
    if (saves.raidMuted(n.playerId) || !accounts.target(n.playerId)) continue;
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now();
      const r = await notifyPlayer(n.playerId, n.text, n.button, '?tab=clan');
      // Мессенджер просит подождать (429): ждём столько, сколько сказал, и пробуем ещё раз.
      const retry = r?.status === 429 ? (r.retryAfter ?? 1) : 0;
      await new Promise((res) => setTimeout(res, retry ? retry * 1000 : Math.max(0, 50 - (Date.now() - started))));
      if (!retry) break;
    }
  }
}
if (ANY_BOT)
  setInterval(() => {
    if (raidSending) return;
    const muted = (id: string) => saves.raidMuted(id);
    const list = [...raidNotices(clans.all(), Date.now(), muted), ...warNotices(clans, Date.now(), muted)];
    if (!list.length) return;
    for (const k of new Set(list.map((n) => `${n.clanId}|${n.key}|${n.kind}`))) {
      const [clan, key, kind] = k.split('|');
      clans.markNotice(clan, key, kind);
    }
    raidSending = true;
    sendRaidNotices(list).finally(() => (raidSending = false));
  }, 60_000);
// Войны кланов: пары в пятницу вечером и итоги в понедельник, раз в полминуты.
setInterval(() => {
  const changed = warTick(clans, Date.now());
  for (const c of changed) {
    sendClan(c);
    toClan(c, { type: 'chat', messages: chatOf(c) });
  }
}, 30_000);
// Несрочные сообщения о друзьях (заявки): раз в минуту, ночью копятся до утра.
if (ANY_BOT)
  setInterval(() => {
    for (const n of friends.takeNotices()) if (!saves.get(n.to)?.blocked) sendFriendBot(n.to, n.text, n.button, n.query);
  }, 60_000);
if (BOT_TOKEN)
  runBot(
    BOT_TOKEN,
    APP_URL,
    clanInfo,
    (chatId) => saves.setBlocked(accounts.resolve(`tg:${chatId}`), false),
    (msg) => {
      const thanks = onPlayerText(msg);
      if (thanks) botApi(BOT_TOKEN)('sendMessage', { chat_id: msg.chat.id, text: FEEDBACK_THANKS }, 15_000).catch(() => null);
    },
    (chatId, text) => (channelCommand(chatId, text) ? '' : adminCommand(moderationDeps, chatId, adminText(chatId, text))),
    channelUpdate,
  );
// Набеги на деревню: защитнику пишет бот (ночные ждут 9 утра), раз в минуту, с кнопкой «Отомстить».
if (ANY_BOT)
  setInterval(() => {
    for (const n of villages.takeNotices()) sendFriendBot(n.to, n.text, 'Отомстить', '?tab=village');
  }, 60_000);
// Админам: тревога о новой частой ошибке (раз в минуту) и сводка в 9:00 по Москве.
if (BOT_TOKEN)
  setInterval(() => {
    for (const a of telemetry.takeAlerts()) toAdmins(alertText(a), true);
    if (admins.ids().length && telemetry.summaryDue()) toAdmins(telemetry.summaryText(), true);
  }, 60_000);
// Канал: раз в минуту проверяем, не пора ли выпустить пост (10:00 и 19:00 по Москве).
if (BOT_TOKEN && CHANNEL_ID !== 'off') setInterval(() => channel.tick(), 60_000);
if (BOT_TOKEN && PERSONAL_CHANNEL !== 'off') setInterval(() => personal.tick(), 60_000);
// Меню команд канала — только в личке у админов, игроки видят обычные /start и /help.
const ADMIN_COMMANDS = [
  { command: 'start', description: 'Начать игру' },
  { command: 'help', description: 'Помощь и приватность' },
  { command: 'admin', description: 'Показать админ-клавиатуру' },
  { command: 'channel', description: 'Каналы: статус и ошибки' },
  { command: 'channel_draft', description: 'Черновик для @NikitenokArena (только тебе)' },
  { command: 'channel_post', description: 'Опубликовать пост в @NikitenokArena сейчас' },
  { command: 'channel_me', description: 'Черновик для личного канала с кнопками' },
  { command: 'reports', description: 'Жалобы игроков' },
  { command: 'reel', description: 'Новый рилс для Instagram (можно с темой)' },
];
const adminMenus = new Set<string>();
if (BOT_TOKEN)
  setInterval(() => {
    for (const id of admins.ids())
      if (!adminMenus.has(id))
        botApi(BOT_TOKEN)('setMyCommands', { commands: ADMIN_COMMANDS, scope: { type: 'chat', chat_id: Number(id) } }, 15_000)
          .then((r) => r.ok && adminMenus.add(id))
          .catch(() => null);
  }, 60_000);
loadBotUsername();
void startMaxBot(APP_URL);

for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    store.flush();
    clans.flush();
    saves.flush();
    friends.flush();
    guard.flush();
    telemetry.flush();
    mod.flush();
    reports.flush();
    villages.flush();
    accounts.flush();
    process.exit(0);
  });
