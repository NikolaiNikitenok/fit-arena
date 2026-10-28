import { describe, expect, it } from 'vitest';
import { friendLink, friendParam, isNamedParam, launchSource } from './link';

describe('ссылки друзей', () => {
  it('токен из startapp и из адреса кнопки бота', () => {
    expect(friendParam('friend-ab3k9qx2mn', '')).toBe('AB3K9QX2MN');
    expect(friendParam(null, '?friend=ab3k9qx2mn&x=1')).toBe('AB3K9QX2MN');
    expect(friendParam('clan-ABC123', '')).toBeNull();
    expect(friendParam('friend-', '')).toBeNull();
    expect(friendParam(undefined, '?room=K7P2Q')).toBeNull();
  });

  it('код боя не путается с приглашениями', () => {
    expect(isNamedParam('friend-AB3K')).toBe(true);
    expect(isNamedParam('clan-AB3K')).toBe(true);
    expect(isNamedParam('K7P2Q')).toBe(false);
  });

  it('ссылка ведёт в бота, пока он работает, иначе прямо в приложение', () => {
    expect(friendLink('AB3K9QX2MN', { username: 'ArenaNikitenokBot', running: true }, 'X', 'https://a')).toBe('https://t.me/ArenaNikitenokBot?start=friend-AB3K9QX2MN');
    expect(friendLink('AB3K9QX2MN', { username: null, running: false }, 'ArenaNikitenokBot', 'https://a')).toBe('https://t.me/ArenaNikitenokBot?startapp=friend-AB3K9QX2MN');
    expect(friendLink('AB3K9QX2MN', { username: null, running: false }, '', 'https://a')).toBe('https://a/?friend=AB3K9QX2MN');
  });

  it('источник входа для статистики', () => {
    expect(launchSource('src-VK_ads', '', 'tg')).toBe('vk_ads');
    expect(launchSource(null, '?src=blogger1', 'tg')).toBe('blogger1');
    expect(launchSource('clan-AB3K', '', 'tg')).toBe('clan');
    expect(launchSource(null, '?friend=AB3K', 'tg')).toBe('friend');
    expect(launchSource('K7P2Q', '', 'tg')).toBe('duel');
    expect(launchSource('tab-clan', '', 'max')).toBe('bot');
    expect(launchSource(null, '', 'tg')).toBe('direct');
    expect(launchSource(null, '', 'web')).toBe('web');
    expect(isNamedParam('src-vk')).toBe(true);
  });
});
