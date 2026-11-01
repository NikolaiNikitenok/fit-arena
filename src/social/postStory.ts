// Картинка поста для сторис и чатов (1080×1920): фото, автор, текст и призыв играть в NikitenokArena.
// Рисуется на 2D-холсте: фото поста отдаёт наш сервер (тот же адрес), поэтому холст не «портится».
import type { PostView } from '../../shared/social';
import { BOT_USERNAME } from '../telegram';
import { t } from '../i18n';

export const STORY_W = 1080;
export const STORY_H = 1920;
const FONT = 'Nunito, system-ui, -apple-system, sans-serif';

/** Ссылка на пост: откроет игру сразу на нём (src/game/Adventure.tsx, startapp=post-ID). */
export const postLink = (id: string) => `https://t.me/${BOT_USERNAME}?startapp=post-${id}`;

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('img'));
    img.src = src;
  });
}

/** Перенос текста по словам; не больше maxLines строк, лишнее — многоточием. */
export function wrapLines(measure: (s: string) => number, text: string, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next) <= maxW || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  const out = lines.filter((l, i) => l || (i > 0 && i < lines.length - 1));
  if (out.length <= maxLines) return out;
  const cut = out.slice(0, maxLines);
  let last = cut[maxLines - 1];
  while (last && measure(`${last}…`) > maxW) last = last.slice(0, -1);
  cut[maxLines - 1] = `${last.trimEnd()}…`;
  return cut;
}

function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

export async function drawPostStory(p: PostView): Promise<HTMLCanvasElement> {
  await document.fonts?.load(`900 64px Nunito`).catch(() => null);
  const c = document.createElement('canvas');
  c.width = STORY_W;
  c.height = STORY_H;
  const g = c.getContext('2d')!;
  const W = STORY_W;
  const M = 72;

  const bg = g.createLinearGradient(0, 0, 0, STORY_H);
  bg.addColorStop(0, '#1a1330');
  bg.addColorStop(0.5, '#0f1220');
  bg.addColorStop(1, '#0b0d15');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, STORY_H);
  glow(g, 900, 220, 560, 'rgba(255,122,89,.4)');
  glow(g, 140, 1500, 560, 'rgba(143,179,255,.2)');

  // Шапка: название игры.
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#ffb46b';
  g.font = `900 44px ${FONT}`;
  g.fillText('NikitenokArena', M, 130);
  g.fillStyle = 'rgba(245,242,236,.6)';
  g.font = `800 30px ${FONT}`;
  g.fillText(t('лента героев'), M, 176);

  // Автор: кружок с буквой, имя и уровень.
  const ay = 260;
  const grad = g.createLinearGradient(M, ay, M + 110, ay + 110);
  grad.addColorStop(0, '#ffb46b');
  grad.addColorStop(1, '#ff7a59');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(M + 55, ay + 55, 55, 0, Math.PI * 2);
  g.fill();
  // Фото профиля Telegram, если есть; иначе — буква имени.
  const face = await loadImg(`/api/avatar/${p.author.pid}.jpg`).catch(() => null);
  if (face) {
    g.save();
    g.beginPath();
    g.arc(M + 55, ay + 55, 51, 0, Math.PI * 2);
    g.clip();
    g.drawImage(face, M + 4, ay + 4, 102, 102);
    g.restore();
  } else {
    g.fillStyle = '#2b1206';
    g.font = `900 56px ${FONT}`;
    g.textAlign = 'center';
    g.fillText([...p.author.name.trim()][0]?.toUpperCase() ?? '?', M + 55, ay + 75);
    g.textAlign = 'left';
  }
  g.fillStyle = '#f5f2ec';
  g.font = `900 52px ${FONT}`;
  let name = p.author.name;
  while (g.measureText(name).width > W - M * 2 - 140 && name.length > 2) name = name.slice(0, -1);
  g.fillText(name === p.author.name ? name : `${name}…`, M + 140, ay + 52);
  g.fillStyle = 'rgba(245,242,236,.65)';
  g.font = `800 32px ${FONT}`;
  g.fillText(t('Герой {0} уровня', { 0: p.author.level }), M + 140, ay + 98);

  // Фото: в рамке со скруглёнными углами, обрезка по центру.
  let y = ay + 160;
  const textSpace = p.text ? 300 : 0;
  if (p.photo) {
    const img = await loadImg(p.photo).catch(() => null);
    if (img) {
      const boxW = W - M * 2;
      const boxH = Math.min(1920 - y - textSpace - 330, Math.round((boxW * img.height) / img.width));
      const k = Math.max(boxW / img.width, boxH / img.height);
      const sw = boxW / k;
      const sh = boxH / k;
      g.save();
      g.beginPath();
      g.roundRect(M, y, boxW, boxH, 36);
      g.clip();
      g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, M, y, boxW, boxH);
      g.restore();
      g.strokeStyle = 'rgba(255,180,107,.55)';
      g.lineWidth = 4;
      g.beginPath();
      g.roundRect(M, y, boxW, boxH, 36);
      g.stroke();
      y += boxH + 60;
    }
  }

  // Текст поста: крупно, если фото нет.
  if (p.text) {
    const size = p.photo ? 44 : 64;
    g.fillStyle = '#f5f2ec';
    g.font = `800 ${size}px ${FONT}`;
    const lines = wrapLines((s) => g.measureText(s).width, p.text, W - M * 2, p.photo ? 5 : 12);
    if (!p.photo) y += 60;
    for (const l of lines) {
      y += size * 1.3;
      g.fillText(l, M, y);
    }
  }

  // Низ: респекты и призыв.
  const by = STORY_H - 290;
  g.fillStyle = 'rgba(255,255,255,.06)';
  g.beginPath();
  g.roundRect(M, by, W - M * 2, 200, 40);
  g.fill();
  g.fillStyle = '#ffb46b';
  g.font = `900 50px ${FONT}`;
  g.fillText(t('Тренируйся со мной!'), M + 44, by + 86);
  g.fillStyle = 'rgba(245,242,236,.7)';
  const sub = t('Отжимания, приседания и пресс с камерой — в Telegram');
  let fs = 32;
  do g.font = `800 ${fs}px ${FONT}`;
  while (g.measureText(sub).width > W - M * 2 - 88 && --fs > 20);
  g.fillText(sub, M + 44, by + 140);
  g.font = `800 32px ${FONT}`;
  g.fillText(`@${BOT_USERNAME}`, M + 44, by + 182);
  if (p.likes > 0) {
    g.textAlign = 'right';
    g.font = `900 46px ${FONT}`;
    g.fillStyle = '#f5f2ec';
    g.fillText(`💪 ${p.likes}`, W - M - 44, by + 86);
    g.textAlign = 'left';
  }
  return c;
}

export async function storyJpeg(c: HTMLCanvasElement): Promise<Blob> {
  for (const q of [0.88, 0.8, 0.7, 0.6]) {
    const b = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', q));
    if (b && b.size <= 840_000) return b;
  }
  throw new Error(t('не удалось сохранить картинку'));
}
