// Открыть профиль игрока откуда угодно (топы, лента, клан, друзья): лист профиля живёт один, в App.
import { useEffect, useState } from 'react';
import type { ProfileRef } from './api';

type Listener = (r: ProfileRef | null) => void;
const listeners = new Set<Listener>();

export function openProfile(r: ProfileRef): void {
  for (const l of listeners) l(r);
}

export function closeProfile(): void {
  for (const l of listeners) l(null);
}

/** Какой профиль сейчас открыт (для хоста в App). */
export function useOpenProfile(): ProfileRef | null {
  const [ref, setRef] = useState<ProfileRef | null>(null);
  useEffect(() => {
    listeners.add(setRef);
    return () => void listeners.delete(setRef);
  }, []);
  return ref;
}

// Лента открывается с главной (src/game/Adventure.tsx), а из профиля — «Все посты» тоже ведут в неё.
export type FeedOpen = { author?: string; post?: string; compose?: boolean };
type FeedListener = (q: FeedOpen) => void;
const feedListeners = new Set<FeedListener>();
// Запрос ждёт, пока экран приключения (он показывает ленту) не заберёт его: из вкладки дуэли App сначала
// переключается на главную.
let pending: FeedOpen | null = null;
export function openFeed(q: FeedOpen = {}): void {
  pending = q;
  for (const l of feedListeners) l(q);
}
export function takeFeedRequest(): FeedOpen | null {
  const q = pending;
  pending = null;
  return q;
}
export function onOpenFeed(l: FeedListener): () => void {
  feedListeners.add(l);
  return () => void feedListeners.delete(l);
}
