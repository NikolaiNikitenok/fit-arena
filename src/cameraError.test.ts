import { expect, it } from 'vitest';
import { cameraErrorMessage } from './cameraError';

it('gives a recovery action for permission, missing and busy cameras', () => {
  expect(cameraErrorMessage(new DOMException('internal permission details', 'NotAllowedError'))).toContain('Разреши доступ');
  expect(cameraErrorMessage(new DOMException('', 'NotFoundError'))).toContain('Камера не найдена');
  expect(cameraErrorMessage(new DOMException('', 'NotReadableError'))).toContain('Закрой другое приложение');
});
it('does not expose internal paths or arbitrary exception text', () => {
  expect(cameraErrorMessage(new Error('/private/model/path: diagnostic'))).not.toContain('/private');
  expect(cameraErrorMessage(null)).toContain('повтори запуск');
});
