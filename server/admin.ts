// Админы NikitenokArena: видят статистику и получают от бота сводку и тревоги об ошибках.
//   ADMIN_IDS — id в Telegram через запятую
//   .admin-ids рядом с сервером (ADMIN_FILE) — по id на строку, перечитывается на лету, как .pro-ids
// Вход на страницу статистики — по подписи Telegram (initData) или по ссылке из бота,
// подписанной ключом сервера. Ссылка проверяет список заново: убранный из списка теряет доступ сразу.
import { timingSafeEqual } from 'node:crypto';
import { ProList } from './pro';

export class AdminList extends ProList {}

export const ADMIN_LINK_DAYS = 7;

/** Токен ссылки на статистику: id.срок.подпись. */
export function adminToken(sign: (text: string) => string, tgId: string, now: number, days = ADMIN_LINK_DAYS): string {
  const exp = Math.floor(now / 1000) + days * 86_400;
  return `${tgId}.${exp}.${sign(`admin:${tgId}.${exp}`)}`;
}

/** Проверка токена: вернёт id админа или null. */
export function checkAdminToken(sign: (text: string) => string, token: unknown, now: number, isAdmin: (playerId: string) => boolean): string | null {
  if (typeof token !== 'string') return null;
  const m = /^(\d{1,20})\.(\d{1,12})\.([0-9a-f]{32})$/.exec(token);
  if (!m) return null;
  const [, id, exp, sig] = m;
  if (Number(exp) * 1000 < now) return null;
  const want = Buffer.from(sign(`admin:${id}.${exp}`));
  if (!timingSafeEqual(want, Buffer.from(sig))) return null;
  return isAdmin(`tg:${id}`) ? id : null;
}
