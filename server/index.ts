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
//   PRO_PRICE, PRO_SALES_FILE — Pro Pass за звёзды Telegram: цена и покупки (server/proSales.ts)
//   GUARD_FILE — защита от читов: забранные награды и подозрения (по умолчанию guard.json рядом с DATA_FILE, server/guard.ts)
//   ADMIN_IDS — id админов (статистика, сводка и тревоги в боте); ещё файлом .admin-ids (ADMIN_FILE)
//   TELEMETRY_FILE — ошибки и анонимная статистика (по умолчанию data/telemetry.json)
//   VILLAGES_FILE — деревни для набегов, кубки, щиты и набеги за неделю (по умолчанию villages.json рядом с DATA_FILE, server/villages.ts)
//   MAX_BOT_TOKEN (или файл .max-token), MAX_CA_FILE — бот и мини-приложение в Max (server/maxBot.ts)
//   YANDEX_CLIENT_ID, YANDEX_CLIENT_SECRET (или файлы .yandex-id, .yandex-secret) — вход в браузере через Яндекс ID (server/webAuth.ts)
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
import { botApi, botStatus, botUploadFiles, currentAgent, langOfFrom, menuButton, runBot, TG_PROXY, type Update, webhookReply, webhookSecret } from './bot';
import { type Lang, tl } from '../src/i18n';
import { dueReminders, plausibleXp, SAVE_MAX_BYTES, SaveStore } from './saves';
import { raidNotices, type RaidNotice } from './raidNotices';
import { warNotices } from './warNotices';
import { opponent, warTick } from './wars';
import { dailyTask, npcName } from '../src/game/daily';
import { DEFAULT_BASELINE } from '../src/game/levels';
import { verifyInitData } from './telegramAuth';
import { ProList } from './pro';
import { giftText, invoicePayload, paidText, PRO_PRICE, ProSales, type SaleKind, saleAdminText, salesText, STARTER_PRICE } from './proSales';
import type { ChatMessage } from '../shared/clan';
import { FriendStore } from './friends';
import { type FriendsDeps, friendsApi } from './friendsApi';
import { Guard } from './guard';
import { clanPerks } from '../shared/clanLevel';
import { heroPower } from '../src/game/power';
import { heroLevel, type Progress } from '../src/game/progress';
import { handleTelemetry, Telemetry } from './telemetry';
import { dueMessages, pendingStage, weeklyDue } from './winback';
import { challengeScore, GroupChallenges, type GroupChallenge, parseGroupCommand, tableText } from './groupChallenges';
import { petById, type PetId } from '../src/game/pets';
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
import { agentFetch, Channel, type ChannelDeps } from './channel';
import { PersonalChannel } from './personalChannel';
import { Threads } from './threads';
import { CHANNEL_MEDIA, mediaDir } from './channelMedia';
import { runClaudeCode } from './claudeCode';
import { AccountStore } from './accounts';
import { checkSession, checkState, oauthState, sessionToken, verifyTelegramLogin, yandexAuthorizeUrl, yandexUser } from './webAuth';
import { type AccountDeps, accountApi } from './accountApi';
import { Reels } from './reels';
import { cameraDays, CityStore } from './cities';
import { balanceCommand, BalanceFile } from './balance';
import { GHOST_PREFIX, GHOST_WAIT_MS, GhostStore, isGhost, shadowTimes } from './ghosts';
import { ProTrials } from './proTrials';
import { isActive, Referrals } from './referrals';
import { TitanBoard } from './titan';
import { isMonth, RecapBoard } from './recap';
import { StoryImages } from './storyImages';
import { EmojiBadges } from './emojiBadges';
import { TITANS } from '../shared/titan';
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
// Баланс без релиза (server/balance.ts): файл рядом с данными сервера.
const balanceFile = new BalanceFile(process.env.BALANCE_FILE ?? '/opt/arena-server/balance.json');
// Топ по городу (server/cities.ts).
const cities = new CityStore(process.env.CITIES_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'cities.json'));
// Итоги месяца: место среди игроков и города. Картинки для сторис Telegram — рядом с данными, живут двое суток.
const recap = new RecapBoard({ saves: () => saves.all(), cities: () => cities.all() });
// Титан: общий босс страны раз в месяц. Имена героев для топа — из города, друзей или последнего запроса.
const titanNames = new Map<string, string>();
const titan = new TitanBoard(process.env.TITANS_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'titans.json'), {
  saves: () => saves.all(),
  cities: () => cities.all(),
  nameOf: (id) => cities.get(id)?.name ?? friends.get(id)?.name ?? titanNames.get(id),
  isPro: (id) => isPro(id),
  giftTop: () => TITAN_GIFT_TOP,
});
// Подарки Telegram лучшим героям за победу над Титаном: сколько героев (по умолчанию — лучший один; 0 — выключено).
// Отправляет админ командой /titan_gifts.
const TITAN_GIFT_TOP = Math.max(0, Math.min(10, Math.floor(Number(process.env.TITAN_GIFT_TOP ?? 1)) || 0));
// Значки достижений для emoji-статуса (набор создаёт админ командой /emoji_setup).
const emojiBadges = new EmojiBadges(process.env.EMOJI_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'emoji.json'));
const stories = new StoryImages(join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'stories'));
const pro = new ProList(process.env.PRO_FILE ?? join(__dirname, '.pro-ids'), process.env.PRO_IDS);
// Единый аккаунт: вход tg:123 → аккаунт, под которым лежит всё остальное (server/accounts.ts).
const accounts = new AccountStore(process.env.ACCOUNTS_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'accounts.json'));
// Pro и админ выдаются по id в Telegram: годится любой вход аккаунта.
// Купленный за звёзды Pro лежит на аккаунте и на том, кто платил (server/proSales.ts).
const sales = new ProSales(process.env.PRO_SALES_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'pro-sales.json'));
// Пробный Pro на 3 дня: игрок с Pro раз в сезон дарит его другу.
// «Приведи друга»: кто пришёл по ссылке-приглашению.
const referrals = new Referrals(process.env.REFERRALS_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'referrals.json'));
const trials = new ProTrials(process.env.PRO_TRIALS_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'pro-trials.json'));
const proIds = (id: string) => [id, ...accounts.logins(id)];
// Настоящий Pro (по списку или оплаченный) и Pro с пробником: дарить пробник может только настоящий.
const paidPro = (id: string) => pro.has(id) || accounts.logins(id).some((l) => pro.has(l)) || sales.active(proIds(id));
const isPro = (id: string) => paidPro(id) || trials.active(proIds(id), Date.now());
const proOfferOf = (id: string) => ({ ...sales.offer(proIds(id)), trial: trials.status(proIds(id), paidPro(id), Date.now()) });
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
  lang: (id) => saves.langOf(id),
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
  // Бой с «призраком» (записью): кубков нет, повторы идут в семейный дневник, запись игрока — в копилку.
  if (isGhost(end.a) || isGhost(end.b)) {
    const side = isGhost(end.a) ? 'b' : 'a';
    const real = online.get(end[side]);
    if (!real) return;
    const p = store.get(real.id, real.name);
    real.send({ type: 'profile', profile: profileView(p), delta: 0 });
    reportDuel(p, end.reps[side], end.outcome === 'draw' ? null : end.outcome === side, end.exercise);
    if (signedId(real.id)) ghosts.record(end.exercise, { id: real.id, name: real.name, times: end.times?.[side] ?? [], at: Date.now() });
    return;
  }
  const a = online.get(end.a);
  const b = online.get(end.b);
  if (!a || !b) return;
  // Бои настоящих игроков — записи для «призраков» пустой очереди.
  for (const [pl, side] of [[a, 'a'], [b, 'b']] as const) if (signedId(pl.id)) ghosts.record(end.exercise, { id: pl.id, name: pl.name, times: end.times?.[side] ?? [], at: Date.now() });
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

