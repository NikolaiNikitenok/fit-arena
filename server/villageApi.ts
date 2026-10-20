// Запросы набегов на деревни: POST /api/village/{find,revenge,attack,inbox,notify,top}, GET /api/village/top.
// Кто спрашивает, решает index.ts (подпись Telegram; без токена бота — гость для разработки).
import { isFail, type VillageStore } from './villages';

export interface VillageMe {
  id: string;
  name: string;
}

export function villageApi(v: VillageStore, path: string, me: VillageMe | null, body: Record<string, unknown>): { status: number; body: unknown } {
  if (path === '/api/village/top') return { status: 200, body: { top: v.top(me?.id), me: me ? v.me(me.id) : null } };
  if (!me) return { status: 401, body: { error: 'Набеги — только в Telegram' } };
  const out = <T>(r: T | { error: string; status: number }) => (isFail(r) ? { status: r.status, body: { error: r.error } } : { status: 200, body: r });
  switch (path) {
    case '/api/village/find':
      return out(v.find(me.id, me.name));
    case '/api/village/revenge':
      return out(v.revenge(me.id, me.name, String(body.attackId ?? '')));
    case '/api/village/attack':
      return out(v.submit(me.id, body));
    case '/api/village/inbox':
      return { status: 200, body: v.inbox(me.id, me.name) };
    case '/api/village/notify':
      v.setNotify(me.id, body.on !== false);
      return { status: 200, body: v.me(me.id) };
  }
  return { status: 404, body: { error: 'not found' } };
}
