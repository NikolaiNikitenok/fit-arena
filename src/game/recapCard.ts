// Картинка итогов месяца для сторис (1080×1920): большое число повторов, дни, упражнения, тип героя, место.
// Рисуется на 2D-холсте в цветах приложения, без 3D: быстро и на любом телефоне.
import { BOT_USERNAME } from '../telegram';
import { EX_COLOR } from './Stats';
import { amountLabel, MONTHS_OF, RECAP_TYPES, type Recap, recapWord } from './recap';
import { locale, t } from '../i18n';
import { cityName } from '../city/cityName';

export const STORY_W = 1080;
export const STORY_H = 1920;
const FONT = 'Nunito, system-ui, -apple-system, sans-serif';

export interface RecapExtra {
  name: string;
  percent: number | null;
  city: { name: string; place: number; cities: number } | null;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** Самый крупный шрифт, при котором текст влезает в ширину. */
function fit(g: CanvasRenderingContext2D, text: string, weight: number, size: number, maxW: number): number {
  let s = size;
  for (; s > 20; s -= 4) {
    g.font = `${weight} ${s}px ${FONT}`;
    if (g.measureText(text).width <= maxW) break;
  }
  return s;
}

function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

export async function drawRecapCard(r: Recap, extra: RecapExtra): Promise<HTMLCanvasElement> {
  await document.fonts?.load(`900 64px Nunito`).catch(() => null);
  const c = document.createElement('canvas');
  c.width = STORY_W;
  c.height = STORY_H;
  const g = c.getContext('2d')!;
  const W = STORY_W;
  const M = 72;

  // Фон: ночное небо приложения и три пятна света.
  const bg = g.createLinearGradient(0, 0, 0, STORY_H);
  bg.addColorStop(0, '#1a1330');
  bg.addColorStop(0.45, '#0f1220');
  bg.addColorStop(1, '#0b0d15');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, STORY_H);
  glow(g, 880, 260, 560, 'rgba(255,122,89,.42)');
  glow(g, 120, 980, 520, 'rgba(143,179,255,.22)');
  glow(g, 900, 1600, 520, 'rgba(110,231,183,.16)');

  g.textBaseline = 'alphabetic';
  g.fillStyle = 'rgba(255,255,255,.62)';
  g.font = `800 34px ${FONT}`;
  g.fillText('NIKITENOKARENA', M, 132);
  g.fillStyle = '#ffd27a';
  g.font = `900 30px ${FONT}`;
  g.textAlign = 'right';
  g.fillText(String(r.year), W - M, 132);
  g.textAlign = 'left';

  g.fillStyle = '#f5f2ec';
  g.font = `900 ${fit(g, `Итоги ${MONTHS_OF[r.m]}`, 900, 92, W - 2 * M)}px ${FONT}`;
  g.fillText(t('Итоги {0}', { 0: MONTHS_OF[r.m] }), M, 250);
  g.fillStyle = 'rgba(245,242,236,.7)';
  g.font = `800 40px ${FONT}`;
  g.fillText(extra.name, M, 312, W - 2 * M);

  // Главное число.
  const total = r.total.toLocaleString(locale());
  const tg = g.createLinearGradient(M, 360, M, 600);
  tg.addColorStop(0, '#ffd27a');
  tg.addColorStop(1, '#ff7a59');
  g.fillStyle = tg;
  g.font = `900 ${fit(g, total, 900, 260, W - 2 * M)}px ${FONT}`;
  g.fillText(total, M - 6, 590);
  g.fillStyle = '#f5f2ec';
  g.font = `900 52px ${FONT}`;
  g.fillText(recapWord(r.total, [t('повтор'), t('повтора'), t('повторов')]), M, 660);
  if (r.growth != null && r.growth !== 0) {
    const up = r.growth > 0;
    const tm = t('{0}{1}% к прошлому месяцу', { 0: up ? '▲ +' : '▼ ', 1: r.growth });
    g.font = `900 34px ${FONT}`;
    const w = g.measureText(tm).width + 40;
    roundRect(g, M, 690, w, 58, 29);
    g.fillStyle = up ? 'rgba(110,231,183,.16)' : 'rgba(255,107,129,.16)';
    g.fill();
    g.fillStyle = up ? '#6ee7b7' : '#ff6b81';
    g.fillText(tm, M + 20, 731);
  }