// «Призраки» для пустой очереди быстрого боя (server/ghosts.ts).
const ghosts = new GhostStore(process.env.GHOSTS_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'ghosts.json'));
const ghostWait = new Map<string, ReturnType<typeof setTimeout>>();
const stopGhostWait = (id: string) => {
  clearTimeout(ghostWait.get(id));
  ghostWait.delete(id);
};

/** Бой с записью игрока похожей силы (или с «Тенью Грома», пока записей нет). */
function ghostFight(player: Player, exercise: Exercise): Room {
  const base = Number((saves.get(player.id)?.progress as { baseline?: Record<string, number> } | undefined)?.baseline?.[exercise]) || 20;
  const target = Math.max(5, Math.round(base * 0.95));
  const rec = ghosts.pick(exercise, target, player.id);
  const times = rec?.times ?? shadowTimes(target);
  const r = newRoom(exercise);
  let timers: ReturnType<typeof setTimeout>[] = [];
  const clear = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };
  const ghost: Player = {
    id: `${GHOST_PREFIX}${r.code}`,
    name: rec ? tl(langOf(player.id), '{0} · запись', { 0: rec.name }) : tl(langOf(player.id), 'Тень Грома · тренировка'),
    send: (msg) => {
      if (msg.type === 'countdown') {
        clear();
        for (const t of times) timers.push(setTimeout(() => r.rep(ghost.id), msg.startsInMs + t));
      } else if (msg.type === 'end') clear();
      else if (msg.type === 'room') {
        // Игрок ушёл — «призрак» уходит следом, комната закрывается.
        if (!msg.players.some((p) => p.id !== ghost.id)) {
          clear();
          return void setTimeout(() => {
            r.leave(ghost.id);
            if (r.empty) {
              r.dispose();
              rooms.delete(r.code);
            }
          }, 0);
        }
        // «Призрак» всегда готов: бой начнётся, как только готов игрок (и на реванш тоже).
        if (msg.players.some((p) => p.id === ghost.id && !p.ready)) setTimeout(() => r.ready(ghost.id), 300);
      }
    },
  };
  r.join(ghost);
  r.join(player);
  return r;
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
  // Браузер после входа через Яндекс или Telegram присылает сессию (server/webAuth.ts).
  if (body.initData.startsWith('session:')) {
    const s = checkSession((t) => telemetry.sign(t), body.initData.slice(8), Date.now());
    return s && { login: s.login, name: cleanName(s.name) };
  }
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
      if (size > 1_200_000) req.destroy();
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

/** Ступени разделов (src/game/unlocks.ts): кто играл до них — всё открыто; дуэли и клан — открыты тем, кто в них уже был. */
function gateFlags(id: string, progress: unknown): { veteran: boolean; duels: boolean; clan: boolean } {
  const p = (progress ?? null) as { gates?: string; stars?: object; days?: object; onboarded?: boolean } | null;
  // Копия без отметки ступеней сохранена прежней версией игры: это игрок «до ступеней».
  const old = !!p && !p.gates && (Object.keys(p.stars ?? {}).length > 0 || Object.keys(p.days ?? {}).length > 0 || !!p.onboarded);
  return { veteran: old, duels: store.played(id), clan: !!clans.clanOf(id) };
}

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
  saves.setLang(who.id, body!.lang);
  saves.setTz(who.id, body!.tz);
  if (path === '/api/progress/load') {
    if (who.guest) {
      saves.adopt(who.id, who.guest);
      villages.adopt(who.id, who.guest);
    }
    const s = saves.get(who.id);
    if (s?.progress && !villages.get(who.id)) villages.update(who.id, s.progress, villageName(who.id, body!));
    return reply(200, { progress: s?.progress ?? null, remind: s?.remind ?? null, bot: botReady(who.id), telegram: accounts.target(who.id) !== null, maxBot: maxUsername(), pro: isPro(who.id), proOffer: who.login ? proOfferOf(who.id) : null, starter: who.login ? sales.starter(proIds(who.id)) : null, raidNotify: !s?.raidOff, letters: !s?.lettersOff, gift: s?.gift ?? null, ...gateFlags(who.id, s?.progress), emoji: emojiBadges.ids(), admin: isAdminAccount(who.id), account: who.id, linkable: !!who.login });
  }
  if (path === '/api/progress/save') {
    // Копия от героя, которого на этом входе уже нет (вход привязали к другому аккаунту): не принимаем, телефон перезагрузит прогресс.
    if (typeof body!.account === 'string' && body!.account !== who.id) return reply(409, { error: 'account changed', account: who.id });
    // Слишком большую копию сервер не хранит: говорим об этом, а не молча оставляем старую.
    if (JSON.stringify(body!.progress ?? null).length > SAVE_MAX_BYTES) return reply(413, { error: 'progress too large' });
    const s = saves.put(who.id, body!.progress);
    // Друг, пришедший по приглашению, провёл первый бой: пригласившему — сообщение (один раз).
    if (referrals.by(who.id) && isActive(s.progress)) {
      const r = referrals.activated(who.id);
      const l = langOf(r?.inviter ?? '');
      if (r) sendFriendBot(r.inviter, tl(l, '🎉 {0} провёл первый бой в NikitenokArena! Награда «Приведи друга» ждёт тебя в «Друзьях».', { 0: friends.get(who.id)?.name ?? tl(l, 'Твой друг') }), tl(l, 'Забрать награду'), '?tab=friends');
    }
    // Копия принята: обновляем снимок деревни для набегов (невозможный снимок отклоняется и отмечается).
    if (s.progress === body!.progress) villages.update(who.id, s.progress, villageName(who.id, body!));
    return reply(200, { savedAt: s.savedAt });
  }
  if (path === '/api/remind') {
    const r = body!.remind as { hour: number; tz: number } | null;
    return reply(200, { remind: saves.setRemind(who.id, r && { hour: Number(r.hour), tz: Number(r.tz) }).remind ?? null });
  }
  if (path === '/api/letters') return reply(200, { letters: !saves.setLetters(who.id, body!.on !== false).lettersOff });
  if (path === '/api/raid-notify') return reply(200, { raidNotify: !saves.setRaidNotify(who.id, body!.on !== false).raidOff });
  reply(404, { error: 'not found' });
}

const APP_URL = process.env.APP_URL ?? 'https://arena.nikitenok.ru';
const YANDEX_ID = process.env.YANDEX_CLIENT_ID || readToken(join(__dirname, '.yandex-id'));
const YANDEX_SECRET = process.env.YANDEX_CLIENT_SECRET || readToken(join(__dirname, '.yandex-secret'));
const YANDEX_REDIRECT = `${APP_URL.replace(/\/$/, '')}/api/auth/yandex/callback`;

