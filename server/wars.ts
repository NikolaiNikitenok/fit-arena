// Клановые войны на сервере: пары в пятницу, очки за повторы, итог в понедельник.
// Правила и формулы — в shared/war.ts. Состояние войны хранится в самих кланах (clans.json):
// у каждой стороны своя копия с очками своих участников, соперника находим по id.
import { clanLevel } from '../shared/clanLevel';
import {
  dayMsk,
  ghostPoints,
  ghostTarget,
  pairClans,
  WAR_GHOST,
  WAR_GHOST_ID,
  WAR_MIN_MEMBERS,
  WAR_XP,
  warAdd,
  warEndOf,
  warResult,
  warScore,
  warStartOf,
  warWindow,
  type WarResult,
  type WarSideView,
  type WarView,
} from '../shared/war';
import type { Clan, ClanStore } from './clans';

const HOUR = 3_600_000;
// Если сервер лежал в пятницу, пары ещё можно составить до полудня субботы.
const PAIR_LATEST = 12 * HOUR;
const HISTORY_KEEP = 10;

export interface ClanWar {
  key: string;
  // id клана-соперника или 'ghost'.
  opp: string;
  // Как выглядел соперник в пятницу: если он распадётся, история всё равно покажет его.
  oppLook: { name: string; tag: string; flag: string; level: number; members: number };
  // Состав на момент пары: id → имя. Очки приносят только они.
  roster: Record<string, string>;
  // В зачёт идут столько лучших с каждой стороны.
  counted: number;
  points: Record<string, number>;
  // Повторы по дням (по Москве) для дневного предела.
  days: Record<string, Record<string, number>>;
  ghostTarget?: number;
  // Итог, когда война подсчитана.
  result?: WarResult;
  us?: number;
  them?: number;
  mvp?: string | null;
  oppTop?: { name: string; points: number }[];
}

const look = (c: Clan) => ({ name: c.name, tag: c.tag, flag: c.flag ?? '', level: clanLevel(c.xp ?? 0).level, members: c.members.length });

/** Очки повторов в войну: только участникам из пятничного состава и только пока идёт бой. */
export function warReps(c: Clan, playerId: string, reps: number, now: number): number {
  const w = c.war;
  if (!w || w.result || !(playerId in w.roster)) return 0;
  if (now < warStartOf(w.key) || now >= warEndOf(w.key)) return 0;
  const day = dayMsk(now);
  const today = (w.days[day] ??= {});
  const add = warAdd(today[playerId] ?? 0, reps);
  if (!add) return 0;
  today[playerId] = (today[playerId] ?? 0) + add;
  w.points[playerId] = (w.points[playerId] ?? 0) + add;
  // Старые дни не нужны: война длится два дня.
  for (const d of Object.keys(w.days).sort().slice(0, -2)) delete w.days[d];
  return add;
}

/** Гость вошёл через Telegram: его очки войны переходят аккаунту. */
export function warAdopt(c: Clan, id: string, guestId: string): void {
  const w = c.war;
  if (!w || !(guestId in w.roster)) return;
  w.roster[id] ??= w.roster[guestId];
  delete w.roster[guestId];
  if (w.points[guestId]) w.points[id] = (w.points[id] ?? 0) + w.points[guestId];
  delete w.points[guestId];
  for (const day of Object.values(w.days)) {
    if (day[guestId]) day[id] = (day[id] ?? 0) + day[guestId];
    delete day[guestId];
  }
  if (w.mvp === guestId) w.mvp = id;
}

/** Соперник: настоящий клан, если он ещё воюет с нами в эту войну. */
export function opponent(store: ClanStore, c: Clan): Clan | null {
  const w = c.war;
  if (!w || w.opp === WAR_GHOST_ID) return null;
  const o = store.get(w.opp);
  return o?.war?.key === w.key && o.war.opp === c.id ? o : null;
}

/** Очки соперника сейчас (по именам): у призрака считаются по времени. */
function oppPoints(store: ClanStore, c: Clan, now: number): Record<string, number> {
  const w = c.war!;
  if (w.opp === WAR_GHOST_ID) return ghostPoints(w.key, w.ghostTarget ?? 0, w.counted, Math.min(now, warEndOf(w.key)));
  const o = opponent(store, c);
  if (!o) return {};
  return Object.fromEntries(Object.entries(o.war!.points).map(([id, p]) => [o.war!.roster[id] ?? id, p]));
}

