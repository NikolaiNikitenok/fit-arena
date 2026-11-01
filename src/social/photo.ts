// Фото для поста: уменьшаем на телефоне до PHOTO_SIDE и перекодируем в JPEG. Перекодирование заодно
// убирает EXIF — геометку и модель телефона: в ленту уходит только картинка.
import { PHOTO_MAX_BYTES, PHOTO_SIDE } from '../../shared/social';

/** Новый размер с сохранением пропорций: длинная сторона не больше side. */
export function fitSize(w: number, h: number, side = PHOTO_SIDE): { w: number; h: number } {
  const k = Math.min(1, side / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Файл из галереи или камеры → data:image/jpeg;base64,… не больше PHOTO_MAX_BYTES. */
export async function preparePhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions).catch(() => null);
  const img = bitmap ?? (await loadImage(file));
  const src = { w: 'naturalWidth' in img ? img.naturalWidth : img.width, h: 'naturalHeight' in img ? img.naturalHeight : img.height };
  let side = PHOTO_SIDE;
  for (let q = 0.85; ; ) {
    const { w, h } = fitSize(src.w, src.h, side);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const url = c.toDataURL('image/jpeg', q);
    // base64 длиннее файла на треть.
    if ((url.length - 23) * 0.75 <= PHOTO_MAX_BYTES * 0.95 || side < 400) {
      bitmap?.close();
      return url;
    }
    if (q > 0.6) q -= 0.1;
    else side = Math.round(side * 0.8);
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('bad image'));
    };
    img.src = url;
  });
}