/** Вход в браузере: GET /api/auth/yandex/start → Яндекс → /callback; POST /api/auth/telegram (данные виджета). Сессия уходит в адрес после #. */
async function onAuthApi(path: string, req: IncomingMessage, res: ServerResponse) {
  const now = Date.now();
  const sign = (t: string) => telemetry.sign(t);
  const back = (hash: string) => res.writeHead(302, { Location: `/#${hash}`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }).end();
  // Какие входы включены: браузер-гость без подписи узнаёт это до входа.
  if (path === '/api/auth/options' && req.method === 'GET')
    return res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ yandex: !!(YANDEX_ID && YANDEX_SECRET), telegram: BOT_TOKEN ? botUsername : null }));
  if (path === '/api/auth/yandex/start' && req.method === 'GET') {
    if (!YANDEX_ID || !YANDEX_SECRET) return back('login-error=yandex-off');
    return res.writeHead(302, { Location: yandexAuthorizeUrl(YANDEX_ID, YANDEX_REDIRECT, oauthState(sign, now)), 'Cache-Control': 'no-store' }).end();
  }
  if (path === '/api/auth/yandex/callback' && req.method === 'GET') {
    const q = new URL(req.url ?? '/', 'http://x').searchParams;
    const code = q.get('code');
    if (!code || !checkState(sign, q.get('state'), now) || !YANDEX_ID) return back('login-error=yandex');
    try {
      const u = await yandexUser(code, YANDEX_ID, YANDEX_SECRET);
      return back(`session=${sessionToken(sign, `ya:${u.id}`, u.name, now)}`);
    } catch (e) {
      console.log(`yandex login: ${e instanceof Error ? e.message : e}`);
      return back('login-error=yandex');
    }
  }
  if (path === '/api/auth/telegram' && req.method === 'POST') {
    const body = await readJson(req).catch(() => null);
    const u = BOT_TOKEN && body ? verifyTelegramLogin(body, BOT_TOKEN, now / 1000) : null;
    const reply = (code: number, b: unknown) => res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(b));
    if (!u) return reply(401, { error: 'Telegram не подтвердил вход' });
    return reply(200, { session: sessionToken(sign, `tg:${u.id}`, u.first_name, now) });
  }
  res.writeHead(404).end();
}
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
  appLink: (tag = 'channel') => `https://t.me/${botUsername ?? 'ArenaNikitenokBot'}?start=src-${tag}`,
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
// Threads (Meta): черновик раз в день с кнопкой «Опубликовать» или авто-режим. Токен — секрет THREADS_TOKEN → .threads-token.
const THREADS = process.env.THREADS ?? 'on';
const threads = new Threads(process.env.THREADS_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'threads.json'), {
  ...channelDeps,
  channel: 'Threads',
  approvers: () => admins.ids().map(Number),
  threadsToken: () => process.env.THREADS_TOKEN || readToken(join(__dirname, '.threads-token')),
  // Meta, как и Telegram, с сервера может быть недоступна напрямую — тот же прокси (в нём нужен домен threads.net).
  threadsFetch: agentFetch(currentAgent),
  mediaUrl: (name) => `${APP_URL}/api/threads/media/${name}.jpg`,
  ignoreText: (t) => t.trim() in ADMIN_BUTTONS,
});
// Рилсы для Instagram: кнопка запускает сборку в GitHub Actions (server/reels.ts), токен — секрет GH_ACTIONS_TOKEN → .gh-token.
const reels = new Reels(process.env.REELS_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'reels.json'), {
  token: () => process.env.GH_ACTIONS_TOKEN || readToken(join(__dirname, '.gh-token')),
});
// Вызовы в групповых чатах (server/groupChallenges.ts): бот ведёт таблицу «кто больше за неделю» прямо в чате.
const groups = new GroupChallenges(process.env.GROUPS_FILE ?? join(dirname(process.env.DATA_FILE ?? 'data/profiles.json'), 'group-challenges.json'));
const groupRows = (c: GroupChallenge) => Object.entries(c.members).map(([id, m]) => ({ id, name: m.name, reps: challengeScore(saves.get(id)?.progress, c.exercise, c.from, c.to) }));
const groupButton = (c: GroupChallenge) => ({ inline_keyboard: [[{ text: tl(c.lang, 'Участвовать'), url: `https://t.me/${botUsername ?? 'ArenaNikitenokBot'}?start=gc-${c.id}` }]] });
/** Опубликовать таблицу новым сообщением (новый вызов, /top, итоги). */
async function postGroupTable(c: GroupChallenge): Promise<void> {
  const text = tableText(c, groupRows(c), Date.now());
  const r = await botApi(BOT_TOKEN)('sendMessage', { chat_id: c.chat, text, reply_markup: c.done ? undefined : groupButton(c) }, 15_000).catch(() => null);
  const id = (r?.result as { message_id?: number } | undefined)?.message_id;
  // Бота удалили из чата или запретили писать: вызов закрываем.
  if (r && !r.ok && (r.error_code === 403 || r.error_code === 400)) return groups.update(c, { done: true });
  if (id) groups.update(c, { msg: id, shown: text });
}
/** Сообщение в группе: /challenge [упражнение], /start gc-… (бота добавили кнопкой из игры), /top. true — разобрано. */
const groupUpdate = (u: Update): boolean => {
  const msg = u.message;
  if (!BOT_TOKEN || !msg?.text || (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup')) return false;
  const cmd = parseGroupCommand(msg.text);
  if (!cmd) return false;
  const chat = msg.chat as { id: number; type: string; title?: string };
  const live = groups.ofChat(chat.id);
  if (cmd.kind === 'top') {
    if (live) void postGroupTable(live);
    else void botApi(BOT_TOKEN)('sendMessage', { chat_id: chat.id, text: tl(langOfChat(msg.from), 'Сейчас вызова нет. Начните: /challenge — отжимания, /challenge squat — приседания, /challenge situp — пресс.') }, 15_000).catch(() => null);
    return true;
  }
  const by = msg.from?.id ? accounts.resolve(`tg:${msg.from.id}`) : '';
  const { c, created } = groups.create(chat.id, chat.title ?? '', cmd.exercise, by, msg.from?.first_name ?? '', langOfChat(msg.from), Date.now());
  // Сколько вызовов начато (и в скольких чатах) — рост через группы виден в статистике.
  if (created) telemetry.serverEvent('group_start', cmd.exercise);
  void postGroupTable(c);
  return true;
};
/** Игра: вступить в вызов чата по кнопке «Участвовать» или посмотреть свои вызовы. */
async function onGroupApi(path: string, req: IncomingMessage, res: ServerResponse) {
  const reply = (code: number, body: unknown) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  const body = await readJson(req).catch(() => null);
  const who = body && identify(body);
  if (!who) return reply(401, { error: 'Открой приложение из Telegram' });
  const now = Date.now();
  const view = (c: GroupChallenge) => ({ id: c.id, title: c.title, exercise: c.exercise, endsAt: c.endsAt, rows: groupRows(c).sort((a, b) => b.reps - a.reps).slice(0, 20), me: who.id });
  if (path === '/api/group/join') {
    // Вызов ведётся по повторам Telegram-игроков: гостю нечего показывать в таблице чата.
    if (!who.login) return reply(403, { error: 'Открой приложение из Telegram' });
    const c = groups.join(String(body!.id ?? ''), who.id, villageName(who.id, body!) ?? '?', now);
    if (!c) return reply(404, { error: 'Вызов уже закончился' });
    return reply(200, { challenge: view(c) });
  }
  return reply(200, { challenges: groups.ofPlayer(who.id).map(view) });
}
// Таблицы вызовов: раз в 10 минут правим сообщение в чате, если счёт изменился; через неделю — итоги новым сообщением.
if (BOT_TOKEN)
  setInterval(() => {
    const now = Date.now();
    for (const c of groups.active()) {
      if (now > c.endsAt) {
        groups.update(c, { done: true });
        void postGroupTable(c);
        continue;
      }
      const text = tableText(c, groupRows(c), now);
      if (!c.msg || text === c.shown) continue;
      groups.update(c, { shown: text });
      void botApi(BOT_TOKEN)('editMessageText', { chat_id: c.chat, message_id: c.msg, text, reply_markup: groupButton(c) }, 15_000).catch(() => null);
    }
  }, 10 * 60_000);
/** Кнопки и ответы на черновики личного канала (опрос и вебхук). */
const channelUpdate = (u: Update): boolean => {
  const reply = (chatId: number, text: string) => void botApi(BOT_TOKEN)('sendMessage', { chat_id: chatId, text }, 15_000).catch(() => null);
  const answer = (id: string, text?: string) => void botApi(BOT_TOKEN)('answerCallbackQuery', { callback_query_id: id, text }, 15_000).catch(() => null);
  return (THREADS !== 'off' && threads.onUpdate(u, reply, answer)) || (PERSONAL_CHANNEL !== 'off' && personal.onUpdate(u, reply, answer));
};
/** Команды канала от админа: /channel, /channel_draft, /channel_post. */
// Клавиатура админа внизу чата: кнопка шлёт свой текст, его переводим в команду.
const ADMIN_BUTTONS: Record<string, string> = {
  '📊 Статус каналов': '/channel',
  '📝 Черновик Арены': '/channel_draft',
  '📣 Пост в Арену сейчас': '/channel_post',
  '✍️ Личный канал': '/channel_me',
  '🚩 Жалобы': '/reports',
  '🎬 Новый рилс': '/reel',
  '🖼 Карусель: советы': '/carousel tips',
  '🖼 Карусель: приложение': '/carousel app',
  '📱 Сторис': '/story',
  '🎭 Рилс от персонажа': '/talk',
  '🧵 Пост в Threads': '/threads',
  '⚖️ Баланс': '/balance',
  '💳 Проверить оплату': '/testpay',
};
const ADMIN_KEYBOARD = {
  keyboard: [[{ text: '📊 Статус каналов' }], [{ text: '📝 Черновик Арены' }, { text: '📣 Пост в Арену сейчас' }], [{ text: '✍️ Личный канал' }, { text: '🚩 Жалобы' }], [{ text: '🎬 Новый рилс' }, { text: '🎭 Рилс от персонажа' }], [{ text: '🖼 Карусель: советы' }, { text: '🖼 Карусель: приложение' }], [{ text: '📱 Сторис' }, { text: '🧵 Пост в Threads' }], [{ text: '⚖️ Баланс' }, { text: '💳 Проверить оплату' }]],
  resize_keyboard: true,
  is_persistent: true,
};
/** Текст кнопки админа → команда; остальное как есть. */
const adminText = (chatId: number, text: string): string => (admins.has(`tg:${chatId}`) && ADMIN_BUTTONS[text.trim()]) || text;
const channelCommand = (chatId: number, raw: string): boolean => {
  const text = adminText(chatId, raw);
  if (!/^\/(channel|admin|reel\b|carousel\b|story\b|talk\b|threads)/.test(text.trim())) return false;
  const isAdmin = admins.has(`tg:${chatId}`);
  const reply = (t: string) => void botApi(BOT_TOKEN)('sendMessage', { chat_id: chatId, text: t, reply_markup: isAdmin ? ADMIN_KEYBOARD : undefined }, 15_000).catch((e: Error) => console.log(`channel reply: ${e.message}`));
  if (/^\/admin\b/.test(text.trim()) && isAdmin) return reply('Админ-меню внизу чата: статус каналов, черновики, пост сейчас, жалобы, новый рилс, рилс от персонажа, карусели и сторис для Instagram, пост в Threads. «✍️ Личный канал» спросит тему поста — ответь фразой.'), true;
  // Не админу отвечаем, а не молчим: так сразу видно, чей id добавить в .admin-ids.
  if (!admins.has(`tg:${chatId}`)) return reply(`Команды канала только для админов. Твой Telegram ID: ${chatId}. Его нужно добавить в /opt/arena-server/.admin-ids.`), true;
  if (/^\/channel\s*$/.test(text.trim())) return reply(`${channel.status()}\n\n${personal.status()}\n\n${threads.status()}`), true;
  return reels.command(chatId, text, reply) || threads.command(chatId, text, reply) || personal.command(chatId, text, reply) || channel.command(chatId, text, reply);
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
/** На каком языке писать игроку: выбранный в игре (игра сообщает его серверу), иначе русский. */
const langOf = (id: string): Lang => saves.langOf(id);
/** Язык написавшего боту: если он уже играл — язык игры, иначе — язык его Telegram. */
const langOfChat = (from: { id?: number; language_code?: string } | undefined): Lang => {
  if (!from?.id) return langOfFrom(from);
  const id = accounts.resolve(`tg:${from.id}`);
  return saves.get(id) ? langOf(id) : langOfFrom(from);
};
const friendsDeps: FriendsDeps = {
  lang: (id) => saves.langOf(id),
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
  referrals,
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

/** Топ по городу: POST /api/city (топ недели), /api/city/set ({ city } — выбрать, null — убрать себя). Только для вошедших. */
async function onCityApi(path: string, req: IncomingMessage, res: ServerResponse) {
  const reply = (code: number, body: unknown) => res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  const body = await readJson(req).catch(() => null);
  const signed = body && signedIn(body);
  // Без токена бота (сервер для разработки) — и гости, как у набегов.
  const guest = body && !BOT_TOKEN && typeof body.guestId === 'string' && /^[\w-]{8,40}$/.test(body.guestId) ? `guest:${body.guestId}` : null;
  const me = signed ? { id: signed.id, name: signed.name } : guest ? { id: guest, name: cleanName(body!.name) } : null;
  if (!me) return reply(401, { error: 'Топ города — для тех, кто вошёл через Telegram, Max или Яндекс' });
  const now = Date.now();
  if (path === '/api/city/set') {
    const r = cities.set(me.id, body!.city, me.name, now);
    if (typeof r === 'string') return reply(400, { error: r });
  } else cities.rename(me.id, me.name);
  reply(200, cities.board({ days: (id) => cameraDays(saves.get(id)?.progress), level: (id) => saves.heroLevel(id), isPro: (id) => isPro(id), clanCity: (id) => clans.clanOf(id)?.city }, me.id, now));
}

/** Итоги месяца: POST /api/recap ({ month }) — место среди игроков и города; POST /api/story-image ({ image }) — картинка для сторис. */
async function onRecapApi(path: string, req: IncomingMessage, res: ServerResponse) {
  const reply = (code: number, body: unknown) => res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  const body = await readJson(req).catch(() => null);
  const who = body && identify(body);
  if (!who) return reply(401, { error: 'Войди через Telegram, Max или Яндекс' });
  const now = Date.now();
  if (path === '/api/story-image') {
    const r = stories.put(who.id, body!.image, now);
    if ('error' in r) return reply(r.code, { error: r.error });
    return reply(200, { url: `${APP_URL.replace(/\/$/, '')}/api/story/${r.id}.jpg` });
  }
  // Результат в чат (Bot API 8.0): бот заготавливает сообщение с картинкой и кнопкой «Играть»,
  // игра открывает выбор чата (shareMessage). Только для входа через Telegram.
  if (path === '/api/share/prepare') {
    const tgId = /^tg:(\d+)$/.exec(signedIn(body!)?.login ?? '')?.[1];
    if (!BOT_TOKEN || !tgId) return reply(403, { error: 'Только в Telegram' });
    const r = stories.put(who.id, body!.image, now);
    if ('error' in r) return reply(r.code, { error: r.error });
    const photo = `${APP_URL.replace(/\/$/, '')}/api/story/${r.id}.jpg`;
    const l = langOf(who.id);
    const caption = typeof body!.text === 'string' ? body!.text.slice(0, 900) : '';
    const play = `https://t.me/${botUsername ?? 'ArenaNikitenokBot'}?startapp=src-share`;
    const res = await botApi(BOT_TOKEN)(
      'savePreparedInlineMessage',
      {
        user_id: Number(tgId),
        result: { type: 'photo', id: r.id.slice(0, 64), photo_url: photo, thumbnail_url: photo, caption, reply_markup: { inline_keyboard: [[{ text: tl(l, 'Играть'), url: play }]] } },
        allow_user_chats: true,
        allow_group_chats: true,
        allow_channel_chats: true,
      },
      15_000,
    ).catch(() => null);
    const id = (res?.result as { id?: string } | undefined)?.id;
    return id ? reply(200, { id }) : reply(502, { error: 'Telegram не принял сообщение, попробуй ещё раз' });
  }
  if (!isMonth(body!.month)) return reply(400, { error: 'Нет месяца' });
  reply(200, recap.standing(who.id, body!.month, now));
}

/** Титан: POST /api/titan ({ key? }) — здоровье, урон, топ городов и героев, мой вклад. */
async function onTitanApi(req: IncomingMessage, res: ServerResponse) {
  const reply = (code: number, body: unknown) => res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  const body = await readJson(req).catch(() => null);
  const who = body && identify(body);
  if (!who) return reply(401, { error: 'Войди через Telegram, Max или Яндекс' });
  // Имя — из подписи мессенджера, у гостя (сервер для разработки) — из запроса.
  const name = signedIn(body!)?.name ?? cleanName(body!.name);
  if (name !== 'Боец' && name !== 'Гость' && titanNames.size < 100_000) titanNames.set(who.id, name);
  reply(200, titan.state(who.id, Date.now(), isMonth(body!.key) ? body!.key : undefined));
}

/** GET /api/story/<id>.jpg: картинка для сторис. */
function onStoryImage(path: string, res: ServerResponse) {
  const img = stories.get(path.slice('/api/story/'.length).replace(/\.jpg$/, ''), Date.now());
  if (!img) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': img.length, 'Cache-Control': 'public, max-age=86400' }).end(img);
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
    const { clan } = deletePlayer({ store, saves, clans, friends, telemetry, villages, cities, referrals, trials }, id, now);
    groups.forget(id);
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
  const { clan } = deletePlayer({ store, saves, clans, friends, telemetry, villages, cities, referrals, trials }, id, Date.now());
  groups.forget(id);
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
  archivedCard: (a) => {
    const p = a.progress as Partial<Progress> | null;
    return { level: heroLevel(plausibleXp(p, Date.now())).level, stages: Object.keys(p?.stars ?? {}).length, cups: a.cups };
  },
  restore: (id, a) => {
    dropAccount(id);
    if (a.progress && typeof a.progress === 'object') saves.put(id, { ...(a.progress as object), savedAt: Date.now() });
    store.restoreCups(id, a.cups);
  },
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
  return { method: 'sendMessage', chat_id: msg.chat.id, text: tl(langOfChat(msg.from), FEEDBACK_THANKS) };
};

/**
 * Оплата Pro звёздами: подтверждение перед оплатой и сама оплата.
 * Вернёт метод Bot API для ответа (или null); undefined — обновление не про оплату.
 */
const payUpdate = (u: Update): Record<string, unknown> | null | undefined => {
  const q = u.pre_checkout_query;
  // Проверочная оплата админа (/testpay): 1 ⭐, сразу возвращается, Pro и покупки не трогает.
  if (q && isTestPayload(q.invoice_payload)) {
    const ok = admins.has(`tg:${q.from.id}`) && q.currency === 'XTR' && q.total_amount === TEST_PAY_STARS;
    if (ok) void botApi(BOT_TOKEN)('sendMessage', { chat_id: q.from.id, text: '✅ Шаг 2 из 4: Telegram спросил сервер перед оплатой — сервер подтвердил.' }, 15_000).catch(() => null);
    return { method: 'answerPreCheckoutQuery', pre_checkout_query_id: q.id, ok, ...(ok ? {} : { error_message: 'Только для проверки админом.' }) };
  }
  if (q) {
    const error = sales.checkout(q.invoice_payload, q.currency, q.total_amount, proIds);
    return { method: 'answerPreCheckoutQuery', pre_checkout_query_id: q.id, ok: !error, ...(error ? { error_message: tl(langOfChat(q.from), error) } : {}) };
  }
  const msg = u.message;
  const pay = msg?.successful_payment;
  if (!msg || !pay) return undefined;
  if (isTestPayload(pay.invoice_payload)) {
    void finishTestPay(msg.chat.id, pay.telegram_payment_charge_id, pay.total_amount);
    return null;
  }
  const p = sales.paid(pay.invoice_payload, pay.telegram_payment_charge_id, `tg:${msg.chat.id}`, pay.total_amount, proIds, cleanName(msg.from?.first_name ?? '') || undefined);
  if (!p) {
    toAdmins(`⚠️ Оплата ${pay.total_amount} ⭐ от tg:${msg.chat.id} с непонятным счётом (${pay.invoice_payload.slice(0, 60)}). Код платежа: ${pay.telegram_payment_charge_id}`);
    return { method: 'sendMessage', chat_id: msg.chat.id, text: tl(langOfChat(msg.from), 'Оплата пришла, но мы не поняли, за что. Разработчик уже знает и разберётся.') };
  }
  toAdmins(saleAdminText(p));
  // Воронка покупки: оплачено (знаменатель — «увидели предложение» и «нажали Купить» из игры).
  telemetry.serverEvent('paid', p.kind);
  // Подарок: другу пишет бот туда, где он играет (Telegram или Max).
  if (p.kind === 'gift') sendFriendBot(p.account, giftText(p, p.name, langOf(p.account)), tl(langOf(p.account), 'Открыть пропуск'), '?tab=pass');
  const l = langOfChat(msg.from);
  return { method: 'sendMessage', chat_id: msg.chat.id, text: paidText(p, p.kind === 'gift' ? friends.get(p.account)?.name : undefined, l), reply_markup: { inline_keyboard: [[{ text: tl(l, 'Открыть пропуск'), web_app: { url: `${APP_URL.replace(/\/$/, '')}/?tab=pass` } }]] } };
};

/**
 * Админ: /emoji_setup — создать набор значков для emoji-статуса; /titan_gifts — подарки Telegram лучшим героям
 * последнего побеждённого Титана (за звёзды бота).
 */
const giftCommand = (chatId: number, text: string): boolean => {
  const m = /^\/(emoji_setup|titan_gifts)(?:@\w+)?$/.exec(text.trim());
  if (!m || !BOT_TOKEN || !admins.has(`tg:${chatId}`)) return false;
  const api = botApi(BOT_TOKEN);
  const say = (t: string) => api('sendMessage', { chat_id: chatId, text: t }, 15_000).catch(() => null);
  if (m[1] === 'emoji_setup') {
    void emojiBadges
      .setup((method, params) => api(method, params, 30_000), (method, fields, files) => botUploadFiles(BOT_TOKEN, method, fields, files), chatId, botUsername ?? 'ArenaNikitenokBot', join(__dirname, 'media', 'emoji'))
      .then(say)
      .catch((e: Error) => say(`Не вышло: ${e.message}`));
    return true;
  }
  void sendTitanGifts().then(say);
  return true;
};

/** Подарки за Титана: самый дешёвый подарок Telegram каждому из лучших героев с входом через Telegram. */
async function sendTitanGifts(): Promise<string> {
  if (!TITAN_GIFT_TOP) return 'Подарки за Титана выключены: задай TITAN_GIFT_TOP (сколько лучших героев награждать).';
  const last = titan.lastWon(Date.now(), TITAN_GIFT_TOP);
  if (!last) return 'Нет побеждённого Титана, за которого можно дарить.';
  if (last.sent) return `Подарки за Титана ${last.key} уже отправлены: ${last.sent}.`;
  const api = botApi(BOT_TOKEN);
  const list = await api('getAvailableGifts', {}, 15_000).catch(() => null);
  const gifts = ((list?.result as { gifts?: { id: string; star_count: number; remaining_count?: number }[] } | undefined)?.gifts ?? []).filter((g) => g.remaining_count !== 0);
  const gift = gifts.sort((a, b) => a.star_count - b.star_count)[0];
  if (!gift) return `Telegram не дал список подарков: ${list?.description ?? 'ошибка'}`;
  const name = TITANS[Number(last.key.slice(5)) - 1]?.name ?? 'Титан';
  let sent = 0;
  const fails: string[] = [];
  for (const [i, h] of last.top.entries()) {
    // Подарок — только в Telegram, даже если уведомления игрок получает в Max.
    const tgLogin = accounts.logins(h.id).find((x) => x.startsWith('tg:'));
    if (!tgLogin) continue;
    const l = langOf(h.id);
    const r = await api('sendGift', { user_id: Number(tgLogin.slice(3)), gift_id: gift.id, text: tl(l, '{0}-е место в битве с Титаном «{1}» — NikitenokArena', { 0: i + 1, 1: tl(l, name) }).slice(0, 128) }, 15_000).catch((e: Error) => ({ ok: false, description: e.message }));
    if (r.ok) sent++;
    else fails.push(`${i + 1}: ${r.description ?? 'ошибка'}`);
  }
  if (sent) titan.markGifts(last.key, { sent });
  return `🎁 Подарки за Титана ${last.key}: отправлено ${sent} из ${last.top.length} по ${gift.star_count} ⭐.${fails.length ? `\nНе ушли: ${fails.join('; ')}` : ''}`;
}

/** Админ: /balance — множители баланса без релиза (server/balance.ts). */
const adminBalance = (chatId: number, text: string): string | null => (admins.has(`tg:${chatId}`) ? balanceCommand(balanceFile, text) : null);

// Проверка оплаты звёздами от начала до конца, без настоящей покупки: /testpay в боте (только админ).
const TEST_PAY_STARS = 1;
const isTestPayload = (payload: string) => payload.startsWith('test:');
/** Шаг 1: счёт на 1 ⭐ в чат админа. Дальше бот сам пишет, какой шаг прошёл. */
const testPayCommand = (chatId: number, text: string): boolean => {
  if (!/^\/testpay(?:@\w+)?$/.test(text.trim()) || !BOT_TOKEN || !admins.has(`tg:${chatId}`)) return false;
  const api = botApi(BOT_TOKEN);
  void api('sendInvoice', { chat_id: chatId, title: 'Проверка оплаты', description: 'Проверяем оплату звёздами и возврат. Звезда вернётся автоматически через пару секунд.', payload: `test:${chatId}:${Date.now()}`, currency: 'XTR', prices: [{ label: 'Проверка', amount: TEST_PAY_STARS }] }, 15_000)
    .then((r) => api('sendMessage', { chat_id: chatId, text: r.ok ? '✅ Шаг 1 из 4: счёт создан. Оплати его кнопкой выше — бот проверит подтверждение, оплату и возврат.' : `❌ Шаг 1: счёт не создался — ${r.description ?? r.error_code}` }, 15_000))
    .catch(() => null);
  return true;
};
/** Шаги 3 и 4: оплата пришла — сразу возвращаем звезду и пишем итог. */
async function finishTestPay(chatId: number, charge: string, stars: number): Promise<void> {
  const api = botApi(BOT_TOKEN);
  const say = (t: string) => api('sendMessage', { chat_id: chatId, text: t }, 15_000).catch(() => null);
  await say(`✅ Шаг 3 из 4: оплата ${stars} ⭐ пришла серверу (код ${charge.slice(0, 12)}…).`);
  const r = await api('refundStarPayment', { user_id: chatId, telegram_payment_charge_id: charge }, 15_000).catch((e: Error) => ({ ok: false, description: e.message, error_code: 0 }));
  await say(r.ok ? '✅ Шаг 4 из 4: звезда возвращена. Оплата и возврат работают от начала до конца.' : `❌ Шаг 4: возврат не прошёл — ${r.description ?? r.error_code}. Верни вручную в @BotFather или напиши в поддержку Telegram.`);
}

/** Админ: /sales — покупки Pro, /refund_N — вернуть звёзды за покупку N (Pro по ней снимается). */
const proCommand = (chatId: number, text: string): boolean => {
  const m = /^\/(?:refund_(\d+)|sales)(?:@\w+)?$/.exec(text.trim());
  if (!m || !BOT_TOKEN || !admins.has(`tg:${chatId}`)) return false;
  const api = botApi(BOT_TOKEN);
  const say = (t: string, to = chatId) => api('sendMessage', { chat_id: to, text: t }, 15_000).catch(() => null);
  if (!m[1]) return void say(salesText(sales)), true;
  const p = sales.get(Number(m[1]));
  if (!p) return void say('Нет такой покупки. Список: /sales'), true;
  if (p.refunded) return void say(`Покупка #${p.n} уже возвращена.`), true;
  api('refundStarPayment', { user_id: Number(p.payer.slice(3)), telegram_payment_charge_id: p.charge }, 15_000)
    .then((r) => {
      if (!r.ok && !/ALREADY_REFUNDED/.test(r.description ?? '')) return say(`Не вышло вернуть: ${r.description ?? r.error_code}`);
      sales.refunded(p.n);
      telemetry.serverEvent('refund', p.kind);
      const l = langOf(accounts.resolve(p.payer));
      const what = p.kind === 'starter' ? tl(l, 'набор «Новичок»') : 'Pro Pass';
      say(`↩️ Вернул ${p.stars} ⭐ за покупку #${p.n} (${p.name ?? p.payer}).${p.kind === 'starter' ? ' Вещи из набора остаются в игре.' : ' Pro по ней снят.'}`);
      say(tl(l, '↩️ Мы вернули {0} ⭐ за {1}.', { 0: p.stars, 1: what }) + (p.kind === 'starter' ? '' : tl(l, ' Pro по этой покупке отключён.')), Number(p.payer.slice(3)));
    })
    .catch((e) => say(`Не вышло вернуть: ${e instanceof Error ? e.message : e}`));
  return true;
};

// Счета за звёзды: что видит игрок в окне оплаты.
const INVOICES: Record<SaleKind, { title: string; description: string; price: () => number }> = {
  pro: { title: 'Pro Pass на сезон', description: 'Заморозка серии раз в неделю, +25% опыта пропуска, золотая дорожка наград и облик «Страж Золотого щита», золотое имя, 3 дня Pro в подарок другу. Действует в Telegram, Max и браузере.', price: () => PRO_PRICE },
  gift: { title: 'Pro Pass в подарок', description: 'Pro Pass на сезон для друга: заморозка серии, +25% опыта пропуска, золотая дорожка наград, облик «Страж Золотого щита» и золотое имя. Бот скажет другу, от кого подарок.', price: () => PRO_PRICE },
  starter: { title: 'Набор «Новичок»', description: 'Облик «Искатель приключений» и сундук новичка: 1000 монет, 3 зелья бодрости и 2 свитка замены. Продаётся один раз.', price: () => STARTER_PRICE },
};

/** Покупки за звёзды из игры: POST /api/pro/status — что показать, /api/pro/invoice — ссылка на оплату в Telegram ({kind, for}). */
async function onProApi(path: string, req: IncomingMessage, res: ServerResponse) {
  const reply = (code: number, body: unknown) => res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  const body = await readJson(req).catch(() => null);
  const who = body && signedIn(body);
  if (!who) return reply(401, { error: 'Войди через Telegram, Max или Яндекс, чтобы купить Pro' });
  if (path === '/api/pro/status') return reply(200, { pro: isPro(who.id), proOffer: proOfferOf(who.id), starter: sales.starter(proIds(who.id)) });
  if (path === '/api/pro/trial') {
    const to = typeof body!.for === 'string' ? body!.for : '';
    if (to === who.id || !friends.areFriends(who.id, to)) return reply(403, { error: 'Пробный Pro можно подарить только другу' });
    const now = Date.now();
    const t = trials.give(proIds(who.id), proIds(to), paidPro(who.id), sales.paidUntil(proIds(to)) > 0 || paidPro(to), now);
    if (typeof t === 'string') return reply(409, { error: t });
    sendFriendBot(to, tl(langOf(to), '🎁 {0} дарит тебе 3 дня Pro Pass в NikitenokArena! Золотая дорожка наград, золотое имя, заморозка серии и +25% опыта пропуска.', { 0: who.name }), tl(langOf(to), 'Открыть пропуск'), '?tab=pass');
    return reply(200, { until: t.until, proOffer: proOfferOf(who.id) });
  }
  if (path !== '/api/pro/invoice') return reply(404, { error: 'not found' });
  if (!BOT_TOKEN) return reply(503, { error: 'Оплата пока не работает: бот не подключён' });
  const kind: SaleKind = body!.kind === 'gift' || body!.kind === 'starter' ? body!.kind : 'pro';
  // Подарок — только другу из списка друзей.
  const to = kind === 'gift' ? (typeof body!.for === 'string' ? body!.for : '') : who.id;
  if (kind === 'gift' && (to === who.id || !friends.areFriends(who.id, to))) return reply(403, { error: 'Подарить Pro можно только другу' });
  const why = sales.why(kind, proIds(to));
  if (why) return reply(409, { error: why });
  const inv = INVOICES[kind];
  // Окно оплаты — на языке игры покупателя.
  const l: Lang = body!.lang === 'en' ? 'en' : 'ru';
  const title = tl(l, inv.title);
  const r = await botApi(BOT_TOKEN)(
    'createInvoiceLink',
    { title, description: tl(l, inv.description), payload: invoicePayload(to, kind), currency: 'XTR', prices: [{ label: title, amount: inv.price() }] },
    20_000,
  ).catch((e: Error) => ({ ok: false, description: e.message }) as { ok: boolean; result?: unknown; description?: string });
  if (!r.ok || typeof r.result !== 'string') return reply(502, { error: 'Telegram не выдал счёт, попробуй ещё раз' });
  reply(200, { url: r.result });
}

const http = createServer((req, res) => {
  if (req.url === '/api/activity' && req.method === 'POST') {
    handleActivity(req, res);
    return;
  }
  const path = req.url?.split('?')[0] ?? '';
  // Картинки для постов в Threads: Meta скачивает их по публичному адресу. Только из библиотеки скриншотов.
  const media = /^\/api\/threads\/media\/([a-z0-9-]+)\.jpg$/.exec(path);
  if (media && req.method === 'GET') {
    if (!(media[1] in CHANNEL_MEDIA)) return void res.writeHead(404).end();
    try {
      return void res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' }).end(readFileSync(join(mediaDir(__dirname), `${media[1]}.jpg`)));
    } catch {
      return void res.writeHead(404).end();
    }
  }
  if (path === '/api/tg' && req.method === 'POST') {
    if (!BOT_TOKEN || req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret(BOT_TOKEN)) return void res.writeHead(403).end();
    readJson(req)
      .then((update) => {
        botStatus.webhook = true;
        botStatus.webhookAt = Date.now();
        const chat = (update as unknown as Update).message?.chat;
        if (chat?.type === 'private') saves.setBlocked(accounts.resolve(`tg:${chat.id}`), false);
        const msg = (update as unknown as Update).message;
        const pay = payUpdate(update as unknown as Update);
        if (pay !== undefined) return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(pay ? JSON.stringify(pay) : '{}');
        if (proCommand(chat?.id ?? 0, msg?.text ?? '') || testPayCommand(chat?.id ?? 0, msg?.text ?? '') || giftCommand(chat?.id ?? 0, msg?.text ?? '')) return void res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
        if (groupUpdate(update as unknown as Update)) return void res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
        if (channelUpdate(update as unknown as Update)) return void res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
        // Команды модерации от админа (/mute_…, /unmute_…, /reports).
        if (msg?.text && chat?.type === 'private' && channelCommand(chat.id, msg.text)) return void res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
        const admin = msg?.text && chat?.type === 'private' ? (adminBalance(chat.id, msg.text) ?? adminCommand(moderationDeps, chat.id, adminText(chat.id, msg.text))) : null;
        const answer = admin ? { method: 'sendMessage', chat_id: chat!.id, text: admin } : (webhookReply(update as unknown as Update, APP_URL, clanInfo, langOfChat) ?? (msg?.text && chat?.type === 'private' && !msg.text.startsWith('/') ? onPlayerText(msg) : null));
        if (answer) botStatus.handled++;
        // Англоязычному игроку — своя кнопка меню «Play» вместо общей «Играть».
        if (BOT_TOKEN && msg?.text?.startsWith('/start') && chat?.type === 'private' && langOfChat(msg.from) === 'en') botApi(BOT_TOKEN)('setChatMenuButton', { chat_id: chat.id, menu_button: menuButton(APP_URL, 'en') }, 15_000).catch(() => null);
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(answer ? JSON.stringify(answer) : '{}');
      })
      .catch(() => res.writeHead(400).end());
    return;
  }
  if (path.startsWith('/api/pro/')) {
    onProApi(path, req, res).catch(() => res.writeHead(500).end());
    return;
  }
  if (path.startsWith('/api/progress/') || path === '/api/remind' || path === '/api/raid-notify' || path === '/api/letters') {
    onProgressApi(path, req, res).catch(() => res.writeHead(500).end());
    return;
  }
  if (path === '/api/group/join' || path === '/api/group/state') {
    onGroupApi(path, req, res).catch(() => res.writeHead(500).end());
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
          langOf: (id) => langOf(accounts.resolve(`max:${id}`)),
          onUser: (id) => saves.setBlocked(accounts.resolve(`max:${id}`), false),
          onText: (from, text) => {
            if (!feedbackLimit.take(`max:${from.id}`, Date.now())) return null;
            toAdmins(`✉️ Сообщение от игрока в Max ${[from.name, from.username && `@${from.username}`].filter(Boolean).join(' ')} (id max:${from.id}):\n\n${text.slice(0, 2000)}`);
            return tl(langOf(accounts.resolve(`max:${from.id}`)), FEEDBACK_THANKS);
          },
        });
      })
      .catch(() => (res.headersSent ? null : res.writeHead(400).end()));
    return;
  }
  if (path.startsWith('/api/auth/')) {
    onAuthApi(path, req, res).catch(() => res.writeHead(500).end());
    return;
  }
  if (path.startsWith('/api/account/')) {
    onAccountApi(path, req, res).catch(() => res.writeHead(500).end());
    return;
  }
  if (path === '/api/city' || path === '/api/city/set') {
    onCityApi(path, req, res).catch(() => res.writeHead(500).end());
    return;
  }
  if (path === '/api/delete-me') {
    onDeleteMe(req, res).catch(() => res.writeHead(500).end());
    return;
  }
  if (path === '/api/recap' || path === '/api/story-image' || path === '/api/share/prepare') {
    onRecapApi(path, req, res).catch(() => res.writeHead(500).end());
    return;
  }
  if (path.startsWith('/api/story/') && req.method === 'GET') return onStoryImage(path, res);
  if (path === '/api/titan') {
    onTitanApi(req, res).catch(() => res.writeHead(500).end());
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
  if (req.url === '/api/balance') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(balanceFile.get()));
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
          // Никто не пришёл за 10 секунд — бой с записью игрока похожей силы.
          const me = player;
          stopGhostWait(me.id);
          ghostWait.set(
            me.id,
            setTimeout(() => {
              ghostWait.delete(me.id);
              if (queue.get(exercise) !== me || online.get(me.id) !== me) return;
              queue.delete(exercise);
              const r = ghostFight(me, exercise);
              me.send({ type: 'queue', waiting: false });
              me.joinedRoom?.(r);
            }, GHOST_WAIT_MS),
          );
          return;
        }
        stopGhostWait(other.id);
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
        stopGhostWait(player.id);
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
    if (online.get(player.id) === player) stopGhostWait(player.id);
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
      // Сегодня уже было письмо бота — или оно вот-вот придёт (после трёх дней тишины «возвращайся» с подарком,
      // в понедельник сводка недели): обычное напоминание не шлём, одно сообщение в день.
      if (save.letterOn === date || (!save.lettersOff && (pendingStage(save, date) || weeklyDue(save, date)))) continue;
      saves.markReminded(save.id, date);
      const p = save.progress as { baseline?: typeof DEFAULT_BASELINE; dailyDone?: string } | null;
      const task = dailyTask(date, { ...DEFAULT_BASELINE, ...p?.baseline });
      const l = langOf(save.id);
      const text =
        p?.dailyDone === date
          ? tl(l, 'Мастер Гром: «Сегодня ещё ни одного повтора. Пять минут — и день не потерян!»')
          : tl(l, '{0}: «{1}»\n\nЗадание дня: {2}. Награда: {3} монет.', { 0: tl(l, npcName(task.npc)), 1: tl(l, task.ask), 2: goalText(task.exercise, task.target, l), 3: task.coins });
      void notifyPlayer(save.id, text, tl(l, 'Тренироваться'), '').then((r) => {
        // Игрок остановил бота: больше не пишем.
        if (r?.status === 403) saves.setRemind(save.id, null);
      });
    }
  }, 5 * 60_000);
