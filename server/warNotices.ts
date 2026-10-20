// Сообщения бота о войне кланов. Как и raidNotices: чистая функция, по кланам и времени решает,
// кому и что написать; разосланное клан отмечает через ClanStore.markNotice под ключом выходных
// (тот же ключ, что у рейда, виды сообщений свои, так что они не путаются).
//   пары составлены (пятница 19:00) — «Ваш соперник — клан …»;
//   воскресенье 17:00 — напоминание, если клан отстаёт (за два часа до рейдового, чтобы не слать разом);
//   понедельник — итог и личная награда.
// Ночью (22–09 по Москве) не пишем: накопленное уйдёт утром.
import { WAR_GHOST, WAR_MIN_POINTS, WAR_REPS_PER_DAY, dayMsk, warEndOf, warReward, warStartOf } from '../shared/war';
import type { Clan, ClanStore } from './clans';
import { num, plural, type RaidNotice } from './raidNotices';
import { warScores } from './wars';

export type WarNoticeKind = 'warPair' | 'warRemind' | 'warResult';

const HOUR = 3_600_000;
const MSK = 3 * HOUR;
export const WAR_REMIND_BEFORE = 7 * HOUR;
const REMIND_LATEST = HOUR / 2;
const RESULT_FOR = 24 * HOUR;
const QUIET_FROM = 22;
const QUIET_UNTIL = 9;

const sent = (c: Clan, key: string, kind: WarNoticeKind) => !!c.notices?.[key]?.includes(kind);
const clanName = (w: NonNullable<Clan['war']>) => (w.opp === 'ghost' ? WAR_GHOST.name : `клан «${w.oppLook.name}» [${w.oppLook.tag}]`);

export function warNotices(store: ClanStore, now: number, skip: (playerId: string) => boolean = () => false): RaidNotice[] {
  const out: RaidNotice[] = [];
  const hourMsk = new Date(now + MSK).getUTCHours();
  if (hourMsk < QUIET_UNTIL || hourMsk >= QUIET_FROM) return out;
  for (const c of store.all()) {
    const w = c.war;
    if (!w) continue;
    // Пишем только тем, кто в составе войны и может получить сообщение в Telegram.
    const members = c.members.filter((m) => /^tg:\d+$/.test(m.id) && m.id in w.roster && !skip(m.id));
    if (!members.length) continue;
    const push = (id: string, kind: WarNoticeKind, text: string, button: string) =>
      out.push({ chatId: Number(id.slice(3)), playerId: id, clanId: c.id, key: w.key, kind, text, button });
    const start = warStartOf(w.key);
    const end = warEndOf(w.key);
    const remindAt = end - WAR_REMIND_BEFORE;

    if (!w.result && now < remindAt && !sent(c, w.key, 'warPair')) {
      const o = w.oppLook;
      const who =
        w.opp === 'ghost'
          ? `⚔️ Война кланов! Ваш соперник — ${WAR_GHOST.name}: в эти выходные настоящего клана для пары не нашлось, и Князь Диван привёл своих бойцов — ровно ${w.counted}, как у вас.`
          : `⚔️ Война кланов! Ваш соперник — клан «${o.name}» [${o.tag}], ${o.level} уровень, ${o.members} ${plural(o.members, 'участник', 'участника', 'участников')}.`;
      const when = now < start ? 'Бой — с субботы 00:00 до конца воскресенья' : 'Бой уже идёт и продлится до конца воскресенья';
      const text = `${who}\n\n${when}. Каждый повтор в любом режиме — очко клана «${c.name}» (до ${WAR_REPS_PER_DAY} в день от каждого). В зачёт идут ${w.counted} лучших с каждой стороны.`;
      for (const m of members) push(m.id, 'warPair', text, 'К войне');
    }

    if (!w.result && now >= remindAt && now < end - REMIND_LATEST && !sent(c, w.key, 'warRemind')) {
      const s = warScores(store, c, now);
      if (s.us < s.them) {
        const hours = Math.ceil((end - now) / HOUR);
        const gap = s.them - s.us;
        for (const m of members) {
          if ((w.days[dayMsk(now)]?.[m.id] ?? 0) >= WAR_REPS_PER_DAY) continue;
          push(
            m.id,
            'warRemind',
            `⏳ До конца войны ${hours} ${plural(hours, 'час', 'часа', 'часов')}, а клан «${c.name}» отстаёт на ${num(gap)} ${plural(gap, 'повтор', 'повтора', 'повторов')}: ${num(s.us)} : ${num(s.them)}.\n\nСоперник — ${clanName(w)}. Пара подходов сейчас — и счёт может перевернуться!`,
            'К войне',
          );
        }
      }
    }

    if (w.result && now >= end && now < end + RESULT_FOR && !sent(c, w.key, 'warResult')) {
      const vs = `${num(w.us ?? 0)} : ${num(w.them ?? 0)}`;
      const head =
        w.result === 'win'
          ? `🏆 Победа! Клан «${c.name}» выиграл войну у ${w.opp === 'ghost' ? 'Дружины Князя Дивана' : `клана «${w.oppLook.name}»`} — ${vs}.`
          : w.result === 'draw'
            ? `🤝 Ничья! Война клана «${c.name}» против ${w.opp === 'ghost' ? 'Дружины Князя Дивана' : `клана «${w.oppLook.name}»`} — ${vs}.`
            : `🛡 Война проиграна — ${vs}. Соперник (${clanName(w)}) в этот раз был сильнее. В следующие выходные — реванш!`;
      const mvp = w.mvp ? `\nЛучший боец — ${w.roster[w.mvp]} (${num(w.points[w.mvp] ?? 0)}).` : '';
      for (const m of members) {
        const mine = w.points[m.id] ?? 0;
        const r = warReward(w.result, mine, w.mvp === m.id);
        const me = r
          ? `Твои повторы: ${num(mine)}${w.mvp === m.id ? ' — ты MVP!' : ''}\n🎁 Награда ждёт в приложении: ${num(r.coins)} ${plural(r.coins, 'монета', 'монеты', 'монет')}${r.chest ? ' и сундук' : ''}.`
          : mine > 0
            ? `Твои повторы: ${num(mine)}. Для награды нужно хотя бы ${WAR_MIN_POINTS} — в следующий раз получится!`
            : 'Ты в этот раз не воевал. Следующая война — на выходных!';
        push(m.id, 'warResult', `${head}${mvp}\n\n${me}`, r ? 'Забрать награду' : 'Открыть клан');
      }
    }
  }
  return out;
}
