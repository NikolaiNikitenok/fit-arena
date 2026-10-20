// Отчёт о тренировке для семейного сайта: сервер Арены проверяет подпись Telegram и пересылает дальше.
import type { Exercise } from './repCounter';
import { tg } from './telegram';

export function reportAdventure(reps: Partial<Record<Exercise, number>>): void {
  if (!tg?.initData) return;
  const base = `adv-${crypto.randomUUID()}`;
  const items = Object.entries(reps)
    .filter(([, n]) => n && n > 0)
    .map(([exercise, n]) => ({ id: `${base}-${exercise}`.slice(0, 64), kind: 'adventure', exercise, reps: n }));
  if (!items.length) return;
  fetch('/api/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: tg.initData, items }),
    keepalive: true,
  }).catch(() => {});
}

/** Тренировка в зале сделана: в раздел «Спорт» семейного сайта уходят время, объём, рекорды и упражнения. */
export function reportGym(gym: { id: string; title: string; minutes: number; volume_kg: number; records: number; exercises: { name: string; sets: number }[] }): void {
  if (!tg?.initData) return;
  fetch('/api/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: tg.initData, gym: { ...gym, id: `gym-${gym.id}`.slice(0, 64) } }),
    keepalive: true,
  }).catch(() => {});
}
