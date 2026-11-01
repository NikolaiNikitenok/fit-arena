// «Удалить мои данные» из настроек: стираем всё, что сервер знает об игроке.
// Профиль дуэлей, копию прогресса и настройки бота, клан (выход и имя в чате), друзей,
// анонимные следы в статистике, деревню для набегов (кубки, щит, набеги на него; в чужих журналах — без имени). Семейный сайт (server/family.ts) хранит свои данные сам.
import type { CityStore } from './cities';
import type { ClanStore } from './clans';
import type { FriendStore } from './friends';
import type { SaveStore } from './saves';
import type { Store } from './store';
import type { Telemetry } from './telemetry';
import type { VillageStore } from './villages';

export interface DeleteDeps {
  store: Pick<Store, 'forget'>;
  saves: Pick<SaveStore, 'forget'>;
  clans: Pick<ClanStore, 'clanOf' | 'leave' | 'save'>;
  friends: Pick<FriendStore, 'forget'>;
  telemetry: Pick<Telemetry, 'forget'>;
  villages: Pick<VillageStore, 'forget'>;
  // Город в топе городов.
  cities?: Pick<CityStore, 'forget'>;
  // «Приведи друга» и пробный Pro: кто кого позвал.
  referrals?: { forget: (id: string) => void };
  trials?: { forget: (id: string) => void };
  // Лента: посты с фото, подписки, респекты.
  feed?: { forget: (id: string) => void };
  // Копия фото профиля Telegram для ленты.
  avatars?: { forget: (id: string) => void };
}

export const DELETED_NAME = 'Удалённый игрок';

/** Удалить игрока. Возвращает клан, из которого он вышел (чтобы разослать новый состав). */
export function deletePlayer(d: DeleteDeps, id: string, now: number) {
  const clan = d.clans.clanOf(id);
  if (clan) {
    // Сообщения остаются в истории клана, но без имени и id автора.
    const name = clan.members.find((m) => m.id === id)?.name;
    for (const m of clan.chat) {
      if (m.from === id) {
        m.from = '';
        m.name = DELETED_NAME;
      }
      // «Аня вступила в клан» и другие системные строки с именем.
      if (m.system && name && m.text.includes(name)) m.text = m.text.split(name).join(DELETED_NAME);
    }
  }
  const left = clan ? d.clans.leave(id, now) : null;
  if (clan) {
    // Системная строка «X покинул клан» тоже без имени.
    const last = left?.chat[left.chat.length - 1];
    if (last?.system) Object.assign(last, { text: `${DELETED_NAME} покинул клан`, key: '{0} покинул клан', vars: { 0: DELETED_NAME } });
    d.clans.save();
  }
  d.store.forget(id);
  d.saves.forget(id);
  d.friends.forget(id);
  d.telemetry.forget(id);
  d.villages.forget(id);
  d.cities?.forget(id);
  d.referrals?.forget(id);
  d.trials?.forget(id);
  d.feed?.forget(id);
  d.avatars?.forget(id);
  return { clan: left };
}
