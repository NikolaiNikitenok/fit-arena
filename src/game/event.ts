// Событие выходных: раз в месяц, в последние полные выходные (суббота 00:00 — воскресенье 23:59
// по местному времени), на 48 часов приходит особый босс. Каждый месяц свой, их двенадцать по кругу.
// Здоровье босса общее на все попытки этих выходных: урон копится. Попытки жизнь не тратят,
// но их три в день. Кто добьёт босса, получает его облик (только из события), монеты и сундук.
import type { Exercise } from '../repCounter';
import type { CharName } from '../three/kit';
import { bossDrop, Gear, itemById, Item } from './items';
import { LAND_SIZE, LEVEL_COUNT, LEVELS, type Line } from './levels';
import { expectedDamage, heroPower } from './power';
import { countPass, currentLevel, dayKey, Progress, saveProgress } from './progress';
import { say } from './story';
import type { NpcId } from './npcs';
import { EN_MONTHS, isEn } from '../i18n';

export const EVENT_TRIES_PER_DAY = 3;
export const EVENT_ATTEMPT_S = 90;
export const EVENT_PREP_S = 5;
// Босс бьёт, если герой стоит без повторов дольше этого.
export const EVENT_IDLE_MS = 7000;
// Сколько хороших попыток нужно, чтобы добить босса: из шести за выходные.
export const EVENT_TOUGHNESS = 3.5;
// Монеты за победу (с бонусом облика).
export const EVENT_COINS = 800;

const DAY = 86_400_000;

export interface EventWindow {
  // Начало и конец ближайшего (или идущего) события, мс по местному времени.
  start: number;
  end: number;
  // Ключ месяца события: YYYY-MM.
  key: string;
  live: boolean;
}

/** Суббота последних полных выходных месяца: день перед последним воскресеньем (оно всегда не раньше 22-го). */
export function lastWeekend(year: number, month: number): { start: number; end: number } {
  const last = new Date(year, month + 1, 0);
  const sunday = last.getDate() - last.getDay();
  // Через конструктор даты: переход на летнее время не сдвигает полночь.
  return { start: new Date(year, month, sunday - 1).getTime(), end: new Date(year, month, sunday + 1).getTime() };
}

