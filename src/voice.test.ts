import { describe, expect, it } from 'vitest';
import { HINT_GAP_MS, hintLine, pickVoice, repLine, timeLine } from './voiceLines';

describe('pickVoice', () => {
  it('без русского голоса молчит', () => {
    expect(pickVoice([{ name: 'Samantha', lang: 'en-US' }])).toBeNull();
  });

  it('берёт лучший русский голос', () => {
    const voices = [
      { name: 'Samantha', lang: 'en-US', default: true },
      { name: 'eSpeak Russian', lang: 'ru' },
      { name: 'Milena (Enhanced)', lang: 'ru-RU', localService: true },
      { name: 'Google русский', lang: 'ru-RU' },
    ];
    expect(pickVoice(voices)?.name).toBe('Milena (Enhanced)');
  });

  it('принимает ru_RU с подчёркиванием (Android)', () => {
    expect(pickVoice([{ name: 'x', lang: 'ru_RU' }])?.name).toBe('x');
  });
});

describe('repLine', () => {
  it('считает номер повтора, номер можно пропустить', () => {
    expect(repLine(7, 30)).toEqual({ text: '7', important: false });
  });

  it('вехи подхода важнее номера', () => {
    expect(repLine(15, 20).text).toBe('Ещё пять!');
    expect(repLine(10, 20).text).toBe('Половина!');
    expect(repLine(17, 20).text).toBe('Последние три!');
    expect(repLine(20, 20).text).toBe('Есть! Цель взята!');
    expect(repLine(20, 20).important).toBe(true);
  });

  it('без цели подбадривает каждые десять', () => {
    expect(repLine(10)).toEqual({ text: '10! Отлично, так держать!', important: true });
    expect(repLine(11).important).toBe(false);
  });

  it('маленькой цели не говорит «ещё пять»', () => {
    expect(repLine(3, 8).text).toBe('3');
  });
});

describe('timeLine', () => {
  it('предупреждает один раз при пересечении десяти секунд', () => {
    expect(timeLine(11, 10, 60)?.text).toBe('Десять секунд!');
    expect(timeLine(10, 9, 60)).toBeNull();
    expect(timeLine(31, 30, 60)?.text).toBe('Тридцать секунд!');
    expect(timeLine(31, 30, 40)).toBeNull();
  });
});

describe('hintLine', () => {
  it('говорит только новую подсказку и не чаще паузы', () => {
    expect(hintLine('Встань прямо', null, HINT_GAP_MS)?.text).toBe('Встань прямо');
    expect(hintLine('Встань прямо', 'Встань прямо', HINT_GAP_MS)).toBeNull();
    expect(hintLine('Встань прямо', null, 1000)).toBeNull();
    expect(hintLine(null, 'Встань прямо', HINT_GAP_MS)).toBeNull();
  });
});
