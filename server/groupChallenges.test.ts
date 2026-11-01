import { describe, expect, it } from 'vitest';
import { challengeScore, GroupChallenges, MEMBERS_MAX, parseGroupCommand, tableText } from './groupChallenges';
import { startReply } from './bot';
import { tagLinks } from './channel';
import { contentRows, promoGate } from './statsPage';

const NOW = Date.parse('2026-11-02T10:00:00Z');

describe('вызов в групповом чате', () => {
  it('понимает команды', () => {
    expect(parseGroupCommand('/challenge')).toEqual({ kind: 'create', exercise: 'pushup' });
    expect(parseGroupCommand('/challenge@ArenaNikitenokBot squat')).toEqual({ kind: 'create', exercise: 'squat' });
    expect(parseGroupCommand('/start@ArenaNikitenokBot gc-situp')).toEqual({ kind: 'create', exercise: 'situp' });
    expect(parseGroupCommand('/вызов приседания')).toEqual({ kind: 'create', exercise: 'squat' });
    expect(parseGroupCommand('/top')).toEqual({ kind: 'top' });
    expect(parseGroupCommand('/start')).toBeNull();
    expect(parseGroupCommand('привет')).toBeNull();
  });

  it('считает повторы упражнения за дни вызова, без «посчитал сам» и сверх предела', () => {
    const p = { log: { '2026-11-01': { r: { pushup: 50 } }, '2026-11-02': { r: { pushup: 40, squat: 99 } }, '2026-11-03': { r: { pushup: 1e9 } } }, manual: { '2026-11-02': 15 } };
    expect(challengeScore(p, 'pushup', '2026-11-02', '2026-11-08')).toBe(25 + 3000);
    expect(challengeScore(null, 'pushup', '2026-11-02', '2026-11-08')).toBe(0);
  });

  it('один вызов на чат, вступление один раз, после конца — нельзя', () => {
    const g = new GroupChallenges(null);
    const { c, created } = g.create(-100, 'Семья', 'pushup', 'tg:1', 'Аня', 'ru', NOW);
    expect(created).toBe(true);
    expect(c.from).toBe('2026-11-02');
    expect(c.to).toBe('2026-11-08');
    expect(g.create(-100, 'Семья', 'squat', 'tg:2', 'Боря', 'ru', NOW).created).toBe(false);
    expect(g.join(c.id, 'tg:2', 'Боря', NOW)?.members['tg:2'].name).toBe('Боря');
    expect(Object.keys(c.members)).toHaveLength(2);
    expect(g.join(c.id, 'tg:3', 'Вика', c.endsAt + 1)).toBeNull();
    expect(g.ofPlayer('tg:2')).toHaveLength(1);
    g.forget('tg:2');
    expect(g.ofPlayer('tg:2')).toHaveLength(0);
    for (let i = 0; i < MEMBERS_MAX; i++) g.join(c.id, `tg:x${i}`, 'x', NOW);
    expect(Object.keys(c.members)).toHaveLength(MEMBERS_MAX);
  });

  it('таблица и итоги', () => {
    const g = new GroupChallenges(null);
    const { c } = g.create(-1, 'Офис', 'squat', 'tg:1', 'Аня', 'ru', NOW);
    const rows = [
      { id: 'tg:1', name: 'Аня', reps: 120 },
      { id: 'tg:2', name: 'Боря', reps: 300 },
    ];
    const live = tableText(c, rows, NOW);
    expect(live).toContain('🥇 Боря — 300');
    expect(live).toContain('осталось 7 дн.');
    g.update(c, { done: true });
    expect(tableText(c, rows, NOW)).toContain('Больше всех (приседания) — Боря: 300');
    expect(tableText(c, rows, NOW)).toContain('420');
  });

  it('кнопка «Участвовать» ведёт через бота в игру с кодом', () => {
    const r = startReply('/start gc-0123456789', 'https://arena.nikitenok.ru', () => undefined);
    expect(r?.url).toBe('https://arena.nikitenok.ru/?gc=0123456789');
  });
});

describe('контент по цифрам и продвижение', () => {
  it('своя метка у поста', () => {
    expect(tagLinks('<a href="https://t.me/ArenaNikitenokBot?start=src-channel">бот</a>', 'channel', 'ch-tips')).toContain('start=src-ch-tips"');
  });
  it('оставить — два формата с наибольшим числом вернувшихся', () => {
    const src = (source: string, users: number, d1: number) => ({ source, users, camera: 0, won: 0, played: 0, returned: 0, d1Of: users, d1 });
    const rows = contentRows([src('ch-tips', 40, 12), src('ch-app', 100, 5), src('th-build', 20, 8), src('friend', 50, 30)]);
    expect(rows.map((r) => r.source)).toEqual(['ch-tips', 'th-build', 'ch-app']);
    expect(rows.filter((r) => r.keep).map((r) => r.source)).toEqual(['ch-tips', 'th-build']);
  });
  it('продвижение — только после D1 25% на достаточной выборке', () => {
    expect(promoGate(5, 10).ok).toBe(false);
    expect(promoGate(6, 40).ok).toBe(false);
    expect(promoGate(12, 40).ok).toBe(true);
  });
});
