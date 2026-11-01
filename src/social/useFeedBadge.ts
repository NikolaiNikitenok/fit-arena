// Точка на кнопке «Лента»: у тех, на кого я подписан, есть пост новее, чем я последний раз открывал ленту.
import { useEffect, useState } from 'react';
import { socialApi } from './api';

const KEY = 'fit-arena-feed-seen';
const EVERY_MS = 5 * 60_000;
let cache: { at: number; latest: number } | null = null;

const seenAt = (): number => {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
};

export function markFeedSeen(): void {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Без хранилища точка просто погаснет до перезапуска.
  }
  if (cache) cache = { ...cache, latest: 0 };
}

export function useFeedBadge(): boolean {
  const [latest, setLatest] = useState(cache?.latest ?? 0);
  useEffect(() => {
    if (cache && Date.now() - cache.at < EVERY_MS) return;
    socialApi
      .badge()
      .then((r) => {
        cache = { at: Date.now(), latest: r.latest };
        setLatest(r.latest);
      })
      .catch(() => {
        cache = { at: Date.now(), latest: 0 };
      });
  }, []);
  return latest > seenAt();
}
