// Фильтр мата для чата и названий. Общий для приложения (подсказка сразу) и сервера (он решает).
//
// Как работает: текст режем на слова, каждое слово приводим к простому виду
// (строчные, ё→е, латиница-двойник → кириллица, цифры-буквы, без точек и звёздочек внутри, без повторов «хууууй»),
// и ищем корни мата. Корни привязаны к началу слова или к приставкам, иначе ловятся обычные слова:
// «оскорблять», «рубля», «тебя», «команда», «страховка», «сукно» — список в shared/profanity.test.ts.
// Подряд идущие одиночные буквы («х у й», «х.у.й» через пробелы) склеиваем в одно слово.

// Латинские буквы, похожие на русские, и цифры вместо букв: «xyй», «cyka», «п1зда», «3алупа».
const TO_CYR: Record<string, string> = {
  a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у', u: 'и', i: 'и', n: 'п', r: 'г',
  '0': 'о', '1': 'и', '3': 'з', '4': 'ч', '6': 'б', '8': 'в', '@': 'а', $: 'с',
};
// В русском слове латинская буква — скорее транслит: «пиzдец», «бlядь».
const MIX: Record<string, string> = { ...TO_CYR, z: 'з', s: 'с', d: 'д', l: 'л', f: 'ф', g: 'г', j: 'й', v: 'в', w: 'ш', q: 'к' };
// Латиница без подмены на кириллицу: английский мат и транслит («blyat», «pizda»).
const TO_LAT: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i' };

const CYR = /[а-яё]/;
const STAR_VOWELS = ['а', 'е', 'и', 'о', 'у', 'я', 'ю', 'ы', 'з'];
const LETTER = /[a-zа-яё0-9@$]/;

// Приставки перед «еб»: заебал, наебнулся, разъебай, долбоёб…
const EB_PREFIX = '(?:за|на|по|у|вы|от|об|до|про|раз|рас|под|пере|из|недо|съ|въ|разъ|подъ|отъ|объ|изъ|долбо|долба|мозго|дура)?';
const RU: RegExp[] = [
  // хуй, хуе-, хуя, нахуй, похую. «Страхую», «страхуй» — обычные слова.
  /(?<!стра|пси)ху[йеяюи]/,
  /^(?:на|по|ни)?хули$/,
  /п[ие]зд/,
  // еб-: только в начале слова или после приставки, чтобы не задеть «тебя», «небо», «употреблять».
  new RegExp(`^${EB_PREFIX}еб(?:а|у|л|ну|н|т|и|ош|ыв|ок|ищ|ан|ен|ет|ал|ись)`),
  /^еб/,
  /^долбо[её]б/,
  // бля, блядь, блять. «Рубля», «корабля» — бля в середине; «бляха», «бляшка» — пряжка.
  /^(?:вы|за|по|ни)?бля(?![хш])/,
  /^(?:сука|суки|суке|суку|сукой|сукам|суками|суках|сукин|сукина|сукины|сукиных|сукиным|сучара|сучары|сучонок|сученок)$/,
  // мудак, мудила, мудозвон. «Мудрый», «мудрец» — без «р».
  /^муд(?:ак|ач|ил|озвон|ень|ня|ищ|охал)/,
  /(?<!ла)п[ие]д[оа]р/,
  /^пидр/,
  /^педик/,
  /залуп/,
  /г[ао]ндон/,
  /шлюх|шлюш/,
  /^шалав/,
  /^(?:манда|манды|манде|манду|мандой|мандец)$|мандавош/,
  /дроч/,
];
// Английский пишем без схлопывания двойных букв: «nigger» и «Niger» — разные слова.
const EN: RegExp[] = [
  /fu+c+k/,
  /^fck/,
  /^fu+k(?:ing|er|in|ed|s)?$/,
  /^motherf/,
  /^shit(?!ake)/,
  /bitch/,
  /^cunt/,
  /^ass+hole/,
  /^nigg(?:er|a|az)/,
  /^fag+ots?$|^fags?$/,
  /^whore/,
  /^slut/,
  // Транслит русского мата.
  /^(?:na|po)?(?:hu[iyj]|xu[iyj])/,
  /pizd/,
  /^bl[iy]a(?!h)/,
  /^su+ka?$|^suk[iu]$/,
  /^(?:eba[lnt]|yeba|ieba)/,
  /^pid[oa]r/,
  /zalup/,
];

