// Что говорит Мастер Гром: чистые функции без браузера, их проверяют тесты.

export interface VoiceLike {
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
}

// Голоса, которые на телефонах звучат заметно лучше остальных.
const GOOD = [/milena/i, /yuri/i, /katya/i, /google/i, /enhanced|premium|neural|natural/i];
const BAD = [/compact|eloquence|espeak/i];

/** Лучший русский голос из списка или null, если русского нет. */
export function pickVoice<V extends VoiceLike>(voices: readonly V[]): V | null {
  const ru = voices.filter((v) => /^ru([-_]|$)/i.test(v.lang));
  if (!ru.length) return null;
  const score = (v: V) =>
    (/^ru[-_]ru$/i.test(v.lang) ? 4 : 0) +
    GOOD.reduce((s, re, i) => s + (re.test(v.name) ? 6 - i : 0), 0) -
    (BAD.some((re) => re.test(v.name)) ? 8 : 0) +
    // Локальный голос работает без сети и отвечает быстрее.
    (v.localService ? 2 : 0) +
    (v.default ? 1 : 0);
  return ru.reduce((best, v) => (score(v) > score(best) ? v : best));
}

export interface Line {
  text: string;
  // Важное прерывает текущую фразу; обычное (номер повтора) пропускается, если Гром ещё говорит.
  important: boolean;
}

const CHEERS = ['Отлично, так держать!', 'Мощно!', 'Вот это сила!', 'Не сбавляй!', 'Красота, продолжай!'];

/** Что сказать на повтор номер reps; target — цель подхода, если она есть. */
export function repLine(reps: number, target?: number): Line {
  if (target && target >= 4) {
    const left = target - reps;
    if (left === 0) return { text: 'Есть! Цель взята!', important: true };
    if (left === 3) return { text: 'Последние три!', important: true };
    if (left === 5 && target >= 12) return { text: 'Ещё пять!', important: true };
    if (target >= 8 && reps === Math.floor(target / 2)) return { text: 'Половина!', important: true };
  }
  if (reps > 0 && reps % 10 === 0) return { text: `${reps}! ${CHEERS[(reps / 10 - 1) % CHEERS.length]}`, important: true };
  return { text: String(reps), important: false };
}

/** Предупреждение по времени, когда секунды до конца пересекли отметку. total — длина подхода. */
export function timeLine(prevLeft: number, left: number, total: number): Line | null {
  const crossed = (mark: number) => prevLeft > mark && left <= mark && left > 0;
  if (total > 45 && crossed(30)) return { text: 'Тридцать секунд!', important: true };
  if (total > 15 && crossed(10)) return { text: 'Десять секунд!', important: true };
  return null;
}

// Подсказку по технике повторяем не чаще раза в столько миллисекунд.
export const HINT_GAP_MS = 9000;

/** Сказать ли подсказку позы: только новую, не слишком часто и не про «встань в кадр» каждые секунды. */
export function hintLine(hint: string | null, prevHint: string | null, msSinceLastHint: number): Line | null {
  if (!hint || hint === prevHint || msSinceLastHint < HINT_GAP_MS) return null;
  return { text: hint.replace(/^Повтор не засчитан: /, 'Не засчитал: '), important: false };
}
