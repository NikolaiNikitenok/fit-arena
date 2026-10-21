// «Чёрный список» в настройках: кого заблокировал игрок, и кнопка снять блок.
import { useEffect, useState } from 'react';
import type { BlockedView } from '../../shared/moderation';
import { moderationApi } from './api';
import { Sheet } from '../Sheet';

export function BlackListRow() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="toggle-row">
        <div>
          <div className="toggle-title">Чёрный список</div>
          <div className="muted">Игроки, чьи сообщения ты не видишь. Они не могут звать тебя в друзья и на дуэль.</div>
        </div>
        <button className="small-btn ghost" onClick={() => setOpen(true)}>
          Открыть
        </button>
      </div>
      {open && <BlackListSheet onClose={() => setOpen(false)} />}
    </>
  );
}

export function BlackListSheet({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<BlockedView[] | null | 'error'>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    moderationApi
      .state()
      .then((r) => setList(r.blocked))
      .catch(() => setList('error'));
  }, []);
  const unblock = (id: string) => {
    setBusy(id);
    moderationApi
      .unblock(id)
      .then((r) => setList(r.blocked))
      .catch(() => null)
      .finally(() => setBusy(null));
  };
  return (
    <Sheet onClose={onClose}>
      <div className="level-title">Чёрный список</div>
      {list === null ? (
        <div className="muted center">Загружаю…</div>
      ) : list === 'error' ? (
        <div className="muted center">Чёрный список работает, когда игра открыта из Telegram</div>
      ) : list.length === 0 ? (
        <div className="muted center">Здесь пусто. Заблокировать игрока можно, нажав на его сообщение в чате клана или на него в списке друзей.</div>
      ) : (
        <div className="friend-list">
          {list.map((b) => (
            <div key={b.id} className="friend blocked-row">
              <div className="friend-main">
                <span className="friend-name">{b.name}</span>
                <span className="muted">в списке с {new Date(b.at).toLocaleDateString('ru', { day: 'numeric', month: 'long' })}</span>
              </div>
              <button className="small-btn ghost" disabled={busy === b.id} onClick={() => unblock(b.id)}>
                Разблокировать
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