// Возврат ушедших (3 и 7 дней без тренировки, с подарком в игре) и сводка недели по понедельникам: раз в 10 минут.
// Отмечаем до отправки — после перезапуска повторов не будет. Шлём по одному, ~20 в секунду.
let lettersSending = false;
if (ANY_BOT)
  setInterval(() => {
    if (lettersSending) return;
    const list = dueMessages(saves.all(), Date.now(), {
      lang: langOf,
      clanName: (id) => clans.clanOf(id)?.name,
      petName: (id, pet) => {
        const p = saves.get(id)?.progress as Partial<Progress> | null;
        return p?.pets?.names?.[pet as PetId] || tl(langOf(id), petById(pet as PetId)?.name ?? '');
      },
      canWrite: (id) => !!accounts.target(id),
    });
    if (!list.length) return;
    for (const m of list) saves.markLetter(m.id, m.date, m.mark, m.gift);
    // Сколько писем ушло — знаменатель для letter_open (сколько вернулось по письму).
    for (const m of list) telemetry.serverEvent('letter_sent', m.kind);
    lettersSending = true;
    (async () => {
      for (const m of list) {
        const started = Date.now();
        // Метка в адресе кнопки: игра считает, сколько вернулось по каждому письму (letter_open).
        for (let attempt = 0; attempt < 2; attempt++) {
          const r = await notifyPlayer(m.id, m.text, m.button, `?from=${m.kind}`).catch(() => null);
          // Мессенджер просит подождать (429): ждём, сколько сказал, и пробуем ещё раз.
          const retry = r?.status === 429 ? (r.retryAfter ?? 1) : 0;
          await new Promise((res) => setTimeout(res, retry ? retry * 1000 : Math.max(0, 50 - (Date.now() - started))));
          if (!retry) break;
        }
      }
    })().finally(() => (lettersSending = false));
  }, 10 * 60_000);
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
    const list = [...raidNotices(clans.all(), Date.now(), muted, langOf), ...warNotices(clans, Date.now(), muted, langOf)];
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
      if (thanks) botApi(BOT_TOKEN)('sendMessage', { chat_id: msg.chat.id, text: tl(langOfChat(msg.from), FEEDBACK_THANKS) }, 15_000).catch(() => null);
    },
    (chatId, text) => (proCommand(chatId, text) || testPayCommand(chatId, text) || giftCommand(chatId, text) || channelCommand(chatId, text) ? '' : (adminBalance(chatId, text) ?? adminCommand(moderationDeps, chatId, adminText(chatId, text)))),
    (u) => {
      if (groupUpdate(u)) return true;
      const pay = payUpdate(u);
      if (pay === undefined) return channelUpdate(u);
      if (pay) {
        const { method, ...params } = pay;
        botApi(BOT_TOKEN)(String(method), params, 15_000).catch(() => null);
      }
      return true;
    },
    langOfChat,
  );
