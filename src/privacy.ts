// Политика конфиденциальности (public/privacy.html): в Telegram — во встроенном браузере,
// чтобы мини-приложение не закрылось; в браузере — в новой вкладке.
import { tg } from './telegram';

export const PRIVACY_PATH = '/privacy.html';

export function openPrivacy(): void {
  const url = new URL(PRIVACY_PATH, location.origin).href;
  const open = (tg as { openLink?: (url: string) => void } | undefined)?.openLink;
  if (open && tg?.initData) open.call(tg, url);
  else window.open(url, '_blank', 'noopener');
}
