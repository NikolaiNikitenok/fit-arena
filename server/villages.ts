// Набеги на деревни других игроков: сервер — судья (shared/villagePvp.ts — правила и числа).
// Храним в JSON-файле (data/villages.json):
//   villages — последний снимок деревни каждого игрока из копии прогресса (раскладка, уровни, запасы,
//     сборщики, войско), его кубки и щит. Снимок проверяется (checkTown): невозможный не принимаем,
//     пишем в guard как подозрение и оставляем прошлый;
//   attacks — набеги за неделю: кто, на кого, высадки и seed для повтора, добыча, кубки, месть;
//   notices — сообщения бота защитникам (ночью ждут утра);
//   notifyOff — кто выключил «Бот пишет о нападениях на деревню».
// Брони целей (на время боя) живут только в памяти: после перезапуска сервера бой просто не засчитают.
//
// Запасы деревни живут в телефоне, поэтому сервер не списывает их сам, а отдаёт защитнику набег
// (inbox → defenses), и телефон применяет его один раз по номеру (village.pvp.def). Пока телефон этого
// не подтвердил сохранением, сервер сам вычитает унесённое из снимка — второй нападающий не унесёт то же.
// Так же с нападающим: добычу добавляет телефон только по ответу сервера (village.pvp.won), а до
// подтверждения сервер вычитает потраченные отряды из снимка — одним войском дважды не напасть.
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { applyLoss, lootAvailable, type Res, RES_KEYS, thLevel, type Town } from '../shared/village';
import { baseOf, type BattleArmy, type BattleBase, type Deploy, finishTraining, simulateBattle, TROOP_IDS, type UnitKind } from '../shared/villageBattle';
import { botBase } from '../shared/villageCamps';
import { finishResearch } from '../shared/villageLab';
import {
  type AttackOutcome,
  checkArmy,
  checkDeploys,
  checkTown,
  FIND_PER_MIN,
  LOCK_MS,
  type PvpDefense,
  type PvpInbox,
  type PvpMe,
  type PvpTopRow,
  type PvpWin,
  REVENGE_MS,
  SAME_TARGET_MS,
  shieldFor,
  type TargetView,
  trophyDelta,
  trophyOffer,
  villageLeague,
  BOT_TROPHY_MAX,
} from '../shared/villagePvp';
import { townOf } from '../src/village/state';
import type { Progress } from '../src/game/progress';
import { isQuiet } from './friends';
import { num, plural } from './raidNotices';

const DAY = 86_400_000;
const KEEP_MS = 7 * DAY;
// Старые деревни (больше месяца без сохранений) соперникам не выдаём.
const ACTIVE_MS = 30 * DAY;
// Пропущенного соперника не выдаём снова 10 минут.
const SKIP_MS = 10 * 60_000;
const NOTICE_TTL = DAY;
const MIN_BUILDINGS = 3;
export const DELETED_NAME = 'Удалённый игрок';

export interface VillageRec {
  id: string;
  name: string;
  town: Town;
  // Когда сервер принял снимок.
  at: number;
  // Какие набеги телефон уже применил (защита) и зачёл (нападение) — из сохранения.
  def: string[];
  won: string[];
  trophies: number;
  shieldUntil: number;
}

export interface AttackRec {
  id: string;
  at: number;
  attacker: string;
  attackerName: string;
  // У бота — bot:seed.
  defender: string;
  defenderName: string;
  bot?: boolean;
  revengeOf?: string;
  revenged?: boolean;
  seed: number;
  base: BattleBase;
  avail: Res;
  army: BattleArmy;
  deploys: Deploy[];
  endTick?: number;
  stars: number;
  pct: number;
  loot: Res;
  used: Partial<Record<UnitKind, number>>;
  attTrophies: number;
  defTrophies: number;
}

interface Lock {
  token: string;
  attacker: string;
  target: string;
  until: number;
  seed: number;
  base: BattleBase;
  loot: Res;
  name: string;
  th: number;
  trophies: number;
  bot: boolean;
  revengeOf?: string;
}

export interface VillageNotice {
  to: string;
  attack: string;
  at: number;
  text: string;
}

export interface VillageDeps {
  now: () => number;
  random: () => number;
  // Хоть один из двоих заблокировал другого (server/moderation.ts).
  blocked: (a: string, b: string) => boolean;
  // Кого можно выдавать соперником: при боте — только игроков Telegram.
  eligible: (id: string) => boolean;
  heroLevel: (id: string) => number | null;
  flag: (id: string, kind: string, detail: string) => void;
  claim: (id: string, key: string) => boolean;
  // Под подозрением — не в общем топе.
  hidden: (id: string) => boolean;
  // Писать боту нельзя (остановил бота).
  botBlocked: (id: string) => boolean;
}