/** Слово к простому виду для поиска корней: кириллица или латиница. */
function simplify(word: string, map: Record<string, string>, collapse: RegExp): string {
  let s = '';
  for (const ch of word.toLowerCase().replace(/ё/g, 'е')) {
    const c = map[ch] ?? ch;
    if (/[a-zа-я]/.test(c)) s += c;
  }
  // «хууууй», «ссука», «бляяя»: повторы букв схлопываем.
  return s.replace(collapse, '$1');
}
const cyrOf = (w: string) => simplify(w, CYR.test(w) ? MIX : TO_CYR, /(.)\1+/g);
const latOf = (w: string) => simplify(w, TO_LAT, /(.)\1{2,}/g);
// Латинское слово проверяем русскими корнями, только если все его буквы — двойники русских («cyka»).
const looksCyr = (w: string) => CYR.test(w) || [...w].every((ch) => !/[a-z]/.test(ch) || ch in TO_CYR);

/** Одно слово (без пробелов) — мат? */
export function badWord(word: string): boolean {
  const w = word.toLowerCase();
  if (!LETTER.test(w)) return false;
  if (looksCyr(w)) {
    // Звёздочка вместо буквы: «бл*дь», «х*й» — пробуем гласные на её месте.
    const stars = (w.match(/\*/g) ?? []).length;
    const variants = stars && stars <= 2 && /[^*]/.test(w) ? STAR_VOWELS.map((v) => w.replace(/\*/g, v)) : [w];
    for (const v of variants) {
      const cyr = cyrOf(v);
      if (cyr && RU.some((r) => r.test(cyr))) return true;
    }
  }
  if (CYR.test(w)) return false;
  const lat = latOf(w);
  return !!lat && EN.some((r) => r.test(lat));
}

interface Piece {
  text: string;
  space: boolean;
}

/** Текст на слова и пробелы между ними. Одиночные буквы подряд («х у й») становятся одним словом. */
function pieces(text: string): Piece[] {
  const raw: Piece[] = (text.match(/\s+|\S+/g) ?? []).map((t) => ({ text: t, space: /^\s/.test(t) }));
  const out: Piece[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    const single = (x?: Piece) => !!x && !x.space && x.text.replace(/[^a-zа-яё0-9@$]/gi, '').length === 1;
    if (single(p) && single(raw[i + 2]) && raw[i + 1]?.space) {
      let j = i;
      let joined = p.text;
      while (raw[j + 1]?.space && single(raw[j + 2])) {
        joined += raw[j + 1].text + raw[j + 2].text;
        j += 2;
      }
      out.push({ text: joined, space: false });
      i = j;
    } else out.push(p);
  }
  return out;
}

const glue = (s: string) => s.replace(/\s+/g, '');

/** Есть ли в тексте мат. */
export function hasProfanity(text: string): boolean {
  return pieces(text).some((p) => !p.space && badWord(glue(p.text)));
}

/** Чат: слова с матом заменяем на «***», остальное оставляем. */
export function censor(text: string): string {
  return pieces(text)
    .map((p) => (!p.space && badWord(glue(p.text)) ? '***' : p.text))
    .join('');
}

// Для названий проверяем ещё и склеенный текст: «Хуй Ло», «П И З Д А».
// Только корни, которые не прячутся внутри обычных слов.
const STRONG_RU = /(?<!стра|пси)хуй|пизд|залуп|бляд|п[ие]дор|пидар|г[ао]ндон|шлюх|мудак/;
const STRONG_EN = /fuck|pizd|blyat|cunt/;

/** Название клана, тег, город, кличка питомца, имя: можно ли такое. */
export function badName(name: string): boolean {
  if (hasProfanity(name)) return true;
  const w = name.toLowerCase();
  return (looksCyr(w) && STRONG_RU.test(cyrOf(w))) || STRONG_EN.test(latOf(w));
}

export const BAD_NAME = 'Выбери другое название';
