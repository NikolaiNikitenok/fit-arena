import { describe, expect, it } from 'vitest';
import { midiToFreq, missionTheme, SCALES, scaleNote, stepSeconds, STEPS_PER_BAR, Theme, THEMES, themeStep, worldTheme } from './music';

describe('ноты музыки', () => {
  it('MIDI в герцы: ля первой октавы 440, октава удваивает частоту', () => {
    expect(midiToFreq(69)).toBe(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
    expect(midiToFreq(60)).toBeCloseTo(261.63, 1);
  });

  it('ступени лада переходят в соседние октавы вверх и вниз', () => {
    const s = SCALES.majorPenta;
    expect(scaleNote(s, 60, 0)).toBe(60);
    expect(scaleNote(s, 60, 3)).toBe(67);
    expect(scaleNote(s, 60, 5)).toBe(72);
    expect(scaleNote(s, 60, -1)).toBe(57);
    expect(scaleNote(s, 60, -5)).toBe(48);
    expect(scaleNote(SCALES.minor, 57, 9)).toBe(57 + 12 + 3);
  });

  it('шестнадцатая при 120 ударах в минуту — 0.125 с', () => {
    expect(stepSeconds(120)).toBeCloseTo(0.125);
  });

  it('каждая тема даёт разумные ноты и повторяется по кругу аккордов', () => {
    for (const theme of Object.keys(THEMES) as Theme[]) {
      const loop = THEMES[theme].chords.length * STEPS_PER_BAR;
      let count = 0;
      for (let step = 0; step < loop * 2; step++) {
        const notes = themeStep(theme, step);
        count += notes.length;
        for (const n of notes) {
          expect(Number.isInteger(n.midi), `${theme} ${step}`).toBe(true);
          expect(n.midi).toBeGreaterThanOrEqual(24);
          expect(n.midi).toBeLessThanOrEqual(108);
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(1);
          expect(n.len).toBeGreaterThan(0);
        }
        expect(themeStep(theme, step + loop * 4)).toEqual(notes);
      }
      expect(count).toBeGreaterThan(loop / 2);
    }
  });

  it('темы миров и миссий', () => {
    expect([0, 1, 2, 3].map(worldTheme)).toEqual(['fantasy', 'space', 'zombie', 'castle']);
    expect(missionTheme(1, false)).toBe('space');
    expect(missionTheme(0, true)).toBe('castle');
    expect(missionTheme(3, false)).toBe('castle');
  });
});