export const BOT_NAMES = ['Соня Подушкина', 'Вася Лежебоков', 'Дрёма', 'Бублик', 'Тюфяк', 'Зевака', 'Сплюшка', 'Тётя Перина'];
const RES_WORDS: Record<keyof Res, string> = { wood: 'дерева', stone: 'камня', gold: 'золота' };

type Result<T> = T | { error: string; status: number };
const fail = (status: number, error: string) => ({ error, status });
export const isFail = <T>(r: Result<T>): r is { error: string; status: number } => typeof r === 'object' && r !== null && 'error' in r && 'status' in r;

const defaults: VillageDeps = {
  now: Date.now,
  random: Math.random,
  blocked: () => false,
  eligible: () => true,
  heroLevel: () => null,
  flag: () => {},
  claim: () => true,
  hidden: () => false,
  botBlocked: () => false,
};

export class VillageStore {
  private villages = new Map<string, VillageRec>();
  private attacks: AttackRec[] = [];
  private notices: VillageNotice[] = [];
  private notifyOff = new Set<string>();
  private locks = new Map<string, Lock>();
  private finds = new Map<string, number[]>();
  private skipped = new Map<string, { id: string; at: number }[]>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  d: VillageDeps;

  constructor(
    private readonly file: string | null,
    deps: Partial<VillageDeps> = {},
  ) {
    this.d = { ...defaults, ...deps };
    if (!file) return;
    try {
      const data = JSON.parse(readFileSync(file, 'utf8')) as { villages?: VillageRec[]; attacks?: AttackRec[]; notices?: VillageNotice[]; notifyOff?: string[] };
      for (const v of data.villages ?? []) this.villages.set(v.id, v);
      this.attacks = data.attacks ?? [];
      this.notices = data.notices ?? [];
      this.notifyOff = new Set(data.notifyOff ?? []);
    } catch {
      // Файла ещё нет.
    }
  }

  get(id: string): VillageRec | undefined {
    return this.villages.get(id);
  }

  attack(id: string): AttackRec | undefined {
    return this.attacks.find((a) => a.id === id);
  }

