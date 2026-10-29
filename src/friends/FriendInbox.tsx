// Вызов от друга, пока игра открыта: карточка сверху с «Принять» и «Отказаться».
// Сервер спрашиваем раз в 10 секунд, пока приложение на экране; заодно друзья видят, что мы в сети.
import { useEffect, useState } from 'react';
import type { ChallengeView } from '../../shared/protocol';
import { Swords } from '../icons';
import { EXERCISE_LABELS } from '../repCounter';
import { hapticRep } from '../telegram';
import { friendsApi, NotTelegram } from './api';
import { t } from '../i18n';

const POLL_MS = 10_000;

export function FriendInbox({ paused, onAccept }: { paused: boolean; onAccept: (c: ChallengeView) => void }) {
  const [list, setList] = useState<ChallengeView[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (paused) return;
    let stop = false;
    const poll = () => {
      if (stop || document.visibilityState !== 'visible') return;
      friendsApi
        .inbox()
        .then((r) => !stop && setList(r.challenges))
        .catch((e) => {
          // Гость без Telegram: друзей нет, больше не спрашиваем.
          if (e instanceof NotTelegram) stop = true;
        });
    };
    poll();
    const id = setInterval(() => {
      setNow(Date.now());
      poll();
    }, POLL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [paused]);

  const c = list.find((x) => !hidden.has(x.id) && x.expiresAt > now);
  useEffect(() => {
    if (c) hapticRep();
  }, [c?.id]);
  if (!c || paused) return null;

  const hide = () => setHidden((h) => new Set(h).add(c.id));
  const minutes = Math.max(1, Math.ceil((c.expiresAt - now) / 60_000));
  return (
    <div className="challenge-card" role="alertdialog" aria-label={t('Вызов на дуэль')}>
      <div className="challenge-icon">
        <Swords size={22} />
      </div>
      <div className="challenge-text">
        <b>
          <span className={c.pro ? 'pro-name' : ''}>{c.name}</span> {t('вызывает тебя на дуэль!')}
        </b>
        <span className="muted">
          {t('{0}, кто больше за минуту · ещё {1} мин', { 0: EXERCISE_LABELS[c.exercise], 1: minutes })}
        </span>
      </div>
      <div className="challenge-actions">
        <button className="small-btn ghost" onClick={() => (hide(), friendsApi.decline(c.id).catch(() => null))}>
          {t('Отказаться')}
        </button>
        <button className="small-btn" onClick={() => (hide(), onAccept(c))}>
          {t('Принять')}
        </button>
      </div>
    </div>
  );
}
