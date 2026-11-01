// Ссылки друзей без зависимостей от Telegram: так их легко проверить тестами.
//   t.me/<бот>?startapp=friend-ТОКЕН — мини-приложение открывается сразу;
//   t.me/<бот>?start=friend-ТОКЕН — через бота, его кнопка открывает /?friend=ТОКЕН.

export const FRIEND_PREFIX = 'friend-';

const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || null;

/** Токен приглашения из start_param или из адреса (?friend=). */
export function friendParam(startParam: string | null | undefined, search: string): string | null {
  if (startParam?.startsWith(FRIEND_PREFIX)) return clean(startParam.slice(FRIEND_PREFIX.length));
  const q = new URLSearchParams(search).get('friend');
  return q ? clean(q) : null;
}

/** start_param — не код боя: у приглашений в клан и в друзья свои приставки, у вкладки из кнопки бота в Max — tab-,
 *  у меток рекламы и постов — src-. */
export const isNamedParam = (p: string) => /^(clan|friend|tab|src|gc)-/.test(p);

/** Откуда открыли приложение — для статистики админа. Своя метка: t.me/<бот>?start=src-МЕТКА
 *  (бот передаст ?src=МЕТКА) или ?startapp=src-МЕТКА. Иначе — по виду ссылки. */
export function launchSource(startParam: string | null | undefined, search: string, platform: string): string {
  const q = new URLSearchParams(search);
  const tag = (startParam?.startsWith('src-') ? startParam.slice(4) : q.get('src'))?.replace(/[^\w-]/g, '').slice(0, 24);
  if (tag) return tag.toLowerCase();
  if (startParam?.startsWith('clan-') || q.get('clan')) return 'clan';
  if (startParam?.startsWith(FRIEND_PREFIX) || q.get('friend')) return 'friend';
  if (startParam?.startsWith('gc-') || q.get('gc')) return 'group';
  if (startParam?.startsWith('tab-') || q.get('tab')) return 'bot';
  if ((startParam && !isNamedParam(startParam)) || q.get('room')) return 'duel';
  return platform === 'tg' ? 'direct' : platform;
}

/** Ссылка-приглашение в друзья. */
export function friendLink(token: string, bot: { username: string | null; running: boolean }, fallbackBot: string, origin: string): string {
  const name = bot.username || fallbackBot;
  return name ? `https://t.me/${name}?${bot.running ? 'start' : 'startapp'}=${FRIEND_PREFIX}${token}` : `${origin}/?friend=${token}`;
}