  /** Снимок деревни из копии прогресса. false — снимок невозможный (отклонён и отмечен). */
  update(id: string, progress: unknown, name?: string): boolean {
    const p = progress as Progress | null;
    if (!p || typeof p !== 'object' || !p.village?.b?.length) return true;
    const now = this.d.now();
    let town: Town;
    try {
      town = townOf(p);
    } catch {
      town = null as unknown as Town;
    }
    const bad = checkTown(town);
    if (bad) {
      this.d.flag(id, 'village', bad);
      return false;
    }
    const prev = this.villages.get(id);
    const pvp = (p.village as { pvp?: { def?: unknown; won?: unknown } }).pvp;
    const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-100) : []);
    const t: Town = { res: { ...town.res }, b: town.b.map((b) => ({ ...b })), n: town.n, army: { ...town.army }, q: town.q.map((e) => ({ ...e })) };
    if (town.tl && Object.keys(town.tl).length) t.tl = { ...town.tl };
    if (town.r) t.r = { t: town.r.t, end: town.r.end };
    this.villages.set(id, {
      id,
      name: name ?? prev?.name ?? 'Соседняя деревня',
      town: t,
      at: now,
      def: ids(pvp?.def),
      won: ids(pvp?.won),
      trophies: prev?.trophies ?? 0,
      shieldUntil: prev?.shieldUntil ?? 0,
    });
    this.save();
    return true;
  }

  setName(id: string, name: string): void {
    const v = this.villages.get(id);
    if (v && v.name !== name) {
      v.name = name;
      this.save();
    }
  }

  /** Деревня как она сейчас на самом деле: снимок минус набеги и траты, которые телефон ещё не подтвердил. */
  current(id: string): Town | null {
    const v = this.villages.get(id);
    if (!v) return null;
    const now = this.d.now();
    let t = finishResearch(finishTraining(v.town, now), now);
    for (const a of this.attacks) {
      if (a.defender === id && !a.bot && !v.def.includes(a.id)) t = applyLoss(t, a.loot, now);
      if (a.attacker === id && !v.won.includes(a.id)) {
        const army = { ...t.army };
        for (const k of TROOP_IDS) army[k] = Math.max(0, (army[k] ?? 0) - (a.used[k] ?? 0));
        t = { ...t, army };
      }
    }
    return t;
  }

  me(id: string): PvpMe {
    const now = this.d.now();
    const v = this.villages.get(id);
    const trophies = v?.trophies ?? 0;
    const rank = this.topAll().findIndex((x) => x.id === id);
    return { trophies, league: villageLeague(trophies).name, shield: Math.max(0, (v?.shieldUntil ?? 0) - now), rank: rank < 0 ? null : rank + 1, notify: !this.notifyOff.has(id) };
  }

  setNotify(id: string, on: boolean): boolean {
    if (on) this.notifyOff.delete(id);
    else this.notifyOff.add(id);
    this.save();
    return on;
  }

  private underAttack(id: string, now: number): boolean {
    for (const l of this.locks.values()) if (l.target === id && l.until > now) return true;
    return false;
  }

  private dropExpired(now: number): void {
    for (const [k, l] of this.locks) if (l.until <= now) this.locks.delete(k);
  }

  /** Отпустить свою прошлую бронь: пропуск соперника. */
  private release(attacker: string, now: number): void {
    for (const [k, l] of this.locks)
      if (l.attacker === attacker) {
        this.locks.delete(k);
        if (!l.bot) {
          const list = (this.skipped.get(attacker) ?? []).filter((s) => now - s.at < SKIP_MS);
          list.push({ id: l.target, at: now });
          this.skipped.set(attacker, list);
        }
      }
  }

  private rateOk(id: string, now: number): boolean {
    const list = (this.finds.get(id) ?? []).filter((t) => now - t < 60_000);
    if (list.length >= FIND_PER_MIN) {
      this.finds.set(id, list);
      return false;
    }
    list.push(now);
    this.finds.set(id, list);
    return true;
  }

  private heroMax(id: string): number {
    return (this.d.heroLevel(id) ?? 60) + 1;
  }

  private lockFor(attacker: string, l: Omit<Lock, 'token' | 'until' | 'attacker'>, now: number, myTrophies: number, myTh: number): TargetView {
    const token = randomBytes(12).toString('base64url');
    this.locks.set(token, { ...l, token, attacker, until: now + LOCK_MS });
    return {
      id: l.bot ? l.target : `t:${token.slice(0, 8)}`,
      name: l.name,
      level: l.th,
      layout: l.base,
      lootAvailable: l.loot,
      seed: l.seed,
      token,
      ttl: LOCK_MS,
      trophies: l.trophies,
      offer: trophyOffer(myTrophies, l.trophies, myTh, l.th, l.bot),
      bot: l.bot || undefined,
      revenge: l.revengeOf ? true : undefined,
      heroMax: this.heroMax(attacker),
    };
  }

  /** Кого можно выдать соперником нападающему me. */
  candidates(me: string, now: number): VillageRec[] {
    const mine = this.villages.get(me);
    if (!mine) return [];
    const th = thLevel(mine.town);
    const skip = new Set((this.skipped.get(me) ?? []).filter((s) => now - s.at < SKIP_MS).map((s) => s.id));
    const recent = new Set(this.attacks.filter((a) => a.attacker === me && now - a.at < SAME_TARGET_MS).map((a) => a.defender));
    return [...this.villages.values()].filter(
      (v) =>
        v.id !== me &&
        this.d.eligible(v.id) &&
        Math.abs(thLevel(v.town) - th) <= 1 &&
        v.shieldUntil <= now &&
        now - v.at < ACTIVE_MS &&
        baseOf(v.town).buildings.length >= MIN_BUILDINGS &&
        !skip.has(v.id) &&
        !recent.has(v.id) &&
        !this.underAttack(v.id, now) &&
        !this.d.blocked(me, v.id),
    );
  }

  /** Найти соперника (или следующего — прошлая бронь отпускается). */
  find(me: string, name: string): Result<TargetView> {
    const now = this.d.now();
    this.dropExpired(now);
    const mine = this.villages.get(me);
    if (!mine) return fail(409, 'Деревня ещё не сохранилась на сервере. Попробуй через минуту.');
    if (!this.rateOk(me, now)) return fail(429, 'Слишком часто. Подожди минуту.');
    this.setName(me, name);
    this.release(me, now);
    // Свой набег снимает свой щит.
    if (mine.shieldUntil > now) {
      mine.shieldUntil = now;
      this.save();
    }
    const th = thLevel(mine.town);
    const list = this.candidates(me, now).sort((a, b) => Math.abs(a.trophies - mine.trophies) - Math.abs(b.trophies - mine.trophies) || b.at - a.at);
    const near = list.slice(0, 5);
    const seed = Math.floor(this.d.random() * 2_000_000_000);
    if (near.length) {
      const v = near[Math.floor(this.d.random() * near.length)];
      const town = this.current(v.id)!;
      return this.lockFor(me, { target: v.id, seed, base: baseOf(town), loot: lootAvailable(town, now), name: v.name, th: thLevel(town), trophies: v.trophies, bot: false }, now, mine.trophies, th);
    }
    // Живых соперников нет — деревня-бот того же уровня (её тоже проверяет сервер).
    const level = Math.max(1, Math.min(8, th + (seed % 3) - 1));
    const { base, loot } = botBase(level, seed);
    const trophies = Math.max(0, Math.min(BOT_TROPHY_MAX, mine.trophies + (seed % 101) - 50));
    return this.lockFor(me, { target: `bot:${seed}`, seed, base, loot, name: BOT_NAMES[seed % BOT_NAMES.length], th: level, trophies, bot: true }, now, mine.trophies, th);
  }

  /** Месть: напасть на обидчика без поиска, один раз в сутки после набега, если у него нет щита. */
  revenge(me: string, name: string, attackId: string): Result<TargetView> {
    const now = this.d.now();
    this.dropExpired(now);
    const a = this.attack(attackId);
    if (!a || a.defender !== me || a.bot) return fail(404, 'Набег не найден');
    if (a.revenged) return fail(409, 'Ты уже отомстил');
    if (now - a.at > REVENGE_MS) return fail(409, 'Отомстить можно только в течение суток');
    const mine = this.villages.get(me);
    if (!mine) return fail(409, 'Деревня ещё не сохранилась на сервере. Попробуй через минуту.');
    const v = a.attacker ? this.villages.get(a.attacker) : undefined;
    if (!v) return fail(404, 'Деревни обидчика больше нет');
    if (this.d.blocked(me, v.id)) return fail(403, 'Игрок в чёрном списке');
    if (v.shieldUntil > now) return fail(409, 'У обидчика щит. Попробуй позже.');
    if (this.underAttack(v.id, now)) return fail(409, 'На обидчика уже нападают. Попробуй через пару минут.');
    if (!this.rateOk(me, now)) return fail(429, 'Слишком часто. Подожди минуту.');
    this.setName(me, name);
    this.release(me, now);
    if (mine.shieldUntil > now) mine.shieldUntil = now;
    const town = this.current(v.id)!;
    const seed = Math.floor(this.d.random() * 2_000_000_000);
    return this.lockFor(me, { target: v.id, seed, base: baseOf(town), loot: lootAvailable(town, now), name: v.name, th: thLevel(town), trophies: v.trophies, bot: false, revengeOf: a.id }, now, mine.trophies, thLevel(mine.town));
  }

  /** Набег: сервер сам проверяет войско и высадки и сам считает бой. */
  submit(me: string, body: { token?: unknown; seed?: unknown; army?: unknown; deploys?: unknown; endTick?: unknown }): Result<AttackOutcome> {
    const now = this.d.now();
    const lock = typeof body.token === 'string' ? this.locks.get(body.token) : undefined;
    if (!lock || lock.attacker !== me) return fail(409, 'Бронь набега не найдена');
    this.locks.delete(lock.token);
    if (lock.until < now) return fail(409, 'Время набега вышло');
    if (body.seed != null && body.seed !== lock.seed) {
      this.d.flag(me, 'pvpSeed', `${body.seed} != ${lock.seed}`);
      return fail(400, 'Набег не прошёл проверку');
    }
    const town = this.current(me);
    if (!town) return fail(409, 'Деревня не найдена');
    const armyErr = checkArmy(body.army, town, this.heroMax(me));
    if (armyErr) {
      this.d.flag(me, 'pvpArmy', armyErr);
      return fail(400, 'Войско не совпадает с деревней на сервере');
    }
    const a = body.army as BattleArmy;
    const army: BattleArmy = { troops: Object.fromEntries(TROOP_IDS.filter((k) => (a.troops[k] ?? 0) > 0).map((k) => [k, a.troops[k]])), level: a.level, hero: a.hero };
    const lv = Object.fromEntries(TROOP_IDS.filter((k) => (a.lv?.[k] ?? 1) > 1).map((k) => [k, a.lv![k]]));
    if (Object.keys(lv).length) army.lv = lv;
    const deploys = Array.isArray(body.deploys) ? (body.deploys as Deploy[]).map((d) => ({ t: d?.t, u: d?.u, x: d?.x, y: d?.y }) as Deploy) : body.deploys;
    const endTick = body.endTick == null ? undefined : (body.endTick as number);
    const depErr = checkDeploys(lock.base, army, deploys, endTick, lock.loot, lock.seed);
    if (depErr) {
      this.d.flag(me, 'pvpDeploys', depErr);
      return fail(400, 'Набег не прошёл проверку');
    }
    const ds = deploys as Deploy[];
    const result = simulateBattle({ base: lock.base, army, deploys: ds, loot: lock.loot, seed: lock.seed, endTick });
    const mine = this.villages.get(me)!;
    const def = lock.bot ? null : this.villages.get(lock.target);
    const offer = trophyOffer(mine.trophies, def?.trophies ?? lock.trophies, thLevel(town), lock.th, lock.bot);
    const delta = trophyDelta(offer, result.stars, mine.trophies, def?.trophies ?? lock.trophies);
    const id = `a${now.toString(36)}${randomBytes(4).toString('hex')}`;
    // Награду этого набега можно получить только один раз (server/guard.ts).
    this.d.claim(me, `pvp:${id}`);
    const rec: AttackRec = {
      id,
      at: now,
      attacker: me,
      attackerName: mine.name,
      defender: lock.target,
      defenderName: lock.name,
      bot: lock.bot || undefined,
      revengeOf: lock.revengeOf,
      seed: lock.seed,
      base: lock.base,
      avail: lock.loot,
      army,
      deploys: ds,
      endTick,
      stars: result.stars,
      pct: result.destruction,
      loot: result.loot,
      used: result.used,
      attTrophies: delta.att,
      defTrophies: lock.bot ? 0 : delta.def,
    };
    this.attacks.push(rec);
    mine.trophies = Math.max(0, mine.trophies + delta.att);
    if (def) {
      def.trophies = Math.max(0, def.trophies + delta.def);
      const shield = shieldFor(result.stars, result.destruction);
      if (shield) def.shieldUntil = Math.max(def.shieldUntil, now + shield);
      this.notice(rec);
    }
    if (lock.revengeOf) {
      const orig = this.attack(lock.revengeOf);
      if (orig) orig.revenged = true;
    }
    this.prune(now);
    this.save();
    return { result, verified: true, win: this.winOf(rec), me: this.me(me) };
  }

  private winOf(a: AttackRec): PvpWin {
    return { id: a.id, at: a.at, name: a.defenderName, stars: a.stars, pct: a.pct, loot: a.loot, used: a.used, trophies: a.attTrophies };
  }

  private defenseOf(a: AttackRec, now: number): PvpDefense {
    return {
      id: a.id,
      at: a.at,
      who: a.attackerName,
      stars: a.stars,
      pct: a.pct,
      loot: a.loot,
      avail: a.avail,
      seed: a.seed,
      army: a.army,
      deploys: a.deploys,
      endTick: a.endTick,
      base: a.base.buildings.map((b) => [b.i, b.t, b.x, b.y, b.l]),
      trophies: a.defTrophies,
      revenge: a.revenged || !a.attacker ? 0 : Math.max(0, a.at + REVENGE_MS - now),
    };
  }

  /** Что телефону применить: набеги на меня и мои набеги, которые он ещё не подтвердил. */
  inbox(me: string, name?: string): PvpInbox {
    const now = this.d.now();
    if (name) this.setName(me, name);
    const v = this.villages.get(me);
    const def = new Set(v?.def ?? []);
    const won = new Set(v?.won ?? []);
    return {
      me: this.me(me),
      // Набеги на меня — все за последнюю неделю: телефон применяет каждый один раз, а месть видна и после.
      defenses: this.attacks.filter((a) => a.defender === me && !a.bot && (!def.has(a.id) || now - a.at < REVENGE_MS)).map((a) => this.defenseOf(a, now)),
      wins: this.attacks.filter((a) => a.attacker === me && !won.has(a.id)).map((a) => this.winOf(a)),
    };
  }

  private topAll() {
    const now = this.d.now();
    return [...this.villages.values()].filter((v) => v.trophies > 0 && this.d.eligible(v.id) && !this.d.hidden(v.id) && now - v.at < ACTIVE_MS).sort((a, b) => b.trophies - a.trophies || a.at - b.at);
  }

  top(me?: string, limit = 50): PvpTopRow[] {
    return this.topAll()
      .slice(0, limit)
      .map((v) => ({ name: v.name, trophies: v.trophies, th: thLevel(v.town), league: villageLeague(v.trophies).name, me: v.id === me || undefined }));
  }

  // ——— Бот ———

  private notice(a: AttackRec): void {
    if (!/^tg:\d+$/.test(a.defender) || this.notifyOff.has(a.defender)) return;
    const got = RES_KEYS.filter((k) => a.loot[k] > 0).map((k) => `${num(a.loot[k])} ${RES_WORDS[k]}`);
    const loot = got.length ? `унёс ${got.length > 1 ? `${got.slice(0, -1).join(', ')} и ${got[got.length - 1]}` : got[0]}` : 'ничего не унёс';
    const cups = a.defTrophies ? ` ${a.defTrophies > 0 ? '+' : '−'}${Math.abs(a.defTrophies)} ${plural(Math.abs(a.defTrophies), 'кубок', 'кубка', 'кубков')}.` : '';
    const text = a.stars ? `⚔️ ${a.attackerName} напал на твою деревню: ${a.stars}★, ${loot}.${cups}\n\nОтомстить?` : `🛡 ${a.attackerName} напал на твою деревню, но оборона выстояла: 0★, ${loot}.${cups}\n\nОтомстить?`;
    this.notices.push({ to: a.defender, attack: a.id, at: a.at, text });
  }

  /**
   * Сообщения бота, которые пора отправить. Ночью (22–09 по Москве) не пишем — всё уйдёт утром.
   * Одному игроку — одно сообщение: о последнем набеге и сколько всего их было, пока он не заходил.
   */
  takeNotices(): VillageNotice[] {
    const now = this.d.now();
    if (!this.notices.length || isQuiet(now)) return [];
    const byTo = new Map<string, VillageNotice[]>();
    for (const n of this.notices) {
      if (now - n.at >= NOTICE_TTL || this.notifyOff.has(n.to) || this.d.botBlocked(n.to)) continue;
      if (!byTo.has(n.to)) byTo.set(n.to, []);
      if (!byTo.get(n.to)!.some((x) => x.attack === n.attack)) byTo.get(n.to)!.push(n);
    }
    this.notices = [];
    this.save();
    return [...byTo.values()].map((list) => {
      const last = list.sort((x, y) => x.at - y.at)[list.length - 1];
      return list.length > 1 ? { ...last, text: `${last.text}\n\nВсего ${list.length} ${plural(list.length, 'набег', 'набега', 'набегов')}, пока тебя не было.` } : last;
    });
  }

  /** Игрок попросил удалить свои данные: деревня, кубки и набеги на него пропадают, в чужих журналах — без имени. */
  forget(id: string): void {
    this.villages.delete(id);
    this.notifyOff.delete(id);
    this.notices = this.notices.filter((n) => n.to !== id);
    this.attacks = this.attacks.filter((a) => a.defender !== id && !(a.attacker === id && a.bot));
    for (const a of this.attacks) {
      if (a.attacker !== id) continue;
      a.attacker = '';
      a.attackerName = DELETED_NAME;
    }
    for (const [k, l] of this.locks) if (l.attacker === id || l.target === id) this.locks.delete(k);
    this.finds.delete(id);
    this.skipped.delete(id);
    this.save();
  }

  /** Гость вошёл через Telegram: деревня переезжает, если у аккаунта её ещё нет. */
  adopt(id: string, guestId: string): void {
    const g = this.villages.get(guestId);
    if (!g || this.villages.has(id)) return;
    this.villages.set(id, { ...g, id });
    this.villages.delete(guestId);
    for (const a of this.attacks) {
      if (a.attacker === guestId) a.attacker = id;
      if (a.defender === guestId) a.defender = id;
    }
    this.save();
  }

  private prune(now: number): void {
    this.attacks = this.attacks.filter((a) => now - a.at < KEEP_MS);
  }

  flush(): void {
    if (!this.file || !this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify({ villages: [...this.villages.values()], attacks: this.attacks, notices: this.notices, notifyOff: [...this.notifyOff] }));
    renameSync(`${this.file}.tmp`, this.file);
  }

  private save(): void {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), 2000);
  }
}
