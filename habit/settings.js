// Настройки этого устройства: тема, цвет, вибрация, звуки, анимации. Хранятся только локально.
const KEY = 'habit-free-settings';
const DEF = { theme: 'auto', accent: 'mint', haptics: true, sound: true, motion: 'auto' };
export const SET = { ...DEF };
try { Object.assign(SET, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}

export const THEMES = [['auto', 'Как в системе', '🌗'], ['dark', 'Тёмная', '🌙'], ['light', 'Светлая', '☀️']];
export const ACCENTS = [
  ['mint', 'Мята', '#5fe0a8', '#3cc4d6'],
  ['ocean', 'Океан', '#5b9dff', '#3cc4d6'],
  ['violet', 'Лаванда', '#b18cff', '#ff8fc8'],
  ['sunset', 'Закат', '#ffb35c', '#ff6f91'],
  ['gold', 'Золото', '#ffd166', '#ff9f43'],
];

const reduceQ = matchMedia('(prefers-reduced-motion: reduce)');
const darkQ = matchMedia('(prefers-color-scheme: dark)');
/** Меньше движения: выбрано в настройках или так настроена система. */
export const calmMotion = () => SET.motion === 'reduce' || (SET.motion === 'auto' && reduceQ.matches);
export const isDark = () => SET.theme === 'dark' || (SET.theme === 'auto' && darkQ.matches);

export function applySettings() {
  const r = document.documentElement;
  if (SET.theme === 'auto') delete r.dataset.theme; else r.dataset.theme = SET.theme;
  if (SET.accent === 'mint') delete r.dataset.accent; else r.dataset.accent = SET.accent;
  if (SET.motion === 'auto') delete r.dataset.motion; else r.dataset.motion = SET.motion;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = isDark() ? '#0f1f1c' : '#f3f8f6';
}
export function setSetting(k, v) {
  SET[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify(SET)); } catch {}
  applySettings();
}
darkQ.addEventListener?.('change', applySettings);
applySettings();