  // Три плитки: дни, серия, день силы.
  const tiles: [string, string][] = [
    [`${r.days}`, t('{0} с тренировкой', { 0: recapWord(r.days, [t('день'), t('дня'), t('дней')]) })],
    [`${r.streak}`, t('{0} подряд', { 0: recapWord(r.streak, [t('день'), t('дня'), t('дней')]) })],
    [r.bestDay ? r.bestDay.reps.toLocaleString(locale()) : '—', t('в лучший день')],
  ];
  const tw = (W - 2 * M - 2 * 24) / 3;
  tiles.forEach(([v, l], i) => {
    const x = M + i * (tw + 24);
    roundRect(g, x, 800, tw, 200, 34);
    g.fillStyle = 'rgba(255,255,255,.06)';
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,.08)';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#f5f2ec';
    g.font = `900 ${fit(g, v, 900, 84, tw - 40)}px ${FONT}`;
    g.fillText(v, x + 26, 900);
    g.fillStyle = 'rgba(245,242,236,.62)';
    g.font = `800 28px ${FONT}`;
    const words = l.split(' ');
    const mid = Math.ceil(words.length / 2);
    g.fillText(words.slice(0, mid).join(' '), x + 26, 948, tw - 40);
    g.fillText(words.slice(mid).join(' '), x + 26, 982, tw - 40);
  });

  // Упражнения: полосы по вкладу.
  let y = 1070;
  for (const e of r.byEx.slice(0, 4)) {
    g.fillStyle = '#f5f2ec';
    g.font = `900 38px ${FONT}`;
    g.fillText(amountLabel(e.ex, e.amount), M, y);
    g.textAlign = 'right';
    g.fillStyle = 'rgba(245,242,236,.6)';
    g.font = `800 32px ${FONT}`;
    g.fillText(`${Math.round(e.share * 100)}%`, W - M, y);
    g.textAlign = 'left';
    roundRect(g, M, y + 18, W - 2 * M, 22, 11);
    g.fillStyle = 'rgba(255,255,255,.07)';
    g.fill();
    roundRect(g, M, y + 18, Math.max(22, (W - 2 * M) * e.share), 22, 11);
    g.fillStyle = EX_COLOR[e.ex];
    g.fill();
    y += 96;
  }

  // Тип героя.
  const tm = RECAP_TYPES[r.type];
  const ty = Math.max(y + 10, 1400);
  roundRect(g, M, ty, W - 2 * M, 190, 40);
  const tb = g.createLinearGradient(M, ty, W - M, ty + 190);
  tb.addColorStop(0, 'rgba(255,138,92,.28)');
  tb.addColorStop(1, 'rgba(192,132,252,.22)');
  g.fillStyle = tb;
  g.fill();
  g.font = `100px ${FONT}`;
  g.fillText(tm.emoji, M + 34, ty + 132);
  g.fillStyle = 'rgba(245,242,236,.7)';
  g.font = `800 30px ${FONT}`;
  g.fillText(t('Мой тип героя'), M + 180, ty + 72);
  g.fillStyle = '#f5f2ec';
  g.font = `900 ${fit(g, tm.name, 900, 60, W - 2 * M - 220)}px ${FONT}`;
  g.fillText(tm.name, M + 180, ty + 140);

  // Место среди игроков и города.
  const lines: string[] = [];
  if (extra.percent != null) lines.push(t('Сильнее {0}% героев', { 0: extra.percent }));
  if (extra.city) lines.push(t('{0}: {1}-е место из {2}', { 0: cityName(extra.city.name), 1: extra.city.place, 2: extra.city.cities }));
  g.fillStyle = '#ffd27a';
  g.font = `900 40px ${FONT}`;
  lines.slice(0, 2).forEach((l, i) => g.fillText(l, M, ty + 250 + i * 54, W - 2 * M));

  // Приглашение.
  g.fillStyle = 'rgba(245,242,236,.55)';
  g.font = `800 32px ${FONT}`;
  g.fillText(t('Тренируйся со мной в Telegram'), M, STORY_H - 96);
  g.fillStyle = '#ff8a5c';
  g.font = `900 40px ${FONT}`;
  g.fillText(`@${BOT_USERNAME}`, M, STORY_H - 44);
  return c;
}

/** Холст в JPEG не больше предела сервера (850 КБ). */
export async function recapJpeg(c: HTMLCanvasElement): Promise<Blob> {
  for (const q of [0.9, 0.82, 0.72, 0.6]) {
    const b = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', q));
    if (b && b.size <= 840_000) return b;
  }
  throw new Error(t('не удалось сохранить картинку'));
}
