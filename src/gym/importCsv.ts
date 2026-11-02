// Импорт истории из Strong и Hevy: их CSV-выгрузки превращаются в тренировки дневника зала.
// Названия упражнений у них английские, вида «Bench Press (Barbell)»: движение ищем по английским
// названиям каталога и синонимам, снаряд — по слову в скобках. Не нашлось — станет своим упражнением.
import { type Equip, GYM_EXERCISES, customId, gymExercise } from './catalog';
import { bestOf, gymOf, HISTORY_MAX, type GymBest, type GymSession, type GymSet, type GymState } from './gym';
import type { Progress } from '../game/progress';
import { t } from '../i18n';

// Английские названия движений каталога (ключ id до точки).
const EN_NAMES: Record<string, string> = {"bench": "Bench press", "incline": "Incline bench press", "decline": "Decline bench press", "closebench": "Close-grip bench press", "floorpress": "Floor press", "fly": "Dumbbell fly", "inclinefly": "Incline fly", "pecdeck": "Pec deck (butterfly)", "crossover": "Cable crossover", "lowcrossover": "Low-to-high cable fly", "chestpress": "Seated chest press", "pullover": "Pullover", "dips": "Dips", "assistdips": "Assisted dips", "pushups": "Push-ups", "svend": "Svend press", "hammerpress": "Lever chest press", "inclinepress": "Machine incline press", "spoto": "Spoto press", "squeeze": "Squeeze press", "deadlift": "Deadlift", "sumo": "Sumo deadlift", "rack": "Block pull", "pulldown": "Lat pulldown", "closepulldown": "Close-grip pulldown", "behindpulldown": "Behind-the-neck pulldown", "pullup": "Pull-ups", "chinup": "Chin-ups", "assistpullup": "Assisted pull-ups", "row": "Bent-over row", "pendlay": "Pendlay row", "onearm": "One-arm row", "tbar": "T-bar row", "seatedrow": "Seated cable row", "chestrow": "Chest-supported row", "straightpd": "Straight-arm pulldown", "hyper": "Back extension", "goodmorning": "Good morning", "shrug": "Shrugs", "invrow": "Inverted rows", "kbswing": "Kettlebell swings", "meadows": "Meadows row", "sealrow": "Seal row", "highrow": "Lever pulldown", "kbrow": "Kettlebell row", "muscleup": "Muscle-up", "ohp": "Overhead press (military)", "seatedpress": "Seated press", "arnold": "Arnold press", "pushpress": "Push press", "lateral": "Lateral raises", "front": "Front raises", "reardelt": "Rear delt raises", "reverseFly": "Reverse pec deck", "facepull": "Face pull", "upright": "Upright row", "landmine": "Landmine press", "kbpress": "Kettlebell press", "ytw": "Prone Y-T-W raises", "cuban": "Cuban press", "extrot": "External shoulder rotation", "pikepush": "Pike push-ups", "handstand": "Handstand push-ups", "curl": "Biceps curl", "hammer": "Hammer curls", "preacher": "Preacher curl", "inclinecurl": "Incline curl", "concentration": "Concentration curl", "spider": "Spider curl", "reversecurl": "Reverse curl", "bayesian": "Bayesian curl", "zottman": "Zottman curl", "bandcurl": "Band curl", "pushdown": "Triceps pushdown", "ropepd": "Rope pushdown", "skull": "Skull crusher", "overheadext": "Overhead triceps extension", "kickback": "Triceps kickback", "benchdips": "Bench dips", "tridips": "Triceps dips", "jm": "JM press", "diamond": "Diamond push-ups", "tate": "Tate press", "triext": "Machine triceps extension", "squat": "Squats", "frontsquat": "Front squat", "goblet": "Goblet squat", "boxsquat": "Box squat", "hack": "Hack squat", "legpress": "Leg press", "legext": "Leg extension", "legcurl": "Lying leg curl", "seatedcurl": "Seated leg curl", "lunge": "Lunges", "walklunge": "Walking lunges", "bulgarian": "Bulgarian split squat", "stepup": "Step-ups", "rdl": "Romanian deadlift", "stiff": "Stiff-leg deadlift", "sissy": "Sissy squat", "pistol": "Pistol squat", "bwsquat": "Bodyweight squats", "nordic": "Nordic curl", "adductor": "Hip adduction", "beltsquat": "Belt squat", "pendulum": "Pendulum squat", "zercher": "Zercher squat", "reverselunge": "Reverse lunges", "wallsit": "Wall sit", "hipthrust": "Hip thrust", "glutebridge": "Glute bridge", "abductor": "Hip abduction", "kickbackleg": "Cable kickback", "pullthrough": "Pull-through", "sidelunge": "Side lunges", "frog": "Frog pump", "singlerdl": "Single-leg Romanian deadlift", "reversehyper": "Reverse hyperextension", "calfstand": "Standing calf raise", "calfseat": "Seated calf raise", "calfpress": "Leg press calf raise", "donkey": "Donkey calf raise", "tibia": "Tibialis raise", "crunch": "Crunches", "cablecrunch": "Cable crunch", "machinecrunch": "Machine crunch", "situp": "Sit-ups", "legraise": "Hanging leg raise", "lyingleg": "Lying leg raise", "kneeraise": "Captain's chair knee raise", "russian": "Russian twists", "plank": "Plank", "sideplank": "Side plank", "abwheel": "Ab wheel", "woodchop": "Woodchopper", "pallof": "Pallof press", "vup": "V-up", "dragon": "Dragon flag", "hollow": "Hollow hold", "wristcurl": "Wrist curls", "revwrist": "Reverse wrist curls", "farmer": "Farmer's walk", "hang": "Dead hang", "platepinch": "Plate pinch", "clean": "Power clean", "snatch": "Snatch", "thruster": "Thruster", "burpee": "Burpees", "boxjump": "Box jumps", "wallball": "Wall balls", "tgu": "Turkish get-up", "sled": "Sled push", "treadmill": "Treadmill", "bike": "Exercise bike", "elliptical": "Elliptical", "rowing": "Rowing machine", "stairs": "Stair climber", "skierg": "Ski erg", "airbike": "Air bike", "run": "Running", "walk": "Incline walk", "rope": "Jump rope", "battle": "Battle ropes"};

