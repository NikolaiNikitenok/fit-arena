// Аккаунт игрока: POST /api/account/status, /code, /link, /unlink (server/accounts.ts).
// Привязка: на одной платформе берёшь код, на другой вводишь. Если герои есть с обеих сторон,
// сервер сначала присылает обе карточки (conflict), и игрок выбирает, кого оставить: keep 'here' — этого, 'there' — того, чей код.
import { type AccountStore, type Archived, platformOf } from './accounts';

export interface HeroCard {
  level: number;
  stages: number;
  cups: number;
  clan?: string;
}

export interface AccountDeps {
  accounts: AccountStore;
  /** Что есть у героя аккаунта. null — пустой: проходить нечего, терять нечего. */
  card: (account: string) => HeroCard | null;
  /** Отложить героя в архив и стереть его с сервера (клан, кубки, деревня, друзья). */
  drop: (account: string) => void;
  progress: (account: string) => unknown;
  /** Карточка героя из архива. */
  archivedCard: (a: Archived) => HeroCard;
  /** Вернуть героя из архива: нынешний уходит в архив, аккаунт получает прогресс и кубки отложенного. */
  restore: (account: string, a: Archived) => void;
}

type Reply = { status: number; body: unknown };
const fail = (error: string, status = 400): Reply => ({ status, body: { error } });

export function accountApi(d: AccountDeps, path: string, me: { id: string; login: string }, body: Record<string, unknown>): Reply {
  if (path === '/api/account/status')
    return {
      status: 200,
      body: {
        id: me.id,
        login: me.login,
        logins: d.accounts.logins(me.id).map((l) => ({ login: l, platform: platformOf(l) })),
        card: d.card(me.id),
        notify: d.accounts.notifyChoice(me.id),
        archived: d.accounts.archivedFor(me.id).map((a) => ({ at: a.at, card: d.archivedCard(a) })),
      },
    };
  if (path === '/api/account/code') return { status: 200, body: d.accounts.code(me.id) };
  if (path === '/api/account/link') {
    const code = typeof body.code === 'string' ? body.code : '';
    const there = d.accounts.codeOwner(code);
    if (!there) return fail('Код не подошёл или истёк. Возьми новый в настройках на другой платформе.');
    if (there === me.id) return fail('Это код этого же аккаунта: он уже здесь.');
    const here = d.card(me.id);
    const other = d.card(there);
    let keep = body.keep === 'here' || body.keep === 'there' ? body.keep : null;
    if (!keep) {
      if (here && other) return { status: 200, body: { conflict: { here, there: other } } };
      // Один из героев пустой: оставляем того, у кого что-то есть.
      keep = here && !other ? 'here' : 'there';
    }
    const [from, to] = keep === 'here' ? [there, me.id] : [me.id, there];
    d.drop(from);
    d.accounts.merge(from, to, code);
    return { status: 200, body: { ok: true, id: to, progress: d.progress(to) ?? null } };
  }
  if (path === '/api/account/restore') {
    const a = d.accounts.unarchive(me.id, Number(body.at));
    if (!a) return fail('Этого героя в архиве уже нет.');
    d.restore(me.id, a);
    return { status: 200, body: { ok: true, id: me.id, progress: d.progress(me.id) ?? null } };
  }
  if (path === '/api/account/notify') {
    const p = body.platform === 'tg' || body.platform === 'max' ? body.platform : null;
    if (p && !d.accounts.logins(me.id).some((l) => platformOf(l) === p)) return fail('Этот мессенджер не привязан');
    d.accounts.setNotify(me.id, p);
    return accountApi(d, '/api/account/status', me, {});
  }
  if (path === '/api/account/unlink') {
    const login = typeof body.login === 'string' ? body.login : '';
    if (login === me.login) return fail('Вход, с которого ты сейчас играешь, отвязывается с другой платформы.');
    const err = d.accounts.unlink(me.id, login);
    if (err) return fail(err);
    return accountApi(d, '/api/account/status', me, {});
  }
  return fail('not found', 404);
}
