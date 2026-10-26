// Запросы модерации: POST /api/moderation, /api/moderation/{block,unblock,report}, и команды админов в боте.
// Всё, что нужно от остального сервера, приходит в deps — как в server/friendsApi.ts.
//
// Жалоба: бот пишет каждому админу текст жалобы и команды, которые можно нажать прямо в сообщении:
//   /mute_123_1d, /mute_123_7d, /mute_123_forever — запретить игроку tg:123 писать в чат на сутки, неделю, навсегда;
//   /unmute_123 — снять запрет; /reports — последние жалобы.
import { type ModerationReply, muteText, REPORT_REASONS, type ReportReason, type ReportWhere } from '../shared/moderation';
import type { ModerationStore } from './moderation';
import type { Report, ReportStore } from './reports';

export interface ModerationDeps {
  /** Аккаунт входа tg:123 (server/accounts.ts): привязанный вход ведёт в аккаунт с другим id. */
  account?: (login: string) => string;
  mod: ModerationStore;
  reports: ReportStore;
  isAdmin: (id: string) => boolean;
  // Имя игрока, если сервер его знает (друзья, клан).
  nameOf: (id: string) => string | undefined;
  // Сообщение чата клана, которое видит игрок me: на него и жалуются.
  chatMessage: (me: string, msgId: number) => { from: string; name: string; text: string; clan: string } | undefined;
  // Игрок заблокировал друга: дружба и заявки пропадают.
  unfriend: (me: string, other: string) => void;
  // Написать всем админам в бота.
  notifyAdmins: (text: string) => void;
  // Запрет поменялся: обновить экран клана игрока.
  muted: (id: string) => void;
}

type Reply = { status: number; body: unknown };

const MUTES: Record<string, number> = { '1h': 3_600_000, '1d': 24 * 3_600_000, '24h': 24 * 3_600_000, '7d': 7 * 24 * 3_600_000, forever: Infinity };

const tgNum = (id: string) => (/^tg:\d+$/.test(id) ? id.slice(3) : null);
const quote = (s: string) => s.replace(/\s+/g, ' ').slice(0, 300);

/** Текст жалобы для админов. */
export function reportText(r: Report, count: number, muted: number): string {
  const where = r.where === 'chat' ? `чат клана${r.clan ? ` «${r.clan}»` : ''}` : r.where === 'clan' ? `участник клана${r.clan ? ` «${r.clan}»` : ''}` : 'друзья';
  const lines = [
    `🚩 Жалоба: ${REPORT_REASONS[r.reason].toLowerCase()}`,
    `На: ${r.targetName} (${r.target})${count > 1 ? ` — жалоб за неделю: ${count}` : ''}`,
    `От: ${r.fromName} (${r.from})`,
    `Где: ${where}`,
  ];
  if (r.text) lines.push(`Сообщение: «${quote(r.text)}»`);
  if (muted) lines.push(`Сейчас: ${muteText(muted).replace('Ты не можешь', 'не может')}`);
  const n = tgNum(r.target);
  if (n) lines.push('', `Запретить писать в чат: /mute_${n}_1d · /mute_${n}_7d · /mute_${n}_forever`, `Снять запрет: /unmute_${n}`);
  return lines.join('\n');
}

function state(d: ModerationDeps, me: string): ModerationReply {
  return { blocked: [...d.mod.blockedBy(me)].reverse(), mutedUntil: d.mod.mutedUntil(me) };
}

/** Один запрос модерации от игрока me (уже проверенного). */
export function moderationApi(d: ModerationDeps, path: string, me: { id: string; name: string }, body: Record<string, unknown>): Reply {
  const ok = (extra: object = {}): Reply => ({ status: 200, body: { ...state(d, me.id), ...extra } });
  const other = typeof body.id === 'string' ? body.id.slice(0, 64) : '';
  switch (path) {
    case '/api/moderation':
      return ok();
    case '/api/moderation/block': {
      const name = d.nameOf(other) ?? (typeof body.name === 'string' ? body.name : 'Боец');
      const err = d.mod.block(me.id, other, name);
      if (err) return ok({ error: err });
      d.unfriend(me.id, other);
      return ok({ note: `${name} в чёрном списке: его сообщений ты не увидишь, а позвать тебя он не сможет` });
    }
    case '/api/moderation/unblock':
      d.mod.unblock(me.id, other);
      return ok();
    case '/api/moderation/report': {
      const reason = (String(body.reason) in REPORT_REASONS ? String(body.reason) : 'other') as ReportReason;
      const where = (['chat', 'clan', 'friend'].includes(String(body.where)) ? String(body.where) : 'friend') as ReportWhere;
      const msg = where === 'chat' ? d.chatMessage(me.id, Number(body.msg)) : undefined;
      if (where === 'chat' && (!msg || msg.from !== other)) return ok({ error: 'Сообщение не найдено' });
      const r = d.reports.add({
        from: me.id,
        fromName: me.name,
        target: other,
        targetName: msg?.name ?? d.nameOf(other) ?? 'Боец',
        reason,
        where,
        text: msg?.text,
        clan: msg?.clan,
      });
      if (typeof r === 'string') return ok({ error: r });
      d.notifyAdmins(reportText(r.report, r.count, d.mod.mutedUntil(other)));
      return ok({ note: 'Жалоба отправлена. Спасибо, модератор посмотрит' });
    }
  }
  return { status: 404, body: { error: 'not found' } };
}

/**
 * Команда админа в боте. Возвращает ответ или null, если это не команда модерации
 * или пишет не админ (тогда бот отвечает как обычно).
 */
export function adminCommand(d: ModerationDeps, chatId: number, text: string): string | null {
  const t = text.trim();
  if (!/^\/(?:mute|unmute|reports)/.test(t) || !d.isAdmin(`tg:${chatId}`)) return null;
  const by = `tg:${chatId}`;
  const mute = /^\/mute[_\s]+(\d{1,20})[_\s]+(1h|1d|24h|7d|forever)\b/.exec(t);
  if (mute) {
    const id = d.account?.(`tg:${mute[1]}`) ?? `tg:${mute[1]}`;
    const until = d.mod.mute(id, MUTES[mute[2]], by);
    d.muted(id);
    const name = d.nameOf(id) ?? id;
    return `🔇 ${name}: ${muteText(until).replace('Ты не можешь', 'не может')}.\nСнять: /unmute_${mute[1]}`;
  }
  const unmute = /^\/unmute[_\s]+(\d{1,20})\b/.exec(t);
  if (unmute) {
    const id = d.account?.(`tg:${unmute[1]}`) ?? `tg:${unmute[1]}`;
    d.mod.mute(id, 0, by);
    d.muted(id);
    return `🔊 ${d.nameOf(id) ?? id} снова может писать в чат.`;
  }
  if (/^\/reports\b/.test(t)) {
    const list = d.reports.recent(5);
    if (!list.length) return 'Жалоб пока нет.';
    return list.map((r) => reportText(r, d.reports.countFor(r.target, 7 * 24 * 3_600_000), d.mod.mutedUntil(r.target))).join('\n\n———\n\n');
  }
  return 'Команды: /mute_ID_1d, /mute_ID_7d, /mute_ID_forever, /unmute_ID, /reports';
}
