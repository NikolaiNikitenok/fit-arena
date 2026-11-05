import { t } from './i18n';

/** Actionable messages; never expose model/browser diagnostics in the player flow. */
export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (['NotAllowedError', 'SecurityError', 'PermissionDeniedError'].includes(name)) {
    return t('Разреши доступ к камере в настройках браузера или Telegram и нажми «Ещё раз»');
  }
  if (['NotFoundError', 'DevicesNotFoundError'].includes(name)) return t('Камера не найдена. Проверь подключение камеры или открой игру на телефоне');
  if (['NotReadableError', 'TrackStartError'].includes(name)) return t('Камера занята. Закрой другое приложение с камерой и повтори запуск');
  return t('Не удалось подготовить камеру. Проверь соединение и повтори запуск');
}
