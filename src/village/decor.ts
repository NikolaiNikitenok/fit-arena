// Украшения деревни и её темы. Декор — только для красоты: в бою его нет, на сервер он уходит
// в копии прогресса, но набеги его не видят. Стоит на клетках сетки (1×1) и мешает ставить
// туда постройки, как в Clash of Clans. Убрать украшение можно в любой момент — цена вернётся.
//
// Темы меняют землю, деревья вокруг, небо и мелочи на траве: «Зима» и «Хэллоуин». В свой сезон
// тему можно забрать бесплатно, в остальное время — купить за золото деревни. Забранная тема остаётся.
import { canPlace, GRID, NO_RES, type Bld, type Res, RES_KEYS, sizeOf, thLevel, type Town } from '../../shared/village';
import type { Progress } from '../game/progress';
import { villageOf } from '../game/resources';
import { hasTown, townOf, withTown } from './state';
import { t } from '../i18n';

export type DecorKind = 'path' | 'oak' | 'pine' | 'bush' | 'flowers' | 'lantern' | 'bench' | 'well' | 'clanflag' | 'statue1' | 'statue2' | 'statue3' | 'pumpkin' | 'snowman';
export type ThemeId = 'classic' | 'winter' | 'halloween';

/** Украшение на сетке. Короткие ключи: сохранение маленькое. */
export interface Decor {
  i: number;
  k: DecorKind;
  x: number;
  y: number;
}

export interface DecorDef {
  kind: DecorKind;
  name: string;
  desc: string;
  cost: Partial<Res>;
  // Сколько можно поставить на этой ратуше.
  max: (th: number) => number;
  // Отдельный раздел витрины: украшения за достижения и сезонные.
  group: 'nature' | 'town' | 'earned' | 'season';
}

/** Что открывает украшения за достижения и сезонные. */
export interface DecorCtx {
  // Упражнений с личным рекордом в зале (src/gym).
  records: number;
  // Флаг клана игрока (bg.pattern.symbol.fg) или нет клана.
  clanFlag?: string;
  themes: ThemeId[];
  now: number;
}

export const STATUE_RECORDS = { statue1: 1, statue2: 10, statue3: 25 } as const;

const per = (base: number, step: number) => (th: number) => base + step * Math.max(0, th - 1);

export const DECOR: Record<DecorKind, DecorDef> = {
  path: { kind: 'path', name: t('Дорожка'), desc: t('Мощёная клетка. Жители ходят по дорожкам охотнее, чем по траве.'), cost: { stone: 10 }, max: per(60, 20), group: 'town' },
  oak: { kind: 'oak', name: t('Дуб'), desc: t('Раскидистое дерево для тени у домов.'), cost: { wood: 40 }, max: per(6, 2), group: 'nature' },
  pine: { kind: 'pine', name: t('Ель'), desc: t('Стройная ель. Зимой её припорошит снегом.'), cost: { wood: 40 }, max: per(6, 2), group: 'nature' },
  bush: { kind: 'bush', name: t('Куст'), desc: t('Пышный куст вдоль дорожек и стен.'), cost: { wood: 15 }, max: per(10, 3), group: 'nature' },
  flowers: { kind: 'flowers', name: t('Клумба'), desc: t('Цветы в деревянной кадке.'), cost: { wood: 20, gold: 10 }, max: per(8, 2), group: 'nature' },
  lantern: { kind: 'lantern', name: t('Фонарь'), desc: t('Зажигается вечером и горит до утра.'), cost: { wood: 30, stone: 20 }, max: per(6, 2), group: 'town' },
  bench: { kind: 'bench', name: t('Скамейка'), desc: t('Жители присаживаются отдохнуть.'), cost: { wood: 50 }, max: per(3, 1), group: 'town' },
  well: { kind: 'well', name: t('Колодец'), desc: t('Каменный колодец с воротом.'), cost: { stone: 150, wood: 80 }, max: (th) => (th >= 2 ? 2 : 1), group: 'town' },
  clanflag: { kind: 'clanflag', name: t('Знамя клана'), desc: t('Флаг твоего клана на высоком древке. Есть только у тех, кто в клане.'), cost: {}, max: () => 3, group: 'earned' },
  statue1: { kind: 'statue1', name: t('Бронзовая статуя'), desc: t('Герой на постаменте — за рекорд в зале ({0}+ упражнение с рекордом).', { 0: STATUE_RECORDS.statue1 }), cost: {}, max: () => 1, group: 'earned' },
  statue2: { kind: 'statue2', name: t('Серебряная статуя'), desc: t('За рекорды в {0} упражнениях в зале.', { 0: STATUE_RECORDS.statue2 }), cost: {}, max: () => 1, group: 'earned' },
  statue3: { kind: 'statue3', name: t('Золотая статуя'), desc: t('За рекорды в {0} упражнениях в зале.', { 0: STATUE_RECORDS.statue3 }), cost: {}, max: () => 1, group: 'earned' },
  pumpkin: { kind: 'pumpkin', name: t('Тыква-фонарь'), desc: t('Светится по ночам. Есть, пока у тебя тема «Хэллоуин».'), cost: { gold: 30 }, max: per(6, 2), group: 'season' },
  snowman: { kind: 'snowman', name: t('Снеговик'), desc: t('С морковкой и в шарфе. Есть, пока у тебя тема «Зима».'), cost: { stone: 20 }, max: per(3, 1), group: 'season' },
};
export const DECOR_KINDS = Object.keys(DECOR) as DecorKind[];
export const DECOR_GROUPS: { id: DecorDef['group']; name: string }[] = [
  { id: 'town', name: t('Улица') },
  { id: 'nature', name: t('Природа') },
  { id: 'earned', name: t('За достижения') },
  { id: 'season', name: t('Сезонные') },
];

