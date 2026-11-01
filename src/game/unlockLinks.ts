// Разделы, открытые на этот запуск ссылкой: приглашение в клан, на дуэль, в друзья или кнопка бота.
import { clanInviteCode, friendInviteCode, inviteCode, startTab } from '../telegram';
import type { Feature } from './unlocks';

let cached: Feature[] | null = null;

export function linkUnlocks(): Feature[] {
  if (cached) return cached;
  const out: Feature[] = [];
  try {
    const tab = startTab();
    if (clanInviteCode() || tab === 'clan') out.push('clan');
    if (inviteCode() || friendInviteCode() || tab === 'friends') out.push('duel');
    if (tab === 'village') out.push('village', 'dungeon');
    if (tab === 'pass') out.push('pass');
    if (tab === 'shop') out.push('shop');
  } catch {
    // Вне браузера (тесты) ссылок нет.
  }
  cached = out;
  return out;
}