export function warScores(store: ClanStore, c: Clan, now: number): { us: number; them: number } {
  const w = c.war!;
  if (w.result) return { us: w.us ?? 0, them: w.them ?? 0 };
  return { us: warScore(w.points, w.counted), them: warScore(oppPoints(store, c, now), w.counted) };
}

/** Лучший боец стороны: больше всех очков, при равенстве — кто раньше в составе. */
const mvpOf = (w: ClanWar): string | null => {
  let best: string | null = null;
  for (const id of Object.keys(w.roster)) if ((w.points[id] ?? 0) > (best ? (w.points[best] ?? 0) : 0)) best = id;
  return best;
};

/** Средний результат клана на участника в прошлых войнах: для силы призрака. */
const pastPerMember = (c: Clan) => (c.warHistory ?? []).filter((h) => h.us > 0).map((h) => h.us / Math.max(1, h.counted ?? WAR_MIN_MEMBERS));

function startWar(store: ClanStore, c: Clan, opp: Clan | null, counted: number, now: number): void {
  const key = warWindow(now).key;
  c.war = {
    key,
    opp: opp ? opp.id : WAR_GHOST_ID,
    oppLook: opp ? look(opp) : { ...WAR_GHOST, members: counted },
    roster: Object.fromEntries(c.members.map((m) => [m.id, m.name])),
    counted,
    points: {},
    days: {},
    ...(opp ? {} : { ghostTarget: ghostTarget(pastPerMember(c)) }),
  };
  store.system(c, opp ? `Война кланов! Соперник на выходных — клан «${opp.name}» [${opp.tag}]. Каждый повтор в субботу и воскресенье — очко клана` : `Война кланов! На выходных против нас ${WAR_GHOST.name}. Каждый повтор в субботу и воскресенье — очко клана`, now);
}

/** Пятница вечером: составить пары из записавшихся кланов. Возвращает кланы, которым досталась война. */
export function warPair(store: ClanStore, now: number): Clan[] {
  const w = warWindow(now);
  if (now < w.pairAt || now >= w.start + PAIR_LATEST) return [];
  const all = store.all();
  // Пары составляются один раз: если уже есть хоть одна война этих выходных, запись закрыта.
  if (all.some((c) => c.war?.key === w.key)) return [];
  const entrants = all.filter((c) => c.warOn && c.members.length >= WAR_MIN_MEMBERS);
  const { pairs, ghost } = pairClans(
    entrants.map((c) => ({ id: c.id, members: c.members.length, level: clanLevel(c.xp ?? 0).level, last: c.war?.opp, ghostLast: c.war?.opp === WAR_GHOST_ID })),
  );
  const out: Clan[] = [];
  for (const [a, b] of pairs) {
    const ca = store.get(a)!;
    const cb = store.get(b)!;
    const n = Math.min(ca.members.length, cb.members.length);
    startWar(store, ca, cb, n, now);
    startWar(store, cb, ca, n, now);
    out.push(ca, cb);
  }
  if (ghost) {
    const c = store.get(ghost)!;
    startWar(store, c, null, c.members.length, now);
    out.push(c);
  }
  if (out.length) store.save();
  return out;
}