// Как то же движение называют Strong и Hevy.
const ALIASES: Record<string, string> = {
  'bench press': 'bench', 'incline bench press': 'incline', 'decline bench press': 'decline', 'chest fly': 'fly', 'fly': 'fly',
  'chest press': 'chestpress', 'butterfly': 'pecdeck', 'pec deck': 'pecdeck', 'push up': 'pushups', 'chest dip': 'dips', 'triceps dip': 'tridips',
  'lat pulldown': 'pulldown', 'pull up': 'pullup', 'chin up': 'chinup', 'bent over row': 'row', 'seated row': 'seatedrow', 'seated cable row': 'seatedrow',
  'cable row': 'seatedrow', 'single arm row': 'onearm', 'one arm row': 'onearm', 'dumbbell row': 'onearm', 't bar row': 'tbar', 'shrug': 'shrug',
  'back extension': 'hyper', 'hyperextension': 'hyper', 'good morning': 'goodmorning', 'kettlebell swing': 'kbswing', 'romanian deadlift': 'rdl',
  'stiff leg deadlift': 'stiff', 'sumo deadlift': 'sumo', 'deadlift': 'deadlift', 'overhead press': 'ohp', 'shoulder press': 'seatedpress',
  'seated overhead press': 'seatedpress', 'military press': 'ohp', 'arnold press': 'arnold', 'lateral raise': 'lateral', 'front raise': 'front',
  'rear delt fly': 'reardelt', 'reverse fly': 'reardelt', 'face pull': 'facepull', 'upright row': 'upright', 'bicep curl': 'curl', 'biceps curl': 'curl',
  'hammer curl': 'hammer', 'preacher curl': 'preacher', 'concentration curl': 'concentration', 'triceps pushdown': 'pushdown',
  'tricep pushdown': 'pushdown', 'triceps rope pushdown': 'ropepd', 'skullcrusher': 'skull', 'skull crusher': 'skull',
  'triceps extension': 'overheadext', 'overhead triceps extension': 'overheadext', 'squat': 'squat', 'back squat': 'squat', 'front squat': 'frontsquat',
  'goblet squat': 'goblet', 'hack squat': 'hack', 'leg press': 'legpress', 'leg extension': 'legext', 'lying leg curl': 'legcurl', 'leg curl': 'legcurl',
  'seated leg curl': 'seatedcurl', 'lunge': 'lunge', 'walking lunge': 'walklunge', 'bulgarian split squat': 'bulgarian', 'step up': 'stepup',
  'hip thrust': 'hipthrust', 'glute bridge': 'glutebridge', 'hip adduction': 'adductor', 'hip abduction': 'abductor', 'standing calf raise': 'calfstand',
  'calf raise': 'calfstand', 'seated calf raise': 'calfseat', 'crunch': 'crunch', 'cable crunch': 'cablecrunch', 'sit up': 'situp',
  'hanging leg raise': 'legraise', 'leg raise': 'lyingleg', 'russian twist': 'russian', 'plank': 'plank', 'side plank': 'sideplank',
  'ab wheel': 'abwheel', 'ab wheel rollout': 'abwheel', 'wrist curl': 'wristcurl', 'farmers walk': 'farmer', 'dead hang': 'hang',
  'power clean': 'clean', 'clean': 'clean', 'snatch': 'snatch', 'thruster': 'thruster', 'burpee': 'burpees', 'box jump': 'boxjump',
  'treadmill': 'treadmill', 'running': 'run', 'cycling': 'bike', 'stationary bike': 'bike', 'elliptical trainer': 'elliptical',
  'rowing machine': 'rowing', 'stair climber': 'stairs', 'jump rope': 'rope',
};

