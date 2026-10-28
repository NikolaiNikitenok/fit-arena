// «Голос Грома»: Мастер Гром вслух считает повторы и подбадривает. Web Speech API, русский голос.
// Нет поддержки речи или русского голоса — тихо молчим, игра от этого не меняется.
import { useEffect, useRef } from 'react';
import { getSettings } from './settings';
import { hintLine, holdLine, Line, pickVoice, repLine, timeLine } from './voiceLines';
import { t } from './i18n';

const synth = (): SpeechSynthesis | null => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null);

let voice: SpeechSynthesisVoice | null = null;
let voicesTried = false;
let current: SpeechSynthesisUtterance | null = null;

function loadVoice(): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  if (!voicesTried) {
    voicesTried = true;
    // Голоса в Chrome и Android приходят асинхронно.
    s.addEventListener?.('voiceschanged', () => (voice = pickVoice(s.getVoices())));
  }
  voice ??= pickVoice(s.getVoices());
  return voice;
}

/** Произнести фразу: никогда не больше одной в очереди, устаревшая обрывается важной. */
export function say(line: Line | string): void {
  const l = typeof line === 'string' ? { text: line, important: true } : line;
  const s = synth();
  if (!s || !getSettings().voice) return;
  const v = loadVoice();
  if (!v) return;
  const busy = current !== null || s.speaking || s.pending;
  if (busy && !l.important) return;
  if (busy) s.cancel();
  try {
    const u = new SpeechSynthesisUtterance(l.text);
    u.voice = v;
    u.lang = v.lang;
    u.rate = 1.1;
    u.pitch = 0.9;
    const done = () => current === u && (current = null);
    u.onend = done;
    u.onerror = done;
    current = u;
    s.speak(u);
    // Подстраховка: на части WebView onend не приходит, и Гром замолчал бы навсегда.
    setTimeout(done, 400 + l.text.length * 110);
  } catch {
    current = null;
  }
}

let unlocked = false;

/** Вызывать прямо из нажатия: iOS в Telegram даёт говорить только после фразы, начатой жестом. */
export function unlockVoice(): void {
  const s = synth();
  if (unlocked || !s || !getSettings().voice || !loadVoice()) return;
  try {
    // Беззвучная фраза: один раз за запуск, чтобы лишний раз не приглушать музыку игрока.
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    s.speak(u);
    unlocked = true;
  } catch {
    // Не вышло — попробуем на следующем нажатии.
  }
}

/** Разблокировка речи по первому нажатию на кнопку где угодно: рейд и дуэль стартуют не из своей кнопки. */
export function initVoice(): void {
  loadVoice();
  const onTap = (e: Event) => {
    if (!(e.target as Element | null)?.closest?.('button')) return;
    unlockVoice();
    if (unlocked) document.removeEventListener('click', onTap, true);
  };
  document.addEventListener('click', onTap, true);
}

/** Замолчать сразу (выход из боя). */
export function hush(): void {
  current = null;
  synth()?.cancel();
}

/**
 * Гром ведёт подход: считает повторы, говорит вехи, время и иногда подсказку по технике.
 * on — идёт счёт; leftS — секунд до конца; total — длина подхода; target — цель, если есть.
 * timed — планка: reps — удержанные секунды, Гром говорит время, а не номер повтора.
 */
export function useVoiceCoach(on: boolean, reps: number, leftS: number, hint: string | null, total: number, target?: number, timed = false): void {
  const prev = useRef({ on, reps, leftS, hint, hintAt: -Infinity });
  useEffect(() => {
    const p = prev.current;
    const now = performance.now();
    if (on && !p.on) say(t('Поехали!'));
    else if (on) {
      const t = timeLine(p.leftS, leftS, total);
      const held = timed && reps > p.reps ? holdLine(reps, target) : null;
      if (held) say(held);
      else if (reps > p.reps && !timed) say(repLine(reps, target));
      else if (t) say(t);
      const h = hintLine(hint, p.hint, now - p.hintAt);
      if (h) {
        say(h);
        p.hintAt = now;
      }
    }
    Object.assign(p, { on, reps, leftS, hint });
  }, [on, reps, leftS, hint, total, target, timed]);
  useEffect(() => hush, []);
}