export interface ThemeDef {
  id: ThemeId;
  name: string;
  desc: string;
  cost: Partial<Res>;
  // Когда тему можно забрать бесплатно: [месяц, день] начала и конца (месяц с нуля, конец включён).
  season?: { from: [number, number]; to: [number, number]; label: string };
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  classic: { id: 'classic', name: t('Лето'), desc: t('Зелёная трава, цветы и птицы.'), cost: {} },
  winter: { id: 'winter', name: t('Зима'), desc: t('Снег на земле и деревьях, снегопад чаще, снеговики.'), cost: { gold: 3000 }, season: { from: [11, 1], to: [1, 28], label: t('с 1 декабря по 28 февраля') } },
  halloween: { id: 'halloween', name: t('Хэллоуин'), desc: t('Сумерки, тыквы-фонари, надгробия и летучие мыши.'), cost: { gold: 3000 }, season: { from: [9, 15], to: [10, 10], label: t('с 15 октября по 10 ноября') } },
};
export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/** Идёт ли сезон темы в момент now (по местной дате). */
export function inSeason(id: ThemeId, now: number): boolean {
  const s = THEMES[id].season;
  if (!s) return false;
  const d = new Date(now);
  const v = d.getMonth() * 100 + d.getDate();
  const a = s.from[0] * 100 + s.from[1];
  const b = s.to[0] * 100 + s.to[1];
  return a <= b ? v >= a && v <= b : v >= a || v <= b;
}

export const decorOf = (p: Progress): Decor[] => villageOf(p).decor ?? [];
export const themeOf = (p: Progress): ThemeId => villageOf(p).theme ?? 'classic';
export const ownedThemes = (p: Progress): ThemeId[] => ['classic', ...(villageOf(p).themes ?? [])];

export function decorCtx(p: Progress, now: number): DecorCtx {
  return { records: Object.keys(p.gym?.best ?? {}).length, clanFlag: villageOf(p).clanFlag, themes: ownedThemes(p), now };
}

/** Почему украшение пока нельзя поставить (null — можно). */
export function decorLock(k: DecorKind, ctx: DecorCtx): string | null {
  if (k === 'clanflag') return ctx.clanFlag ? null : t('Вступи в клан — и его знамя можно поставить в деревне.');
  if (k === 'statue1' || k === 'statue2' || k === 'statue3') {
    const need = STATUE_RECORDS[k];
    return ctx.records >= need ? null : t('Нужны рекорды в зале: {0}/{1} упражнений.', { 0: ctx.records, 1: need });
  }
  if (k === 'pumpkin') return ctx.themes.includes('halloween') ? null : t('Открой тему «Хэллоуин».');
  if (k === 'snowman') return ctx.themes.includes('winter') ? null : t('Открой тему «Зима».');
  return null;
}

/** Постройки и украшения как одна сетка: украшение — занятая клетка (как секция стены). */
export function occupied(tm: Pick<Town, 'b'>, decor: Decor[], ignoreDecor?: number): Pick<Town, 'b'> {
  return { b: [...tm.b, ...decor.filter((d) => d.i !== ignoreDecor).map((d): Bld => ({ i: -1 - d.i, t: 'wall', x: d.x, y: d.y, l: 1 }))] };
}

export const canPlaceDecor = (tm: Pick<Town, 'b'>, decor: Decor[], x: number, y: number, ignore?: number) => canPlace(occupied(tm, decor, ignore), 'wall', x, y);

/** Клетки с украшениями (номер клетки → украшение): для касания и для земли. */
export function decorAt(decor: Decor[], x: number, y: number): Decor | undefined {
  return decor.find((d) => d.x === x && d.y === y);
}