// Набеги на деревню: защитнику пишет бот (ночные ждут 9 утра), раз в минуту, с кнопкой «Отомстить».
if (ANY_BOT)
  setInterval(() => {
    for (const n of villages.takeNotices()) sendFriendBot(n.to, n.text, tl(langOf(n.to), 'Отомстить'), '?tab=village');
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
if (BOT_TOKEN && THREADS !== 'off') setInterval(() => threads.tick(), 60_000);
// Меню команд канала — только в личке у админов, игроки видят обычные /start и /help.
const ADMIN_COMMANDS = [
  { command: 'start', description: 'Начать игру' },
  { command: 'help', description: 'Помощь и приватность' },
  { command: 'paysupport', description: 'Вопрос об оплате' },
  { command: 'admin', description: 'Показать админ-клавиатуру' },
  { command: 'channel', description: 'Каналы: статус и ошибки' },
  { command: 'channel_draft', description: 'Черновик для @NikitenokArena (только тебе)' },
  { command: 'channel_post', description: 'Опубликовать пост в @NikitenokArena сейчас' },
  { command: 'channel_me', description: 'Черновик для личного канала с кнопками' },
  { command: 'reports', description: 'Жалобы игроков' },
  { command: 'sales', description: 'Покупки Pro Pass и возвраты' },
  { command: 'reel', description: 'Новый рилс для Instagram (можно с темой)' },
  { command: 'carousel', description: 'Карусель для Instagram: /carousel tips|app [тема]' },
  { command: 'story', description: 'Сторис для Instagram и TikTok: три картинки на выбор' },
  { command: 'threads', description: 'Пост для Threads: /threads [тема], /threads_auto on|off' },
  { command: 'talk', description: 'Рилс, где рассказывает персонаж игры: /talk [тема]' },
  { command: 'emoji_setup', description: 'Набор значков для emoji-статуса игроков' },
  { command: 'titan_gifts', description: 'Подарки Telegram лучшим героям за Титана' },
];
// Титан побеждён и неделя прошла: один раз спрашиваем админа, дарить ли подарки лучшим героям.
if (BOT_TOKEN && TITAN_GIFT_TOP)
  setInterval(() => {
    const last = titan.lastWon(Date.now(), TITAN_GIFT_TOP);
    if (!last || last.asked || last.sent) return;
    titan.markGifts(last.key, { asked: true });
    const top = last.top.map((h, i) => `${i + 1}. ${cities.get(h.id)?.name ?? friends.get(h.id)?.name ?? titanNames.get(h.id) ?? h.id} — ${h.reps}`).join('\n');
    toAdmins(`🏆 Титан ${last.key} повержен! Лучшие герои:\n${top}\n\nПодарить им подарки Telegram (самый дешёвый, за звёзды бота)? Команда: /titan_gifts`);
  }, 3_600_000);
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
    cities.flush();
    ghosts.flush();
    groups.flush();
    guard.flush();
    telemetry.flush();
    mod.flush();
    reports.flush();
    villages.flush();
    accounts.flush();
    sales.flush();
    trials.flush();
    referrals.flush();
    titan.flush();
    process.exit(0);
  });
