import { describe, expect, it } from 'vitest';
import { AccountStore, CODE_TTL } from './accounts';
import { accountApi, type AccountDeps, type HeroCard } from './accountApi';

describe('accounts', () => {
  it('старый вход Telegram — сам себе аккаунт', () => {
    const a = new AccountStore(null);
    expect(a.seen('tg:1')).toBe('tg:1');
    expect(a.logins('tg:1')).toEqual(['tg:1']);
    expect(a.tgChat('tg:1')).toBe(1);
  });

  it('код одноразовый и живёт 10 минут', () => {
    let now = 1000;
    const a = new AccountStore(null, () => now);
    const { code } = a.code('tg:1');
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(a.codeOwner(code.toLowerCase())).toBe('tg:1');
    a.merge('tg:2', 'tg:1', code);
    expect(a.codeOwner(code)).toBeNull();
    const next = a.code('tg:1').code;
    now += CODE_TTL;
    expect(a.codeOwner(next)).toBeNull();
  });

  it('привязка переводит все входы и пишет боту в последний', () => {
    const a = new AccountStore(null);
    a.seen('tg:2');
    a.merge('tg:2', 'tg:1');
    expect(a.resolve('tg:2')).toBe('tg:1');
    expect(a.logins('tg:1')).toEqual(['tg:1', 'tg:2']);
    expect(a.logins('tg:2')).toEqual([]);
    a.seen('tg:2');
    expect(a.tgChat('tg:1')).toBe(2);
    // Аккаунт с двумя входами сводим в третий: уходят оба.
    a.merge('tg:1', 'tg:3');
    expect(a.resolve('tg:1')).toBe('tg:3');
    expect(a.resolve('tg:2')).toBe('tg:3');
    expect(a.logins('tg:3').sort()).toEqual(['tg:1', 'tg:2', 'tg:3']);
  });

  it('отвязка: свой вход аккаунта уходит в новый пустой аккаунт', () => {
    const a = new AccountStore(null);
    a.merge('tg:2', 'tg:1');
    expect(a.unlink('tg:1', 'tg:1')).toBeNull();
    expect(a.resolve('tg:1')).toMatch(/^acc:/);
    expect(a.logins('tg:1')).toEqual(['tg:2']);
    expect(a.unlink('tg:1', 'tg:2')).toMatch(/единственный/);
    expect(a.logins(a.resolve('tg:1'))).toEqual(['tg:1']);
  });

  it('удаление данных снимает привязки', () => {
    const a = new AccountStore(null);
    a.merge('tg:2', 'tg:1');
    a.archiveOf({ account: 'tg:2', logins: ['tg:2'], progress: { coins: 5 }, cups: 3 });
    a.forget('tg:1');
    expect(a.resolve('tg:2')).toBe('tg:2');
    expect(a.archived()).toEqual([]);
  });
});

describe('accountApi', () => {
  const setup = (cards: Record<string, HeroCard | null>) => {
    const accounts = new AccountStore(null);
    const dropped: string[] = [];
    const d: AccountDeps = { accounts, card: (id) => cards[id] ?? null, drop: (id) => dropped.push(id), progress: (id) => ({ of: id }) };
    return { accounts, dropped, d };
  };
  const hero = (level: number): HeroCard => ({ level, stages: level, cups: 0 });

  it('пустой новый вход просто присоединяется к герою по коду', () => {
    const { accounts, dropped, d } = setup({ 'tg:1': hero(7) });
    const { code } = accounts.code('tg:1');
    const r = accountApi(d, '/api/account/link', { id: 'tg:2', login: 'tg:2' }, { code });
    expect(r.body).toMatchObject({ ok: true, id: 'tg:1', progress: { of: 'tg:1' } });
    expect(dropped).toEqual(['tg:2']);
    expect(accounts.resolve('tg:2')).toBe('tg:1');
  });

  it('пустой герой по коду уступает здешнему', () => {
    const { accounts, dropped, d } = setup({ 'tg:2': hero(3) });
    const { code } = accounts.code('tg:1');
    const r = accountApi(d, '/api/account/link', { id: 'tg:2', login: 'tg:2' }, { code });
    expect(r.body).toMatchObject({ ok: true, id: 'tg:2' });
    expect(dropped).toEqual(['tg:1']);
    expect(accounts.resolve('tg:1')).toBe('tg:2');
  });

  it('герои с обеих сторон: сначала выбор, код не тратится', () => {
    const { accounts, dropped, d } = setup({ 'tg:1': hero(7), 'tg:2': hero(3) });
    const { code } = accounts.code('tg:1');
    const me = { id: 'tg:2', login: 'tg:2' };
    expect(accountApi(d, '/api/account/link', me, { code }).body).toEqual({ conflict: { here: hero(3), there: hero(7) } });
    expect(dropped).toEqual([]);
    expect(accountApi(d, '/api/account/link', me, { code, keep: 'here' }).body).toMatchObject({ ok: true, id: 'tg:2' });
    expect(dropped).toEqual(['tg:1']);
    expect(accounts.logins('tg:2')).toEqual(['tg:2', 'tg:1']);
  });

  it('свой код и чужой неверный код не проходят', () => {
    const { accounts, d } = setup({});
    const { code } = accounts.code('tg:1');
    expect(accountApi(d, '/api/account/link', { id: 'tg:1', login: 'tg:1' }, { code }).status).toBe(400);
    expect(accountApi(d, '/api/account/link', { id: 'tg:1', login: 'tg:1' }, { code: 'ZZZZZZ' }).status).toBe(400);
  });

  it('вход, с которого играешь, отвязать нельзя', () => {
    const { accounts, d } = setup({});
    accounts.merge('tg:2', 'tg:1');
    expect(accountApi(d, '/api/account/unlink', { id: 'tg:1', login: 'tg:1' }, { login: 'tg:1' }).status).toBe(400);
    const r = accountApi(d, '/api/account/unlink', { id: 'tg:1', login: 'tg:1' }, { login: 'tg:2' });
    expect(r.body).toMatchObject({ logins: [{ login: 'tg:1', platform: 'tg' }] });
  });
});
