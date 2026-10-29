// Запросы модерации к серверу (server/moderationApi.ts): чёрный список и жалобы.
import type { ModerationReply, ReportReason, ReportWhere } from '../../shared/moderation';
import { guestId, tg, userName } from '../telegram';
import { t, tErr } from '../i18n';

async function post(path: string, body: object = {}): Promise<ModerationReply> {
  const r = await fetch(`/api/moderation${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: tg?.initData ?? '', guestId: guestId(), name: userName(), ...body }),
  });
  if (r.status === 401) throw new Error(t('Только в Telegram'));
  if (!r.ok) throw new Error(String(r.status));
  return tErr(await r.json());
}

export const moderationApi = {
  state: () => post(''),
  block: (id: string, name: string) => post('/block', { id, name }),
  unblock: (id: string) => post('/unblock', { id }),
  report: (q: { id: string; reason: ReportReason; where: ReportWhere; msg?: number }) => post('/report', q),
};
