// Баланс с сервера (shared/balance.ts): берём сохранённый с прошлого запуска сразу,
// а свежий — запросом при старте. Нет сети — играем с тем, что было (или по умолчанию).
import { setBalance } from '../shared/balance';

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
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    // Сервер недоступен — остаёмся на прежних.
  }
}
