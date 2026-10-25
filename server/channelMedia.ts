// Скриншоты для постов в каналах: лежат в server/media/channel (на сервере — media/channel рядом с server.cjs).
// Claude выбирает картинки по подписи; к личному каналу можно приложить свой скрин ответом на черновик.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CHANNEL_MEDIA: Record<string, string> = {
  cover: 'Обложка NikitenokArena: «Каждый повтор — удар по врагу», телефоны с игрой',
  splash: 'Заставка при запуске приложения с логотипом',
  'home-hero': 'Главный экран: большой герой, уровень, кнопка «В бой»',
  'adventure-home': 'Экран приключения «Атлетия»: герой, ранг, кнопка продолжить',
  'adventure-map': 'Карта мира приключения с уровнями и боссами',
  worlds: 'Обзор миров приключения: фэнтези, космос, зомби',
  'level-start': 'Начало уровня: персонаж даёт задание («Лебёдка на утёс»)',
  onboarding: 'Знакомство с игрой: Мастер Гром, как камера считает повторы',
  'camera-guide': 'Подсказка, как поставить телефон для камеры (3D-герой показывает позу)',
  'voice-calibration': 'Калибровка камеры под человека и голосовой тренер в настройках',
  'daily-task': 'Задание дня от персонажа (Лиса, бабушка Марфа)',
  'raid-boss-fight': 'Бой с рейд-боссом клана «Великан Лень» под камеру',
  duel: 'Дуэль на арене с живым соперником: счёт повторов и победа',
  'trainer-sparring': 'Спарринг с тренером (Лиса, Гром, Князь Диван)',
  clan: 'Экран клана: участники, роли, флаг',
  'clan-levels': 'Уровни клана и награды',
  'clan-wars': 'Война кланов: счёт двух кланов и лучшие бойцы',
  friends: 'Друзья: кто тренировался сегодня, вызов на дуэль',
  'event-boss': 'Ежемесячный босс-событие выходного дня',
  'season-pass': 'Сезонный пропуск: награды по уровням, бесплатный и Pro путь',
  pets: 'Питомцы: яйцо дракона и прокачка питомца',
  inventory: 'Инвентарь героя: оружие, щиты, зелья',
  shop: 'Магазин снаряжения с редкостью оружия',
  achievements: 'Достижения и титулы',
  stats: 'Статистика «Твоя сила»: календарь тренировок и график за 30 дней',
  'share-card': 'Карточка «Повержен босс», которой можно поделиться',
  programs: 'Программы тренировок на несколько недель',
  'gym-home': 'Главный экран с входом в дневник зала',
  'gym-diary': 'Дневник зала: шаблоны тренировок и история',
  'gym-workout': 'Тренировка в зале: подходы, веса, повторы',
  'dungeon-match3': 'Подземелье «три в ряд»: заряд от повторов превращается в ресурсы',
  'village-day-night': 'Деревня днём и ночью, вид на остров',
  'village-summer': 'Деревня летом',
  'village-halloween': 'Деревня в оформлении Хэллоуина',
  'village-winter': 'Деревня зимой, снег',
  'village-night': 'Деревня ночью: огни в окнах',
  'village-defense-win': 'Полный разгром: победа в набеге на деревню',
  'village-raid': 'Набег на чужую деревню: войска идут в бой',
  'hero-skills': 'Умения героя в бою за деревню',
  laboratory: 'Лаборатория: улучшение войск',
  'village-decor': 'Магазин украшений для деревни',
};

/** Список для промпта: «имя — что на картинке». */
export const mediaCatalogText = (): string => Object.entries(CHANNEL_MEDIA).map(([k, v]) => `- ${k} — ${v}`).join('\n');

/** Оставляем только известные картинки, без повторов, не больше трёх. */
export const pickMedia = (names: unknown): string[] => (Array.isArray(names) ? [...new Set(names.filter((n): n is string => typeof n === 'string' && n in CHANNEL_MEDIA))].slice(0, 3) : []);

/** Картинка поста: файл из библиотеки или file_id фото, которое прислали боту. */
export type MediaRef = { file: string } | { fileId: string };

export type Upload = (method: string, fields: Record<string, unknown>, files: { field: string; name: string; type: string; data: Buffer }[]) => Promise<{ ok: boolean; result?: unknown; description?: string }>;
type Bot = (method: string, body: unknown) => Promise<{ ok: boolean; result?: unknown; description?: string }>;

// После первой загрузки Telegram даёт file_id: дальше шлём его, а не файл.
const fileIds = new Map<string, string>();
export const mediaDir = (base: string) => join(base, 'media', 'channel');

/**
 * Пост с картинками: одна — фото с подписью, несколько — альбом с подписью у первой.
 * Подпись в Telegram — до 1024 знаков: если текст длиннее, картинки идут отдельным сообщением перед текстом.
 * Возвращает id сообщения с текстом.
 */
export async function sendWithMedia(o: {
  bot: Bot;
  upload: Upload;
  dir: string;
  chatId: string | number;
  html: string;
  plain: string;
  media: MediaRef[];
  replyMarkup?: unknown;
}): Promise<{ ok: boolean; messageId?: number; description?: string }> {
  const fitsCaption = o.plain.length <= 1000;
  const files: { field: string; name: string; type: string; data: Buffer }[] = [];
  const refs = o.media.map((m, i) => {
    if ('fileId' in m) return m.fileId;
    const cached = fileIds.get(m.file);
    if (cached) return cached;
    files.push({ field: `f${i}`, name: `${m.file}.jpg`, type: 'image/jpeg', data: readFileSync(join(o.dir, `${m.file}.jpg`)) });
    return `attach://f${i}`;
  });
  const remember = (result: unknown) => {
    const list = (Array.isArray(result) ? result : [result]) as { photo?: { file_id: string }[] }[];
    list.forEach((msg, i) => {
      const m = o.media[i];
      const sizes = msg?.photo;
      if (m && 'file' in m && sizes?.length) fileIds.set(m.file, sizes[sizes.length - 1].file_id);
    });
  };
  const call = (method: string, fields: Record<string, unknown>) => (files.length ? o.upload(method, fields, files) : o.bot(method, fields));
  const caption = fitsCaption ? { caption: o.html, parse_mode: 'HTML' } : {};
  let r;
  if (refs.length === 1) {
    const photo = refs[0];
    r = await call('sendPhoto', { chat_id: o.chatId, photo, ...caption, reply_markup: fitsCaption ? o.replyMarkup : undefined });
  } else {
    const media = refs.map((m, i) => ({ type: 'photo', media: m, ...(i === 0 ? caption : {}) }));
    r = await call('sendMediaGroup', { chat_id: o.chatId, media });
  }
  if (!r.ok) return { ok: false, description: r.description };
  remember(r.result);
  const first = (Array.isArray(r.result) ? r.result[0] : r.result) as { message_id?: number } | undefined;
  // Альбом не умеет кнопки — у альбома её просто нет. Длинный текст идёт следующим сообщением, уже с кнопкой.
  if (fitsCaption) return { ok: true, messageId: first?.message_id };
  const t = await o.bot('sendMessage', { chat_id: o.chatId, text: o.html, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: o.replyMarkup });
  return { ok: t.ok, messageId: (t.result as { message_id?: number } | undefined)?.message_id, description: t.description };
}
