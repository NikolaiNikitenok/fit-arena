// Автопосты в ленту: игра сама пишет о победе над боссом, серии тренировок и новом уровне героя
// (решение владельца, 2026-11-02: лента должна жить, даже когда игроков мало). Выключается в настройках.
// Сервер держит лимиты (shared/social.ts AUTO_PER_KIND) и не шлёт подписчикам уведомлений об автопостах.
import type { AutoKind, PostCardData } from '../../shared/social';
import { heroLevel, heroXp, type Progress, streakOf } from '../game/progress';
import { getSettings } from '../settings';
import { platform, signedInWeb } from '../telegram';
import { track } from '../telemetry';
import { blobBase64 } from '../shareChat';
import { socialApi } from './api';
import { LEVEL_STEP, milestones, type Seen } from './milestones';

const KEY = 'fit-arena-autoposts';

/** Можно ли игроку писать в ленту: вошёл через мессенджер или Яндекс. */
export const canPost = () => platform !== 'web' || signedInWeb();

const read = (): Seen | null => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Seen) : null;
  } catch {
    return null;
  }
};
const write = (s: Seen) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Без хранилища просто не пишем повторно.
  }
};

/** Опубликовать автопост, если игрок их не выключил. Ошибки сервера (лимит) молча пропускаем. */
export async function autoPost(kind: AutoKind, text: string, card: Omit<PostCardData, 'kind'> | null, photo?: Blob, force = false): Promise<boolean> {
  if ((!force && !getSettings().autoPosts) || !canPost()) return false;
  try {
    const img = photo ? await blobBase64(await shrinkJpeg(photo)) : undefined;
    const r = await socialApi.auto(kind, text, card, img);
    if (r.post) track('auto_post', force ? `${kind}:tap` : kind);
    return !!r.post;
  } catch {
    return false;
  }
}

/** После каждого сохранения прогресса: не взята ли новая веха. В первый раз только запоминаем — старые вехи не постим. */
export function checkMilestones(p: Progress, now = Date.now()): void {
  const s = streakOf(p, now).days;
  const level = heroLevel(heroXp(p)).level;
  const seen = read();
  if (!seen) return write({ streak: s, level: Math.floor(level / LEVEL_STEP) * LEVEL_STEP });
  // Серия прервалась: вехи считаем заново, чтобы новая серия тоже попала в ленту.
  if (s < (seen.streak ?? 0)) {
    seen.streak = s;
    write(seen);
  }
  const hit = milestones(seen, s, level);
  if (hit.streak === undefined && hit.level === undefined) return;
  write({ streak: Math.max(seen.streak ?? 0, hit.streak ?? 0), level: Math.max(seen.level ?? 0, hit.level ?? 0) });
  if (hit.streak) void autoPost('streak', `Тренируюсь ${hit.streak} ${daysWord(hit.streak)} подряд 🔥`, { title: 'Серия тренировок', value: `${hit.streak} ${daysWord(hit.streak)}`, sub: 'без пропусков' });
  if (hit.level) void autoPost('level', `Мой герой дорос до ${hit.level} уровня ⚔️`, { title: 'Новый уровень героя', value: `${hit.level} ур.`, sub: 'сила растёт с каждым повтором' });
}

/** Галочка в настройках: сервер тоже должен знать (он сам пишет о победе в вызове чата). */
export function setAutoPostsPref(on: boolean): void {
  if (canPost()) void socialApi.autoPref(on).catch(() => {});
}

export const daysWord = (n: number) => {
  const a = n % 10;
  const b = n % 100;
  return a === 1 && b !== 11 ? 'день' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'дня' : 'дней';
};

/** Картинка для ленты: JPEG, длинная сторона не больше 1000 px (сервер берёт до 900 КБ). */
async function shrinkJpeg(blob: Blob, side = 1000): Promise<Blob> {
  const img = await createImageBitmap(blob);
  const k = Math.min(1, side / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  const g = c.getContext('2d')!;
  g.fillStyle = '#0d0f17';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('jpeg'))), 'image/jpeg', 0.85));
}
