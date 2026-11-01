// Баланс с сервера (shared/balance.ts): берём сохранённый с прошлого запуска сразу,
// а свежий — запросом при старте. Нет сети — играем с тем, что было (или по умолчанию).
import { setBalance } from '../shared/balance';
import { track } from './telemetry';

const KEY = 'fit-arena-balance';

try {
  const saved = localStorage.getItem(KEY);
  if (saved) setBalance(JSON.parse(saved));
} catch {
  // Нет хранилища или битая запись — значения по умолчанию.
}

export async function loadBalance(): Promise<void> {
  try {
    const r = await fetch('/api/balance', { cache: 'no-store' });
    if (!r.ok) return;
    const b = setBalance(await r.json());
    // На каком балансе играет человек: сравнивать цифры до и после правки (/balance в боте).
    track('balance', `l${Math.round(b.earlyLoot * 100)}d${Math.round(b.dungeonLoot * 100)}h${Math.round(b.enemyHp * 100)}c${Math.round(b.coins * 100)}`);
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    // Сервер недоступен — остаёмся на прежних.
  }
}
