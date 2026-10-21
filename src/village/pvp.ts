// Набеги игроков в прогрессе: применить то, что прислал сервер. Каждый набег — один раз, по номеру:
// повторный ответ сервера (или тот же набег из двух ответов) ничего не меняет.
import { applyLoss, type Res } from '../../shared/village';
import { TROOP_IDS } from '../../shared/villageBattle';
import type { PvpDefense, PvpInbox, PvpMe, PvpWin } from '../../shared/villagePvp';
import type { Progress } from '../game/progress';
import { villageOf } from '../game/resources';
import { addLog } from './raids';
import { hasTown, townOf, withTown } from './state';
import type { DefenseEntry, PvpExtra } from './types';

// Сколько номеров помнить: сервер присылает набеги не старше недели.
const IDS_KEEP = 60;
const keep = (list: string[] | undefined, id: string) => [...(list ?? []).filter((x) => x !== id), id].slice(-IDS_KEEP);

const pvpOf = (p: Progress): PvpExtra => villageOf(p).pvp ?? {};
const withPvp = (p: Progress, pvp: PvpExtra): Progress => ({ ...p, village: { ...villageOf(p), pvp } });

/** Набег на мою деревню: списать унесённое и записать в журнал с повтором. */
export function applyDefense(p: Progress, d: PvpDefense, now: number): Progress {
  if (!hasTown(p)) return p;
  const pvp = pvpOf(p);
  const v = villageOf(p);
  if (pvp.def?.includes(d.id)) {
    // Уже применён: обновляем только, можно ли ещё отомстить.
    const log = v.log?.map((e) => (e.id === d.id && d.revenge <= 0 && !e.revenged ? { ...e, revengeUntil: 0 } : e));
    return log && log.some((e, k) => e !== v.log![k]) ? { ...p, village: { ...v, log } } : p;
  }
  const lost = withTown(p, applyLoss(townOf(p), d.loot, now));
  const entry: DefenseEntry = {
    at: d.at,
    who: d.who,
    stars: d.stars,
    pct: d.pct,
    loot: d.loot,
    avail: d.avail,
    seed: d.seed,
    army: d.army,
    deploys: d.deploys,
    base: d.base,
    hero: d.hero,
    endTick: d.endTick,
    id: d.id,
    trophies: d.trophies,
    revengeUntil: d.revenge > 0 ? now + d.revenge : 0,
  };
  const lv = villageOf(lost);
  return withPvp({ ...lost, village: { ...lv, log: addLog(lv.log, entry) } }, { ...pvp, def: keep(pvp.def, d.id) });
}

/** Мой набег засчитан сервером: добыча в запасы, высаженные отряды из лагеря. */
export function applyWin(p: Progress, w: PvpWin): Progress {
  if (!hasTown(p)) return p;
  const pvp = pvpOf(p);
  if (pvp.won?.includes(w.id)) return p;
  const t = townOf(p);
  const army = { ...t.army };
  for (const id of TROOP_IDS) army[id] = Math.max(0, (army[id] ?? 0) - (w.used[id] ?? 0));
  const res: Res = { wood: t.res.wood + w.loot.wood, stone: t.res.stone + w.loot.stone, gold: t.res.gold + w.loot.gold };
  return withPvp(withTown(p, { ...t, army, res }), { ...pvpOf(p), won: keep(pvp.won, w.id) });
}

/** Кубки, лига и щит — как сказал сервер. */
export function applyMe(p: Progress, me: PvpMe, now: number): Progress {
  const pvp = pvpOf(p);
  const shieldUntil = me.shield > 0 ? now + me.shield : 0;
  if (pvp.trophies === me.trophies && pvp.league === me.league && Math.abs((pvp.shieldUntil ?? 0) - shieldUntil) < 60_000) return p;
  return withPvp(p, { ...pvp, trophies: me.trophies, league: me.league, shieldUntil });
}

export function applyInbox(p: Progress, inbox: PvpInbox, now: number): Progress {
  let next = applyMe(p, inbox.me, now);
  for (const d of [...inbox.defenses].sort((a, b) => a.at - b.at)) next = applyDefense(next, d, now);
  for (const w of inbox.wins) next = applyWin(next, w);
  return next;
}

/** Отомстил: второй раз кнопки нет. */
export const markRevenged = (p: Progress, id: string): Progress => ({ ...p, village: { ...villageOf(p), log: villageOf(p).log?.map((e) => (e.id === id ? { ...e, revenged: true } : e)) } });

export const canRevenge = (e: DefenseEntry, now: number) => !!e.id && !e.revenged && (e.revengeUntil ?? 0) > now;
