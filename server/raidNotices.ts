// Сообщения бота о рейде клана. Чистая функция: по кланам и времени решает, кому и что написать.
// Расписание по Москве:
//   суббота 10:00 (или открытие рейда, если оно не в полночь) — «Босс проснулся»;
//   воскресенье 19:00 — напоминание тем, у кого остались атаки на сегодня;
//   босс повержен — итог всем участникам сразу; рейд закончился без победы — итог в понедельник.
// Что уже ушло, клан помнит в notices[ключ рейда], так что после перезапуска сервера повторов нет.
import { clanLevel, clanPerks } from '../shared/clanLevel';
import { dayOf, raidBoss, raidHp, raidReward, raidWindow } from '../shared/raid';
import type { Clan } from './clans';
import { forms, type Lang, tl } from '../src/i18n';

export type RaidNoticeKind = 'start' | 'remind' | 'kill' | 'summary';

export interface RaidNotice {
  chatId: number;
  playerId: string;
  clanId: string;
  // Ключ рейда (дата его субботы): по нему клан запоминает отправленное.
  key: string;
  // Виды войны кланов — из server/warNotices.ts.
  kind: RaidNoticeKind | 'warPair' | 'warRemind' | 'warResult';
  text: string;
  // Надпись на кнопке, открывающей вкладку клана в приложении.
  button: string;
}

const HOUR = 3_600_000;
const MSK = 3 * HOUR;
// Утреннее сообщение, если рейд открылся в полночь: будить в 00:00 не стоит.
export const RAID_START_HOUR = 10;
// Напоминание — за 5 часов до конца рейда (воскресенье 19:00), но не позже чем за полчаса.
export const RAID_REMIND_BEFORE = 5 * HOUR;
const REMIND_LATEST = HOUR / 2;
// Итог рейда шлём только в первые сутки: старые рейды после долгого простоя не вспоминаем.
const SUMMARY_FOR = 24 * HOUR;

/** Когда утром писать о начале рейда: открытие, но не раньше 10:00 по Москве того дня. */
export function raidStartNoticeAt(start: number): number {
  const d = new Date(start + MSK);
  const morning = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), RAID_START_HOUR) - MSK;
  return Math.max(start, morning);
}

/** Конец рейда по его ключу (дата субботы). */
export const raidEndOf = (key: string): number => raidWindow(Date.parse(`${key}T12:00:00+03:00`)).end;

export function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
}

/** 12345 → «12 345» с неразрывным пробелом. */
export const num = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');

const MEDALS = ['🥇', '🥈', '🥉'];

const tgMembers = (c: Clan, skip: (id: string) => boolean) => c.members.filter((m) => !m.id.startsWith('guest:') && !skip(m.id));
const sent = (c: Clan, key: string, kind: RaidNoticeKind) => !!c.notices?.[key]?.includes(kind);

/**
 * Кому что написать сейчас. skip — игроки, которые выключили уведомления или остановили бота.
 * Функция ничего не меняет: отправитель сам отмечает разосланное через ClanStore.markNotice.
 */
// Тихие часы по Москве.
const QUIET_FROM = 22;
const QUIET_UNTIL = 9;

/** Слово при числе на языке игрока: ru — по трём формам, en — по двум. */
export const wordL = (l: Lang, n: number, f: [string, string, string]) => forms(n, [tl(l, f[0]), tl(l, f[1]), tl(l, f[2])], l);

