// Время суток и погода в деревне: по местным часам телефона. Утро розовое, день светлый, вечер
// золотой, ночью — синие сумерки и фонари. Погода меняется раз в три часа и одна у всех игроков
// (зависит только от времени): иногда дождь, зимой (декабрь–февраль) — снег.

export type Weather = 'clear' | 'rain' | 'snow';

export interface SkyLook {
  // Цвет дымки по краям мира и фона за ним.
  fog: string;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  sun: string;
  sunI: number;
  // Высота солнца: 1 — полдень, ниже — длиннее тени.
  sunH: number;
  // Насколько горят фонари и окна, 0..1.
  lamps: number;
  // Звёзды на небе, 0..1.
  stars: number;
}

interface Key extends SkyLook {
  h: number;
}

const NIGHT: Omit<Key, 'h'> = { fog: '#1c2645', hemiSky: '#7387c9', hemiGround: '#1a1830', hemi: 0.72, sun: '#9fb6ff', sunI: 0.6, sunH: 0.8, lamps: 1, stars: 1 };
const KEYS: Key[] = [
  { h: 0, ...NIGHT },
  { h: 5, ...NIGHT },
  { h: 6.5, fog: '#f2b99a', hemiSky: '#ffd8bf', hemiGround: '#5a4638', hemi: 1.1, sun: '#ffb27f', sunI: 1.6, sunH: 0.5, lamps: 0.5, stars: 0 },
  { h: 8.5, fog: '#cfe7d6', hemiSky: '#ffffff', hemiGround: '#5a4a38', hemi: 1.25, sun: '#ffffff', sunI: 2.3, sunH: 1, lamps: 0, stars: 0 },
  { h: 17, fog: '#cfe7d6', hemiSky: '#ffffff', hemiGround: '#5a4a38', hemi: 1.25, sun: '#ffffff', sunI: 2.3, sunH: 1, lamps: 0, stars: 0 },
  { h: 19, fog: '#eab79a', hemiSky: '#f3e2e6', hemiGround: '#4f4040', hemi: 1.1, sun: '#ffb27a', sunI: 1.8, sunH: 0.55, lamps: 0.4, stars: 0 },
  { h: 20.5, fog: '#4f4472', hemiSky: '#9a92d4', hemiGround: '#2a2236', hemi: 0.85, sun: '#ff9f8f', sunI: 0.9, sunH: 0.45, lamps: 1, stars: 0.4 },
  { h: 22, ...NIGHT },
  { h: 24, ...NIGHT },
];

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/** Вид неба на час суток (дробный, 0..24). */
export function skyAt(hour: number): SkyLook {
  const h = ((hour % 24) + 24) % 24;
  let k = 0;
  while (k < KEYS.length - 2 && KEYS[k + 1].h <= h) k++;
  const a = KEYS[k];
  const b = KEYS[k + 1];
  const t = (h - a.h) / (b.h - a.h || 1);
  const n = (x: number, y: number) => x + (y - x) * t;
  return {
    fog: mixHex(a.fog, b.fog, t),
    hemiSky: mixHex(a.hemiSky, b.hemiSky, t),
    hemiGround: mixHex(a.hemiGround, b.hemiGround, t),
    hemi: n(a.hemi, b.hemi),
    sun: mixHex(a.sun, b.sun, t),
    sunI: n(a.sunI, b.sunI),
    sunH: n(a.sunH, b.sunH),
    lamps: n(a.lamps, b.lamps),
    stars: n(a.stars, b.stars),
  };
}

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Погода в этот момент: одна на всех, меняется раз в 3 часа. */
export function weatherAt(ms: number, month = new Date(ms).getMonth()): Weather {
  const r = hash(Math.floor(ms / (3 * 3600_000)));
  const winter = month === 11 || month <= 1;
  if (winter) return r < 0.35 ? 'snow' : 'clear';
  return r < 0.18 ? 'rain' : 'clear';
}

/** Пасмурно в дождь и снег: свет приглушён и холоднее. */
export function overcast(s: SkyLook, w: Weather): SkyLook {
  if (w === 'clear') return s;
  const grey = w === 'snow' ? '#c9d3e0' : '#8e9aa8';
  const k = w === 'rain' ? 0.75 : 0.5;
  return { ...s, fog: mixHex(s.fog, grey, 0.6), hemiSky: mixHex(s.hemiSky, w === 'snow' ? '#e8f0ff' : '#b8c4d4', k), sun: mixHex(s.sun, '#dfe6f0', 0.5), sunI: s.sunI * (w === 'rain' ? 0.4 : 0.55), hemi: s.hemi * (w === 'rain' ? 0.95 : 1.1), lamps: Math.max(s.lamps, w === 'rain' ? 0.3 : 0.15) };
}

/** Часы и погода сейчас. Для проверки в разработке: ?tod=21.5&wx=rain. */
export function nowSky(date = new Date()): { hour: number; weather: Weather } {
  let hour = date.getHours() + date.getMinutes() / 60;
  let weather = weatherAt(date.getTime(), date.getMonth());
  if (import.meta.env.DEV) {
    const q = new URLSearchParams(location.search);
    if (q.get('tod')) hour = Number(q.get('tod'));
    const wx = q.get('wx');
    if (wx === 'rain' || wx === 'snow' || wx === 'clear') weather = wx;
  }
  return { hour, weather };
}
