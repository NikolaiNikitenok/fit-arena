// Результат в чат Telegram (Bot API 8.0): картинка уходит на сервер, бот заготавливает сообщение
// с ней и кнопкой «Играть» (server/index.ts, /api/share/prepare), игра открывает выбор чата.
import { post } from './cloud';
import { canShareMessage, shareMessage } from './telegram';

export { canShareMessage };

export const blobBase64 = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

/** Сервер принимает только JPEG: открытки побед рисуются в PNG — пережимаем. */
export async function toJpeg(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/jpeg') return blob;
  const img = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  // У PNG может быть прозрачность: подкладываем фон игры.
  g.fillStyle = '#0d0f17';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('jpeg'))), 'image/jpeg', 0.86));
}

/** Отправить картинку с подписью в чат. true — отправил, false — передумал. Ошибки сервера — исключением. */
export async function shareToChat(blob: Blob, text: string): Promise<boolean> {
  const r = (await post('/api/share/prepare', { image: await blobBase64(await toJpeg(blob)), text })) as { id: string };
  return shareMessage(r.id);
}
