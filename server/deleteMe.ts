// «Удалить мои данные» из настроек: стираем всё, что сервер знает об игроке.
// Профиль дуэлей, копию прогресса и настройки бота, клан (выход и имя в чате), друзей,
// анонимные следы в статистике. Семейный сайт (server/family.ts) хранит свои данные сам.
import type { ClanStore } from './clans';
import type { FriendStore } from './friends';
import type { SaveStore } from './saves';
import type { Store } from './store';
import type { Telemetry } from './telemetry';

export interface DeleteDeps {
  store: Pick<Store, 'forget'>;
  saves: Pick<SaveStore, 'forget'>;
  clans: Pick<ClanStore, 'clanOf' | 'leave' | 'save'>;
  friends: Pick<FriendStore, 'forget'>;
  telemetry: Pick<Telemetry, 'forget'>;
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
    if (last?.system) last.text = `${DELETED_NAME} покинул клан`;
    d.clans.save();
  }
  d.store.forget(id);
  d.saves.forget(id);
  d.friends.forget(id);
  d.telemetry.forget(id);
  return { clan: left };
}