/** Понедельник: подвести итог законченных войн, записать историю и дать клану опыт. */
export function warSettle(store: ClanStore, now: number): Clan[] {
  const out: Clan[] = [];
  for (const c of store.all()) {
    const w = c.war;
    if (!w || w.result || now < warEndOf(w.key)) continue;
    const them = oppPoints(store, c, now);
    const s = warScores(store, c, now);
    const result = warResult(s.us, s.them);
    w.us = s.us;
    w.them = s.them;
    w.result = result;
    w.mvp = mvpOf(w);
    w.oppTop = Object.entries(them)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, points]) => ({ name, points }));
    const rec = (c.warRecord ??= { w: 0, l: 0, d: 0 });
    rec[result === 'win' ? 'w' : result === 'lose' ? 'l' : 'd']++;
    const hist = (c.warHistory ??= []);
    hist.push({ key: w.key, opp: { name: w.oppLook.name, tag: w.oppLook.tag, flag: w.oppLook.flag, level: w.oppLook.level }, ghost: w.opp === WAR_GHOST_ID, us: s.us, them: s.them, result, mvp: w.mvp ? w.roster[w.mvp] : null, counted: w.counted });
    if (hist.length > HISTORY_KEEP) hist.splice(0, hist.length - HISTORY_KEEP);
    const vs = `${s.us} : ${s.them}`;
    store.system(
      c,
      result === 'win' ? `Победа в войне над «${w.oppLook.name}» — ${vs}! Награды ждут всех, кто бился` : result === 'draw' ? `Война с «${w.oppLook.name}» закончилась вничью — ${vs}` : `Война проиграна «${w.oppLook.name}» — ${vs}. Утешительные награды ждут всех, кто бился`,
      now,
    );
    store.addXp(c, '', WAR_XP[result], now);
    out.push(c);
  }
  if (out.length) store.save();
  return out;
}

/** Раз в минуту: пары и итоги. */
export const warTick = (store: ClanStore, now: number): Clan[] => [...warPair(store, now), ...warSettle(store, now)];

function side(store: ClanStore, c: Clan, points: Record<string, number>, names: Record<string, string>, playerId: string, score: number, members: number): WarSideView {
  return {
    id: c.id,
    name: c.name,
    tag: c.tag,
    flag: c.flag ?? '',
    level: clanLevel(c.xp ?? 0).level,
    members,
    score,
    top: Object.entries(points)
      .filter(([, p]) => p > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, p]) => ({ name: names[id] ?? 'Бывший участник', points: p, me: id === playerId, pro: store.isPro(id) })),
  };
}

export function warView(store: ClanStore, c: Clan, playerId: string, now: number): WarView {
  const win = warWindow(now);
  const w = c.war ?? null;
  const record = c.warRecord ?? { w: 0, l: 0, d: 0 };
  const history = [...(c.warHistory ?? [])].reverse();
  const base = { key: win.key, pairAt: win.pairAt, start: win.start, end: win.end, enabled: !!c.warOn, record, history };
  const current = w?.key === win.key;
  // Прошлая война видна до пятничных пар, потом экран переходит к записи на новую.
  if (!w || (!current && now >= win.pairAt))
    return { ...base, phase: 'signup', counted: 0, ghost: false, us: null, them: null, myPoints: 0, myToday: 0, outsider: false, result: null, reward: null };
  const ended = now >= warEndOf(w.key);
  const s = warScores(store, c, now);
  const them = w.result ? Object.fromEntries((w.oppTop ?? []).map((t) => [t.name, t.points])) : oppPoints(store, c, now);
  const opp = opponent(store, c);
  const ghost = w.opp === WAR_GHOST_ID;
  const oppSide: WarSideView = opp
    ? side(store, opp, opp.war!.points, opp.war!.roster, '', s.them, Object.keys(opp.war!.roster).length)
    : { id: w.opp, ...w.oppLook, score: s.them, top: [] };
  // У призрака и распавшегося клана «бойцы» — просто имена.
  if (!opp) oppSide.top = Object.entries(them).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, points]) => ({ name, points }));
  const result = ended ? (w.result ?? warResult(s.us, s.them)) : null;
  const myPoints = w.points[playerId] ?? 0;
  const mvp = w.mvp !== undefined ? w.mvp : mvpOf(w);
  return {
    ...base,
    key: w.key,
    start: warStartOf(w.key),
    end: warEndOf(w.key),
    pairAt: warStartOf(w.key) - (win.start - win.pairAt),
    phase: ended ? 'ended' : now < warStartOf(w.key) ? 'paired' : 'active',
    counted: w.counted,
    ghost,
    us: side(store, c, w.points, w.roster, playerId, s.us, Object.keys(w.roster).length),
    them: oppSide,
    myPoints,
    myToday: w.days[dayMsk(now)]?.[playerId] ?? 0,
    outsider: !(playerId in w.roster),
    result,
    reward: result && myPoints > 0 ? { key: w.key, result, points: myPoints, mvp: mvp === playerId } : null,
  };
}