const EQUIP_WORDS: [RegExp, Equip][] = [
  [/smith/, 'smith'], [/ez/, 'ez'], [/trap|hex/, 'trap'], [/barbell/, 'bb'], [/dumbbell/, 'db'], [/cable/, 'cable'], [/machine|lever/, 'machine'],
  [/kettlebell/, 'kb'], [/band/, 'band'], [/plate/, 'plate'], [/bodyweight|weighted|assisted/, 'bw'],
];

const norm = (s: string) =>
  s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)).join(' ');

const BY_NAME = new Map<string, string>();
for (const [k, n] of Object.entries(EN_NAMES)) BY_NAME.set(norm(n), k);
for (const [n, k] of Object.entries(ALIASES)) BY_NAME.set(norm(n), k);
const KEYS = new Map<string, Equip[]>();
for (const e of GYM_EXERCISES) {
  const [k] = e.id.split('.');
  KEYS.set(k, [...(KEYS.get(k) ?? []), e.equip]);
}

/** Упражнение каталога по английскому названию из Strong или Hevy; не нашлось — своё упражнение с тем же названием. */
export function matchExercise(name: string): string {
  const inBrackets = (name.match(/\((.*?)\)/)?.[1] ?? '').toLowerCase();
  const n = norm(name);
  // «Incline Bench Press (Dumbbell)» → движение без снаряда в названии: «dumbbell fly» тоже ищем без слова.
  const bare = n.replace(/\b(barbell|dumbbell|cable|machine|kettlebell|smith|lever|ez bar|band)\b/g, '').replace(/\s+/g, ' ').trim();
  const key = BY_NAME.get(n) ?? BY_NAME.get(bare);
  if (!key) return customId(name);
  const equips = KEYS.get(key) ?? [];
  const words = `${inBrackets} ${name.toLowerCase()}`;
  const want = EQUIP_WORDS.find(([re]) => re.test(words))?.[1];
  const equip = want && equips.includes(want) ? want : equips[0];
  return `${key}.${equip}`;
}

/** CSV с кавычками; разделитель — запятая или точка с запятой (смотрим по заголовку). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const head = src.slice(0, src.indexOf('\n') >>> 0);
  const sep = (head.match(/;/g)?.length ?? 0) > (head.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** «2024-10-26 18:03:00», «26 Oct 2024, 18:03» или ISO → мс. */
export function parseDate(s: string): number {
  const v = s.trim();
  const m = v.match(/^(\d{1,2}) ([A-Za-z]{3})\w* (\d{4}),? (\d{1,2}):(\d{2})/);
  if (m) return new Date(+m[3], MONTHS.indexOf(m[2].toLowerCase()), +m[1], +m[4], +m[5]).getTime();
  const d = v.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (d) return new Date(+d[1], +d[2] - 1, +d[3], +d[4], +d[5], +(d[6] ?? 0)).getTime();
  const tm = Date.parse(v);
  return Number.isFinite(tm) ? tm : NaN;
}

