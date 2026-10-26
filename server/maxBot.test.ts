import { describe, expect, it } from 'vitest';
import { appButton, startPayload } from './maxBot';

describe('maxBot', () => {
  it('адрес кнопки Telegram → параметр запуска Max', () => {
    expect(startPayload('https://arena.nikitenok.ru/')).toBe('');
    expect(startPayload('https://arena.nikitenok.ru/?clan=AB12')).toBe('clan-AB12');
    expect(startPayload('https://arena.nikitenok.ru/?friend=XYZ9')).toBe('friend-XYZ9');
    expect(startPayload('https://arena.nikitenok.ru/?room=K7Q2')).toBe('K7Q2');
    expect(startPayload('https://arena.nikitenok.ru/?tab=clan')).toBe('tab-clan');
    expect(startPayload('/?tab=<script>')).toBe('tab-script');
  });

  it('пока бот не узнал своё имя, кнопка — ссылка на сайт', () => {
    expect(appButton('Играть', 'https://arena.nikitenok.ru/')).toEqual({ type: 'link', text: 'Играть', url: 'https://arena.nikitenok.ru/' });
  });
});
