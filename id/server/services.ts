// Сервисы экосистемы Nikitenok: карточки на главной id.nikitenok.ru, на входе и в кабинете.
// client — id приложения в clients.json: если оно там есть, у карточки отметка «Вход через Nikitenok ID».

export interface Service {
  id: string;
  name: string;
  /** Короткое имя для плиток и списков. */
  short: string;
  tagline: string;
  text: string;
  points: string[];
  url: string;
  audience: string;
  /** Два цвета градиента карточки. */
  c1: string;
  c2: string;
  icon: string;
  client?: string;
}

const svg = (d: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</g></svg>`;

export const SERVICES: Service[] = [
  {
    id: 'arena',
    name: 'NikitenokArena',
    short: 'Арена',
    tagline: 'Фитнес-игра, где камера считает повторения',
    text: 'Отжимания, приседания и пресс засчитывает камера телефона. Дуэли с живыми соперниками, кланы, рейды на боссов и своя деревня.',
    points: ['Счёт повторений по камере', 'Дуэли, кланы и сезоны', 'Приключение на 300 уровней'],
    url: 'https://arena.nikitenok.ru',
    audience: 'Telegram и браузер',
    c1: '#FF9A4D',
    c2: '#FF3D6E',
    icon: svg('<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5v1.5A3 3 0 0 0 7.5 10.5M17 6h2.5v1.5a3 3 0 0 1-3 3"/><path d="M12 14v3.5M8.5 20.5h7M9.5 17.5h5v3h-5z"/>'),
    client: 'arena',
  },
  {
    id: 'print',
    name: 'Nikitenok Print Control',
    short: 'Print Control',
    tagline: 'Учёт техники и печати в организации',
    text: 'Принтеры, расходники и инвентарные номера, сети и стойки в 3D, план этажа со зданием, QR-наклейки и обходы, панель «Требует внимания».',
    points: ['Принтеры, расходники, ИСН', 'Стойки и здание в 3D', 'QR-наклейки и обходы'],
    url: 'https://print.nikitenok.ru',
    audience: 'Для организаций',
    c1: '#4FD1FF',
    c2: '#3B5BFF',
    icon: svg('<path d="M7 8.5V3.5h10v5"/><rect x="3.5" y="8.5" width="17" height="8" rx="2"/><path d="M7 13.5h10v7H7z"/><path d="M9.5 16.5h5M9.5 18.5h3"/><circle cx="17.2" cy="11.2" r=".6" fill="currentColor"/>'),
    client: 'print',
  },
  {
    id: 'family',
    name: 'Семейная касса',
    short: 'Семейная касса',
    tagline: 'Бюджет, цели и дневник семьи',
    text: 'Общий семейный бюджет, цели и планы, дневник, куда сами попадают тренировки из Арены.',
    points: ['Общий бюджет и расходы', 'Цели и планы семьи', 'Тренировки из Арены'],
    url: 'https://nikitenok.ru',
    audience: 'Для всей семьи',
    c1: '#45E3A0',
    c2: '#0E9F6E',
    icon: svg('<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 17z"/><path d="M4 8.5A2.5 2.5 0 0 0 6.5 11H20"/><path d="M16 15h1.5"/><path d="M7 6l7.5-2.5L16 6"/>'),
    client: 'family',
  },
  {
    id: 'habit',
    name: 'Свобода',
    short: 'Свобода',
    tagline: 'Жизнь без вредных привычек',
    text: 'Таймер чистых дней и копилка, кнопка SOS при тяге с занятиями, которые помогают переждать, награды и личный план.',
    points: ['Таймер дней и копилка', 'Кнопка SOS при тяге', 'Награды и график тяги'],
    url: 'https://habit.nikitenok.ru',
    audience: 'Телефон и компьютер',
    c1: '#5EEAD4',
    c2: '#0EA5B7',
    icon: svg('<path d="M3.5 17.5h17"/><path d="M6.5 17.5a5.5 5.5 0 0 1 11 0"/><path d="M12 6.5V4M5.5 9.5 4 8M18.5 9.5 20 8"/><path d="M8 20.5h8"/>'),
    client: 'habit',
  },
  {
    id: 'server',
    name: 'Nikitenok Сервер',
    short: 'Сервер',
    tagline: 'Управление сервером из Telegram',
    text: 'Нагрузка и состояние сервера, сервисы и сайты, перезапуск в одно касание и терминал прямо в мини-приложении.',
    points: ['Нагрузка и состояние', 'Сервисы и сайты', 'Терминал в Telegram'],
    url: 'https://admin.nikitenok.ru',
    audience: 'Для администраторов',
    c1: '#B38CFF',
    c2: '#6A3DF0',
    icon: svg('<rect x="3.5" y="4" width="17" height="6.5" rx="1.8"/><rect x="3.5" y="13.5" width="17" height="6.5" rx="1.8"/><path d="M7 7.25h.01M7 16.75h.01M10.5 7.25h6M10.5 16.75h6"/>'),
    client: 'server',
  },
];