export type DecorError = 'lock' | 'limit' | 'place' | 'cost';
export const DECOR_ERRORS: Record<DecorError, string> = { lock: t('Это украшение ещё не открыто.'), limit: t('Больше таких не поставить: улучши ратушу.'), place: t('Здесь занято.'), cost: t('Не хватает ресурсов.') };

const costRes = (k: DecorKind): Res => ({ ...NO_RES, ...DECOR[k].cost });

function put(p: Progress, tm: Town, decor: Decor[], extra: { dn?: number } = {}): Progress {
  const q = withTown(p, tm);
  return { ...q, village: { ...villageOf(q), decor, ...extra } };
}

/** Поставить украшение: цена списывается из запасов деревни. */
export function placeDecor(p: Progress, k: DecorKind, x: number, y: number, ctx: DecorCtx): Progress | DecorError {
  if (!hasTown(p)) return 'place';
  const tm = townOf(p);
  const list = decorOf(p);
  if (decorLock(k, ctx)) return 'lock';
  if (list.filter((d) => d.k === k).length >= DECOR[k].max(thLevel(tm))) return 'limit';
  if (!canPlaceDecor(tm, list, x, y)) return 'place';
  const cost = costRes(k);
  if (!RES_KEYS.every((r) => tm.res[r] >= cost[r])) return 'cost';
  const v = villageOf(p);
  const i = v.dn ?? list.reduce((m, d) => Math.max(m, d.i), 0) + 1;
  const res = { wood: tm.res.wood - cost.wood, stone: tm.res.stone - cost.stone, gold: tm.res.gold - cost.gold };
  return put(p, { ...tm, res }, [...list, { i, k, x, y }], { dn: i + 1 });
}

export function moveDecor(p: Progress, i: number, x: number, y: number): Progress | null {
  const tm = townOf(p);
  const list = decorOf(p);
  if (!list.some((d) => d.i === i) || !canPlaceDecor(tm, list, x, y, i)) return null;
  return put(p, tm, list.map((d) => (d.i === i ? { ...d, x, y } : d)));
}

/** Убрать украшение: цена возвращается в запасы. */
export function removeDecor(p: Progress, i: number): Progress {
  const list = decorOf(p);
  const d = list.find((v) => v.i === i);
  if (!d) return p;
  const tm = townOf(p);
  const back = costRes(d.k);
  return put(p, { ...tm, res: { wood: tm.res.wood + back.wood, stone: tm.res.stone + back.stone, gold: tm.res.gold + back.gold } }, list.filter((v) => v.i !== i));
}

/** Ближайшая к точке свободная клетка для украшения. */
export function freeDecorSpot(tm: Pick<Town, 'b'>, decor: Decor[], near: { x: number; y: number }): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  const occ = occupied(tm, decor);
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) {
      if (!canPlace(occ, 'wall', x, y)) continue;
      const d = (x + 0.5 - near.x) ** 2 + (y + 0.5 - near.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  return best;
}

export type ThemeError = 'cost' | 'owned';
/** Забрать тему: в сезон бесплатно, иначе за золото. И сразу включить. */
export function claimTheme(p: Progress, id: ThemeId, now: number): Progress | ThemeError {
  if (ownedThemes(p).includes(id)) return 'owned';
  const tm = townOf(p);
  const cost: Res = inSeason(id, now) ? { ...NO_RES } : { ...NO_RES, ...THEMES[id].cost };
  if (!RES_KEYS.every((r) => tm.res[r] >= cost[r])) return 'cost';
  const q = withTown(p, { ...tm, res: { wood: tm.res.wood - cost.wood, stone: tm.res.stone - cost.stone, gold: tm.res.gold - cost.gold } });
  const v = villageOf(q);
  return { ...q, village: { ...v, themes: [...(v.themes ?? []), id], theme: id } };
}

export function setTheme(p: Progress, id: ThemeId): Progress {
  if (!ownedThemes(p).includes(id)) return p;
  return { ...p, village: { ...villageOf(p), theme: id } };
}

/** Флаг клана для знамён в деревне (из экрана клана). null — игрок не в клане. */
export function syncClanFlag(p: Progress, flag: string | null): Progress | null {
  const v = villageOf(p);
  if ((v.clanFlag ?? null) === flag) return null;
  const next = { ...v };
  if (flag) next.clanFlag = flag;
  else delete next.clanFlag;
  return { ...p, village: next };
}

/** Клетки дорожек: земля под ними мощёная. */
export const pathCells = (decor: Decor[]) => decor.filter((d) => d.k === 'path').map((d) => d.y * GRID + d.x);

/** Не стоит ли украшение на постройке (после переноса постройки сохранение могло разъехаться). */
export const decorFits = (tm: Pick<Town, 'b'>, d: Decor) => !tm.b.some((b) => d.x >= b.x && d.x < b.x + sizeOf(b.t) && d.y >= b.y && d.y < b.y + sizeOf(b.t));