// langOf — на каком языке писать каждому (выбран в игре).
export function raidNotices(clans: Clan[], now: number, skip: (playerId: string) => boolean = () => false, langOf: (playerId: string) => Lang = () => 'ru'): RaidNotice[] {
  const out: RaidNotice[] = [];
  // Ночью не пишем: всё накопленное уйдёт утром (итоги ждут до 24 часов).
  const hourMsk = new Date(now + MSK).getUTCHours();
  if (hourMsk < QUIET_UNTIL || hourMsk >= QUIET_FROM) return out;
  const w = raidWindow(now);
  for (const c of clans) {
    const members = tgMembers(c, skip);
    if (!members.length) continue;
    const perks = clanPerks(clanLevel(c.xp ?? 0).level);
    const push = (m: { id: string }, key: string, kind: RaidNoticeKind, text: string, button: string) =>
      out.push({ chatId: Number(m.id.slice(3)), playerId: m.id, clanId: c.id, key, kind, text, button });

    // Текущий рейд: начало и напоминание.
    if (w.active) {
      const r = c.raid?.key === w.key ? c.raid : null;
      const boss = raidBoss(w.key);
      const level = r?.level ?? c.raidLevel;
      const hpMax = r?.hpMax ?? raidHp(c.members.length, c.raidLevel);
      const dealt = r ? Object.values(r.damage).reduce((x, y) => x + y, 0) : 0;
      const remindAt = w.end - RAID_REMIND_BEFORE;
      if (!r?.killedAt && now >= raidStartNoticeAt(w.start) && now < remindAt && !sent(c, w.key, 'start')) {
        for (const m of members) {
          const l = langOf(m.id);
          const text =
            tl(l, '🐉 {0}, рейд {1} уровня\n{2}.\n\n', { 0: tl(l, boss.name), 1: level, 2: tl(l, boss.title) }) +
            tl(l, 'Босс проснулся, клан «{0}» ждёт! У тебя {1} {2} в день до конца воскресенья: минута повторов — и каждый повтор бьёт по боссу.', { 0: c.name, 1: perks.attacks, 2: wordL(l, perks.attacks, ['атака', 'атаки', 'атак']) });
          push(m, w.key, 'start', text, tl(l, 'В бой'));
        }
      }
      if (!r?.killedAt && now >= remindAt && now < w.end - REMIND_LATEST && !sent(c, w.key, 'remind')) {
        const hours = Math.ceil((w.end - now) / HOUR);
        const hpLeft = Math.max(1, Math.round((100 * (hpMax - dealt)) / hpMax));
        for (const m of members) {
          const left = Math.max(0, perks.attacks - (r?.attacks[m.id]?.[dayOf(now)] ?? 0));
          if (!left) continue;
          const l = langOf(m.id);
          push(
            m,
            w.key,
            'remind',
            tl(l, '⏳ До конца рейда {0} {1}, у тебя ещё {2} {3}.\n\n{4} держится: у него {5}% здоровья. Клан «{6}» рассчитывает на тебя!', { 0: hours, 1: wordL(l, hours, ['час', 'часа', 'часов']), 2: left, 3: wordL(l, left, ['атака', 'атаки', 'атак']), 4: tl(l, boss.name), 5: hpLeft, 6: c.name }),
            tl(l, 'В бой'),
          );
        }
      }
    }

    // Итог последнего рейда: сразу после победы или после конца выходных.
    const r = c.raid;
    if (!r) continue;
    const end = raidEndOf(r.key);
    const kind: RaidNoticeKind | null = r.killedAt ? (now - r.killedAt < SUMMARY_FOR ? 'kill' : null) : now >= end && now < end + SUMMARY_FOR ? 'summary' : null;
    if (!kind || sent(c, r.key, kind)) continue;
    const total = Object.values(r.damage).reduce((x, y) => x + y, 0);
    if (total <= 0) continue;
    const boss = raidBoss(r.key);
    const names = new Map(c.members.map((m) => [m.id, m.name]));
    const best = Object.entries(r.damage)
      .filter(([, d]) => d > 0)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 3);
    const top = (l: Lang) => best.map(([id, d], i) => `${MEDALS[i]} ${names.get(id) ?? tl(l, 'Бывший участник')} — ${num(d)}`).join('\n');
    const killed = !!r.killedAt;
    const head = (l: Lang) =>
      killed
        ? tl(l, '🏆 {0} повержен! Клан «{1}» победил босса {2} уровня.', { 0: tl(l, boss.name), 1: c.name, 2: r.level }) + (r.recent.length ? tl(l, ' Последний удар — {0}.', { 0: r.recent[r.recent.length - 1].name }) : '')
        : tl(l, '🛡 Рейд закончился. {0} устоял: клан «{1}» снял {2}% здоровья. В следующие выходные — новая попытка!', { 0: tl(l, boss.name), 1: c.name, 2: Math.min(99, Math.floor((100 * total) / r.hpMax)) });
    for (const m of members) {
      const l = langOf(m.id);
      const mine = r.damage[m.id] ?? 0;
      const reward = raidReward(mine, r.hpMax, r.members, killed, perks.raidCoins);
      const me =
        mine > 0
          ? tl(l, 'Твой урон: {0} — {1}.\n🎁 Награда ждёт в приложении: {2} {3}{4}. Открой клан и забери её.', { 0: num(mine), 1: tl(l, reward.tier.name), 2: num(reward.coins), 3: wordL(l, reward.coins, ['монета', 'монеты', 'монет']), 4: reward.chest ? tl(l, ' и сундук') : '' })
          : tl(l, 'Ты в этот раз не бил босса. В субботу — новый рейд, приходи!');
      push(m, r.key, kind, `${head(l)}\n\n${tl(l, 'Весь урон: {0} из {1}\nЛучшие:', { 0: num(total), 1: num(r.hpMax) })}\n${top(l)}\n\n${me}`, mine > 0 ? tl(l, 'Забрать награду') : tl(l, 'Открыть клан'));
    }
  }
  return out;
}