const monthKey = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, '0')}`;

/** Идущее событие или ближайшее следующее. */
export function eventWindow(now: number): EventWindow {
  const d = new Date(now);
  let year = d.getFullYear();
  let month = d.getMonth();
  let w = lastWeekend(year, month);
  if (now >= w.end) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    w = lastWeekend(year, month);
  }
  return { ...w, key: monthKey(year, month), live: now >= w.start && now < w.end };
}

/** Через сколько календарных дней начнётся событие (0 — уже идёт или начнётся сегодня ночью). */
export function daysUntil(w: EventWindow, now: number): number {
  if (now >= w.start) return 0;
  const d = new Date(now);
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.max(0, Math.round((w.start - today) / DAY));
}

export interface EventBoss {
  id: string;
  name: string;
  // Короткая подпись: кто он такой.
  title: string;
  model: CharName;
  tint: string;
  glow: string;
  // Арена: земля, небо и туман, акцент.
  ground: string;
  sky: string;
  accent: string;
  // Кто рассказывает про босса и что говорит сам босс.
  npc: NpcId;
  story: string[];
  taunt: string;
  defeat: string;
  // Облик за победу.
  outfit: string;
}

// Босс месяца: январь — первый. Тема по времени года.
export const EVENT_BOSSES: EventBoss[] = [
  { id: 'ice', name: 'Ледяной Лентяй', title: 'Заморозил всех под тёплым одеялом', model: 'Skeleton_Warrior', tint: 'mul:0.75,1.05,1.5', glow: '#80deea', ground: '#dcecf7', sky: '#9fc4e6', accent: '#4fc3f7', npc: 'grom', story: ['Чуешь холод? Это не зима, ученик. Это Ледяной Лентяй.', 'Он шепчет: «На улице мороз, лучше полежи». А кто его послушает, тот примерзает к дивану.'], taunt: 'Брр… Зачем двигаться? Замри со мной, будет тепло… наверное.', defeat: 'Тает… я таю! А ведь бегать и правда теплее.', outfit: 'event-ice' },
  { id: 'remote', name: 'Король Пульта', title: 'Правит всеми экранами королевства', model: 'Skeleton_Mage', tint: 'mul:1.2,0.65,1.25', glow: '#ff4081', ground: '#2b2236', sky: '#3a1f3f', accent: '#ff4081', npc: 'lisa', story: ['Видел? Все жители сидят и смотрят в светящиеся окошки. Ни шагу.', 'Это Король Пульта. Одно нажатие — и ещё серия, и ещё. Отберём у него пульт?'], taunt: 'Не переключай! Следующая серия начнётся через пять… четыре…', defeat: 'Экран погас… А за окном, оказывается, солнце.', outfit: 'event-remote' },
  { id: 'pizza', name: 'Пиццезавр', title: 'Ящер из теста, сыра и колбасок', model: 'Skeleton_Minion', tint: 'mul:1.45,0.95,0.5', glow: '#ff7043', ground: '#c98b4a', sky: '#ffcc80', accent: '#ffb300', npc: 'marfa', story: ['Внучек, беда! Из старой печи вылез Пиццезавр.', 'Ходит по дворам и раздаёт кусочки: «Съешь ещё, и полежи». Пирожки — дело хорошее, но меру надо знать!'], taunt: 'Ещё кусочек? С двойным сыром! А потом вздремнём.', defeat: 'Ох… Пожалуй, мне нужна разминка после ужина.', outfit: 'event-pizza' },
  { id: 'excuse', name: 'Мастер Отговорок', title: 'Знает тысячу причин не начинать', model: 'Skeleton_Rogue', tint: 'mul:1.3,1.2,0.6', glow: '#ffd54f', ground: '#6d8f4e', sky: '#c5e1a5', accent: '#ffd54f', npc: 'fedor', story: ['Слыхал про Мастера Отговорок? Он мне продал мешок «завтра». Пустой!', 'Ходит и шепчет каждому: «Дождь, устал, понедельник». Покажи ему, что отговорки кончились.'], taunt: 'Сегодня? Нет-нет. Погода не та, настроение не то. Начнём завтра!', defeat: 'Причин не осталось… Придётся просто делать.', outfit: 'event-excuse' },
  { id: 'grill', name: 'Барон Шашлык', title: 'Майские выходные без конца', model: 'Skeleton_Warrior', tint: 'mul:1.4,0.7,0.5', glow: '#ff8a65', ground: '#558b2f', sky: '#ffccbc', accent: '#ff7043', npc: 'boris', story: ['Помню, как сам застрял у мангала на всё лето. Это Барон Шашлык постарался.', 'Он зовёт всех на «ещё одну шпажку», и никто не встаёт из шезлонгов. Пора размяться.'], taunt: 'Присядь к огоньку! Куда спешить, ещё маринуется.', defeat: 'Угли остыли… Пойду-ка я на пробежку.', outfit: 'event-grill' },
  { id: 'lounger', name: 'Граф Шезлонг', title: 'Владелец всех пляжей Атлетии', model: 'Skeleton_Mage', tint: 'mul:0.7,1.15,1.3', glow: '#4dd0e1', ground: '#f3d9a4', sky: '#80deea', accent: '#26c6da', npc: 'lisa', story: ['Пляж забит. Все лежат, никто не плавает. Даже чайки сели.', 'Граф Шезлонг раскладывает лежаки быстрее, чем ты моргнёшь. Сложим их обратно?'], taunt: 'Лежак свободен. Специально для тебя. Навсегда.', defeat: 'Мой шезлонг… сложился. Ладно, окунусь.', outfit: 'event-lounger' },
  { id: 'icecream', name: 'Пломбирный Голем', title: 'Холодный, сладкий и очень тяжёлый', model: 'Skeleton_Minion', tint: 'mul:1.4,1.1,1.25', glow: '#f8bbd0', ground: '#f8e1ec', sky: '#fce4ec', accent: '#f48fb1', npc: 'marfa', story: ['Жара, и все сидят в тени с мороженым. А из мороженого вырос Голем!', 'Чем больше его едят, тем он сильнее. Растопи его, внучек, только движением.'], taunt: 'В такую жару — шевелиться? Лучше съешь меня. Медленно.', defeat: 'Я… растаял. Зато какая лужица вкусная.', outfit: 'event-icecream' },
  { id: 'siesta', name: 'Султан Сиесты', title: 'Полуденный сон длиной в месяц', model: 'Skeleton_Rogue', tint: 'mul:1.35,1.05,0.55', glow: '#ffb300', ground: '#e0b56a', sky: '#ffe0b2', accent: '#ff8f00', npc: 'fedor', story: ['Торговля стоит: Султан Сиеста объявил полдень на весь август.', 'Все дремлют под навесами, караваны не идут. Разбуди его, я в долгу не останусь.'], taunt: 'Тссс… Полдень. Сейчас все спят. И ты спи.', defeat: 'Уже вечер? Я проспал всё лето! Пора за дела.', outfit: 'event-siesta' },
  { id: 'alarm', name: 'Будильник-Предатель', title: 'Звонит, только когда уже поздно', model: 'Skeleton_Warrior', tint: 'mul:0.85,0.9,1.0', glow: '#b0bec5', ground: '#546e7a', sky: '#90a4ae', accent: '#cfd8dc', npc: 'bip', story: ['БИП! Обнаружен сбой: все будильники Атлетии отложены на «ещё пять минут».', 'Источник сигнала — Будильник-Предатель. Рекомендация: перезагрузить его силой. БИП-БИП!'], taunt: 'Дзынь… Шучу. Отложить ещё на пять минут? И ещё?', defeat: 'Дзыыынь! Подъём! Ой, это я сам себя разбудил.', outfit: 'event-alarm' },
  { id: 'pumpkin', name: 'Тыквенный Соня', title: 'Осенняя дрёма в тыквенной голове', model: 'Skeleton_Mage', tint: 'mul:1.5,0.85,0.4', glow: '#ff9100', ground: '#6d4c41', sky: '#ffab40', accent: '#ff6d00', npc: 'grom', story: ['Листья падают, а с ними и жители: на диваны. Тыквенный Соня вернулся.', 'Он светит фонарём в окна и шепчет: «Темнеет рано, ложись». Покажем ему, что осень — время силы.'], taunt: 'Ууу… Темно, дождь, плед. Зачем вставать до весны?', defeat: 'Фонарь погас… А в голове ясно, как утром.', outfit: 'event-pumpkin' },
  { id: 'blanket', name: 'Туманный Плед', title: 'Укутывает всех, кто остановился', model: 'Skeleton_Rogue', tint: 'mul:0.8,0.7,1.25', glow: '#9575cd', ground: '#4a4458', sky: '#7e7392', accent: '#b39ddb', npc: 'marfa', story: ['Ноябрь, туман, и с холмов сполз Туманный Плед. Мягкий такой, тёплый.', 'Кого обнимет, тот до зимы не встанет. Я сама еле вырвалась, внучек. Твоя очередь!'], taunt: 'Иди ко мне… Я тёплый. Я мягкий. Я навсегда.', defeat: 'Ты меня… сложил аккуратно. Спасибо. Теперь я в шкафу.', outfit: 'event-blanket' },
  { id: 'olivier', name: 'Обжора Оливье', title: 'Праздничный стол длиной в каникулы', model: 'Skeleton_Minion', tint: 'mul:0.9,1.3,0.75', glow: '#66bb6a', ground: '#e8f5e9', sky: '#a5d6a7', accent: '#43a047', npc: 'boris', story: ['Праздники на носу, а Обжора Оливье уже накрыл стол на все каникулы.', 'Сел гость за стол — и до февраля не встаёт. Давай разомнёмся перед боем, как я учил.'], taunt: 'Ещё ложечку! Салат же пропадёт! А потом полежим.', defeat: 'Тазик пуст… Пойду, пожалуй, на каток.', outfit: 'event-olivier' },
];

/** Босс месяца события: ключ YYYY-MM, январь — первый в списке. */
export const eventBoss = (key: string): EventBoss => EVENT_BOSSES[(Number(key.slice(5, 7)) - 1 + 12) % 12];

export const eventOutfit = (boss: EventBoss): Item => itemById(boss.outfit);

const bossFace = (b: EventBoss) => (b.model === 'Skeleton_Mage' ? 'boss-0m' : 'boss-0');
export const eventBossSay = (b: EventBoss, text: string): Line => ({ who: b.name, text, face: bossFace(b), color: b.glow });

/** Вступление перед боем: рассказ жителя и слова самого босса. */
export const eventIntro = (b: EventBoss): Line[] => [...b.story.map((tm) => say(b.npc, tm)), eventBossSay(b, b.taunt)];

export interface EventState {
  key: string;
  // Здоровье босса фиксируется при первой попытке: сила героя за выходные его не меняет.
  hpMax: number;
  dealt: number;
  // Попытки по дням (YYYY-MM-DD по местному времени).
  tries: Record<string, number>;
  // Босс повержен и награда выдана.
  won?: boolean;
}

/** Здоровье босса под этого героя: три с половиной хорошие попытки по полторы минуты, урон — не ниже ожидаемого на его уровне. */
export function eventHp(p: Progress): number {
  const level = currentLevel(p, LEVEL_COUNT);
  const damage = Math.max(heroPower(p).damage, expectedDamage(level));
  const perMinute = (p.baseline.squat + p.baseline.pushup + p.baseline.situp) / 3;
  const reps = perMinute * (EVENT_ATTEMPT_S / 60);
  return Math.max(500, Math.round((reps * damage * EVENT_TOUGHNESS) / 50) * 50);
}

/** Событие этого месяца в прогрессе: в новом месяце всё начинается заново. */
export function eventOf(p: Progress, now: number): EventState {
  const { key } = eventWindow(now);
  return p.event?.key === key ? p.event : { key, hpMax: eventHp(p), dealt: 0, tries: {} };
}

export const triesLeft = (p: Progress, now: number): number => Math.max(0, EVENT_TRIES_PER_DAY - (eventOf(p, now).tries[dayKey(now)] ?? 0));

export const eventHpLeft = (s: EventState) => Math.max(0, s.hpMax - s.dealt);

export interface EventReward {
  coins: number;
  outfit: Item;
  // Сундук события: вещь уровня дальней земли или монеты, если всё уже собрано.
  gear?: Gear;
  chestCoins: number;
}

/**
 * Попытка закончилась: урон в общую копилку и одна попытка из трёх на сегодня.
 * null — события сейчас нет, попытки кончились, босс уже повержен или повторов не было.
 */
export function recordEventHit(p: Progress, dealt: number, now: number): { progress: Progress; killed: boolean; reward?: EventReward } | null {
  const w = eventWindow(now);
  const s = eventOf(p, now);
  if (!w.live || s.won || dealt <= 0 || triesLeft(p, now) <= 0) return null;
  const day = dayKey(now);
  const total = Math.min(s.hpMax, s.dealt + Math.round(dealt));
  const killed = total >= s.hpMax;
  const state: EventState = { ...s, dealt: total, tries: { ...s.tries, [day]: (s.tries[day] ?? 0) + 1 }, won: killed || undefined };
  if (!killed) return { progress: saveProgress({ ...p, event: state }), killed };
  // Победа: облик босса, монеты и сундук. Для пропуска и заданий это победа над боссом.
  const boss = eventBoss(w.key);
  const outfit = eventOutfit(boss);
  const land = Math.floor((currentLevel(p, LEVEL_COUNT) - 1) / LAND_SIZE);
  const bonus = itemById(p.equipped).coinBonus;
  const coins = Math.round(EVENT_COINS * (1 + bonus));
  const items = p.items.includes(outfit.id) ? p.items : [...p.items, outfit.id];
  const gear = bossDrop(Math.min(LEVELS[LEVELS.length - 1].land, land + 3), items);
  const chestCoins = gear ? 0 : 300;
  const counted = countPass(countPass(p, 'win', 1, now), 'boss', 1, now);
  const next: Progress = {
    ...counted,
    event: state,
    coins: p.coins + coins + chestCoins,
    items: gear ? [...items, gear.id] : items,
    eventWins: [...(p.eventWins ?? []), w.key],
  };
  return { progress: saveProgress(next), killed, reward: { coins, outfit, gear, chestCoins } };
}

// Упражнения на выбор в каждой попытке.
export const EVENT_EXERCISES: Exercise[] = ['squat', 'pushup', 'situp'];

/** «2 дн 4 ч», «5 ч 12 мин», «12 мин» — до конца события или до его начала. */
export function fmtLeft(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (isEn()) return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m % 60}m` : `${Math.max(1, m)}m`;
  if (d > 0) return `${d} дн ${h} ч`;
  if (h > 0) return `${h} ч ${m % 60} мин`;
  return `${Math.max(1, m)} мин`;
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
/** «24–25 октября». */
export function fmtWeekend(w: EventWindow): string {
  const a = new Date(w.start);
  const b = new Date(w.end - 1);
  if (isEn()) return a.getMonth() === b.getMonth() ? `${EN_MONTHS[a.getMonth()]} ${a.getDate()}–${b.getDate()}` : `${EN_MONTHS[a.getMonth()]} ${a.getDate()} – ${EN_MONTHS[b.getMonth()]} ${b.getDate()}`;
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MONTHS_GEN[a.getMonth()]}` : `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`;
}

/** «через 5 дней», «завтра», «через 1 день». */
export function fmtDays(n: number): string {
  if (isEn()) return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
  if (n <= 0) return 'сегодня';
  if (n === 1) return 'завтра';
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11 ? 'день' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'дня' : 'дней';
  return `через ${n} ${word}`;
}