/** «1h 5m», «45m», «3900» (секунды) → минуты. */
const durMin = (s: string | undefined, secs: boolean): number => {
  if (!s) return 0;
  const h = s.match(/(\d+)\s*h/)?.[1];
  const m = s.match(/(\d+)\s*m(?!s)/)?.[1];
  if (h || m) return +(h ?? 0) * 60 + +(m ?? 0);
  const n = parseFloat(s);
  return Number.isFinite(n) ? (secs ? n / 60 : n) : 0;
};
const f = (s: string | undefined) => {
  const n = parseFloat((s ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export type ImportSource = 'strong' | 'hevy';
export interface Imported {
  source: ImportSource;
  sessions: GymSession[];
  // Названия, которых нет в каталоге: стали своими упражнениями.
  unknown: string[];
}

/** Разобрать выгрузку. null — это не Strong и не Hevy. */
export function parseWorkouts(text: string): Imported | null {
  const rows = parseCsv(text);
  if (rows.length < 2) return null;
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const hevy = col('exercise_title') >= 0;
  const strong = col('exercise name') >= 0;
  if (!hevy && !strong) return null;
  const c = hevy
    ? { start: col('start_time'), end: col('end_time'), title: col('title'), ex: col('exercise_title'), kg: col('weight_kg'), lbs: col('weight_lbs'), reps: col('reps'), km: col('distance_km'), miles: col('distance_miles'), sec: col('duration_seconds'), type: col('set_type'), dur: -1 }
    : { start: col('date'), end: -1, title: col('workout name'), ex: col('exercise name'), kg: col('weight (kg)', 'weight'), lbs: col('weight (lbs)'), reps: col('reps'), km: col('distance (km)', 'distance'), miles: col('distance (miles)'), sec: col('seconds'), type: col('set order'), dur: col('duration (sec)', 'duration') };
  const durSecs = head[c.dur] === 'duration (sec)';
  const byWorkout = new Map<string, { start: number; end: number; name: string; items: Map<string, [number, number][]> }>();
  const unknown = new Set<string>();
  for (const r of rows.slice(1)) {
    const exName = (r[c.ex] ?? '').trim();
    const start = parseDate(r[c.start] ?? '');
    if (!exName || !Number.isFinite(start)) continue;
    const type = (r[c.type] ?? '').toLowerCase();
    // Разминочные подходы и таймеры отдыха Strong в дневник не идут.
    if (type === 'warmup' || type.includes('rest')) continue;
    const key = `${start}|${r[c.title] ?? ''}`;
    let w = byWorkout.get(key);
    if (!w) {
      const end = c.end >= 0 ? parseDate(r[c.end] ?? '') : start + durMin(r[c.dur], durSecs) * 60000;
      w = { start, end: Number.isFinite(end) && end > start ? end : start + 3600_000, name: (r[c.title] ?? '').trim() || t('Тренировка'), items: new Map() };
      byWorkout.set(key, w);
    }
    const id = matchExercise(exName);
    if (id.startsWith('my.')) unknown.add(exName);
    const kind = gymExercise(id).kind;
    const kg = c.kg >= 0 ? f(r[c.kg]) : f(r[c.lbs]) * 0.4536;
    const km = c.km >= 0 ? f(r[c.km]) : f(r[c.miles]) * 1.609;
    const sec = f(r[c.sec]);
    const reps = f(r[c.reps]);
    const set: [number, number] =
      kind === 'c' ? [Math.round(km * 100) / 100, Math.round(sec / 60) || 1] : kind === 't' ? [0, Math.round(sec) || reps] : [Math.round(kg * 10) / 10, reps];
    if (!set[0] && !set[1]) continue;
    w.items.set(id, [...(w.items.get(id) ?? []), set]);
  }
  const sessions: GymSession[] = [...byWorkout.values()]
    .filter((w) => w.items.size)
    .map((w) => {
      const items = [...w.items.entries()].map(([ex, sets]) => ({ ex, sets }));
      const vol = items.reduce((a, it) => (gymExercise(it.ex).kind === 'w' || gymExercise(it.ex).kind === 'bw' ? a + it.sets.reduce((b, [x, y]) => b + x * y, 0) : a), 0);
      return { id: `imp${w.start.toString(36)}`, name: w.name.slice(0, 40), start: w.start, end: Math.min(w.end, w.start + 4 * 3600_000), vol: Math.round(vol), prs: [], items };
    })
    .sort((a, b) => b.start - a.start);
  return { source: hevy ? 'hevy' : 'strong', sessions, unknown: [...unknown] };
}

const toSets = (ex: string, sets: [number, number][]): GymSet[] => {
  const kind = gymExercise(ex).kind;
  return sets.map(([a, b]) => (kind === 'c' ? { d: a, t: b } : kind === 't' ? { t: b } : { w: a, r: b }));
};

/** Добавить импортированное: тренировки в историю (без повторов), рекорды и веса «прошлого раза». */
export function applyImport(p: Progress, sessions: GymSession[]): { progress: Progress; added: number } {
  const g: GymState = gymOf(p);
  const have = new Set(g.history.map((s) => s.start));
  const fresh = sessions.filter((s) => !have.has(s.start));
  const best: Record<string, GymBest> = { ...g.best };
  const last = { ...g.last };
  const newest = g.history[0]?.start ?? 0;
  // От старых к новым: «прошлый раз» — самая свежая тренировка, если она новее уже записанных.
  for (const s of [...fresh].sort((a, b) => a.start - b.start))
    for (const it of s.items) {
      const sets = toSets(it.ex, it.sets);
      const b = bestOf(gymExercise(it.ex).kind, sets);
      const m: GymBest = { ...best[it.ex] };
      for (const k of ['w', 'e', 'r', 't'] as const) if (b[k] !== undefined) m[k] = Math.max(m[k] ?? 0, b[k]!);
      best[it.ex] = m;
      if (s.start > newest || !last[it.ex]) last[it.ex] = sets;
    }
  const history = [...g.history, ...fresh].sort((a, b) => b.start - a.start).slice(0, HISTORY_MAX);
  return { progress: { ...p, gym: { ...g, history, best, last } }, added: fresh.length };
}
