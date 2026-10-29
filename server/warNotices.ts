// Сообщения бота о войне кланов. Как и raidNotices: чистая функция, по кланам и времени решает,
// кому и что написать; разосланное клан отмечает через ClanStore.markNotice под ключом выходных
// (тот же ключ, что у рейда, виды сообщений свои, так что они не путаются).
//   пары составлены (пятница 19:00) — «Ваш соперник — клан …»;
//   воскресенье 17:00 — напоминание, если клан отстаёт (за два часа до рейдового, чтобы не слать разом);
//   понедельник — итог и личная награда.
// Ночью (22–09 по Москве) не пишем: накопленное уйдёт утром.
import { WAR_GHOST, WAR_MIN_POINTS, WAR_REPS_PER_DAY, dayMsk, warEndOf, warReward, warStartOf } from '../shared/war';
import type { Clan, ClanStore } from './clans';
import { num, type RaidNotice, wordL } from './raidNotices';
import { type Lang, tl } from '../src/i18n';
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
const clanName = (w: NonNullable<Clan['war']>, l: Lang) => (w.opp === 'ghost' ? tl(l, WAR_GHOST.name) : tl(l, 'клан «{0}» [{1}]', { 0: w.oppLook.name, 1: w.oppLook.tag }));
const oppOf = (w: NonNullable<Clan['war']>, l: Lang) => (w.opp === 'ghost' ? tl(l, 'Дружины Князя Дивана') : tl(l, 'клана «{0}»', { 0: w.oppLook.name }));

// langOf — на каком языке писать каждому (выбран в игре).
export function warNotices(store: ClanStore, now: number, skip: (playerId: string) => boolean = () => false, langOf: (playerId: string) => Lang = () => 'ru'): RaidNotice[] {
  const out: RaidNotice[] = [];
  const hourMsk = new Date(now + MSK).getUTCHours();
  if (hourMsk < QUIET_UNTIL || hourMsk >= QUIET_FROM) return out;
  for (const c of store.all()) {
    const w = c.war;
    if (!w) continue;
    // Пишем только тем, кто в составе войны и может получить сообщение в Telegram.
    const members = c.members.filter((m) => !m.id.startsWith('guest:') && m.id in w.roster && !skip(m.id));
    if (!members.length) continue;
    const push = (id: string, kind: WarNoticeKind, text: string, button: string) =>
      out.push({ chatId: Number(id.slice(3)), playerId: id, clanId: c.id, key: w.key, kind, text, button });
    const start = warStartOf(w.key);
    const end = warEndOf(w.key);
    const remindAt = end - WAR_REMIND_BEFORE;

    if (!w.result && now < remindAt && !sent(c, w.key, 'warPair')) {
      const o = w.oppLook;
      for (const m of members) {
        const l = langOf(m.id);
        const who =
          w.opp === 'ghost'
            ? tl(l, '⚔️ Война кланов! Ваш соперник — {0}: в эти выходные настоящего клана для пары не нашлось, и Князь Диван привёл своих бойцов — ровно {1}, как у вас.', { 0: tl(l, WAR_GHOST.name), 1: w.counted })
            : tl(l, '⚔️ Война кланов! Ваш соперник — клан «{0}» [{1}], {2} уровень, {3} {4}.', { 0: o.name, 1: o.tag, 2: o.level, 3: o.members, 4: wordL(l, o.members, ['участник', 'участника', 'участников']) });
        const when = now < start ? tl(l, 'Бой — с субботы 00:00 до конца воскресенья') : tl(l, 'Бой уже идёт и продлится до конца воскресенья');
        const text = `${who}\n\n${when}. ${tl(l, 'Каждый повтор в любом режиме — очко клана «{0}» (до {1} в день от каждого). В зачёт идут {2} лучших с каждой стороны.', { 0: c.name, 1: WAR_REPS_PER_DAY, 2: w.counted })}`;
        push(m.id, 'warPair', text, tl(l, 'К войне'));
      }
    }

    if (!w.result && now >= remindAt && now < end - REMIND_LATEST && !sent(c, w.key, 'warRemind')) {
      const s = warScores(store, c, now);
      if (s.us < s.them) {
        const hours = Math.ceil((end - now) / HOUR);
        const gap = s.them - s.us;
        for (const m of members) {
          if ((w.days[dayMsk(now)]?.[m.id] ?? 0) >= WAR_REPS_PER_DAY) continue;
          const l = langOf(m.id);
          push(
            m.id,
            'warRemind',
            tl(l, '⏳ До конца войны {0} {1}, а клан «{2}» отстаёт на {3} {4}: {5} : {6}.\n\nСоперник — {7}. Пара подходов сейчас — и счёт может перевернуться!', { 0: hours, 1: wordL(l, hours, ['час', 'часа', 'часов']), 2: c.name, 3: num(gap), 4: wordL(l, gap, ['повтор', 'повтора', 'повторов']), 5: num(s.us), 6: num(s.them), 7: clanName(w, l) }),
            tl(l, 'К войне'),
          );
        }
      }
    }

    if (w.result && now >= end && now < end + RESULT_FOR && !sent(c, w.key, 'warResult')) {
      const vs = `${num(w.us ?? 0)} : ${num(w.them ?? 0)}`;
      const head = (l: Lang) =>
        w.result === 'win'
          ? tl(l, '🏆 Победа! Клан «{0}» выиграл войну у {1} — {2}.', { 0: c.name, 1: oppOf(w, l), 2: vs })
          : w.result === 'draw'
            ? tl(l, '🤝 Ничья! Война клана «{0}» против {1} — {2}.', { 0: c.name, 1: oppOf(w, l), 2: vs })
            : tl(l, '🛡 Война проиграна — {0}. Соперник ({1}) в этот раз был сильнее. В следующие выходные — реванш!', { 0: vs, 1: clanName(w, l) });
      const mvp = (l: Lang) => (w.mvp ? `\n${tl(l, 'Лучший боец — {0} ({1}).', { 0: w.roster[w.mvp], 1: num(w.points[w.mvp] ?? 0) })}` : '');
      for (const m of members) {
        const l = langOf(m.id);
        const mine = w.points[m.id] ?? 0;
        const r = warReward(w.result, mine, w.mvp === m.id);
        const me = r
          ? tl(l, 'Твои повторы: {0}{1}\n🎁 Награда ждёт в приложении: {2} {3}{4}.', { 0: num(mine), 1: w.mvp === m.id ? tl(l, ' — ты MVP!') : '', 2: num(r.coins), 3: wordL(l, r.coins, ['монета', 'монеты', 'монет']), 4: r.chest ? tl(l, ' и сундук') : '' })
          : mine > 0
            ? tl(l, 'Твои повторы: {0}. Для награды нужно хотя бы {1} — в следующий раз получится!', { 0: num(mine), 1: WAR_MIN_POINTS })
            : tl(l, 'Ты в этот раз не воевал. Следующая война — на выходных!');
        push(m.id, 'warResult', `${head(l)}${mvp(l)}\n\n${me}`, r ? tl(l, 'Забрать награду') : tl(l, 'Открыть клан'));
      }
    }
  }
  return out;
}
