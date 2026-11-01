import { describe, expect, it } from 'vitest';
import { challengeScore, GroupChallenges, MEMBERS_MAX, parseGroupCommand, tableText, tgOutcome } from './groupChallenges';
import { contentLink } from './reels';
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

  it('не отвечает на чужие и похожие команды, незнакомое упражнение — не отжимания', () => {
    expect(parseGroupCommand('/topics', 'ArenaNikitenokBot')).toBeNull();
    expect(parseGroupCommand('/top10@OtherBot', 'ArenaNikitenokBot')).toBeNull();
    expect(parseGroupCommand('/top@OtherBot', 'ArenaNikitenokBot')).toBeNull();
    expect(parseGroupCommand('/challenge@OtherBot', 'ArenaNikitenokBot')).toBeNull();
    expect(parseGroupCommand('/challengeaccepted', 'ArenaNikitenokBot')).toBeNull();
    expect(parseGroupCommand('/вызовы', 'ArenaNikitenokBot')).toBeNull();
    expect(parseGroupCommand('/top@arenanikitenokbot', 'ArenaNikitenokBot')).toEqual({ kind: 'top' });
    expect(parseGroupCommand('/challenge бег', 'ArenaNikitenokBot')).toEqual({ kind: 'unknown' });
    expect(parseGroupCommand('/challenge отжимания', 'ArenaNikitenokBot')).toEqual({ kind: 'create', exercise: 'pushup' });
  });

  it('понимает ответы Telegram: переезд в супергруппу, удалённая таблица, бота выгнали, лимит', () => {
    expect(tgOutcome({ ok: true })).toBe('ok');
    expect(tgOutcome({ ok: false, error_code: 400, description: 'Bad Request: message is not modified' })).toBe('ok');
    expect(tgOutcome({ ok: false, error_code: 400, description: 'Bad Request: group chat was upgraded to a supergroup chat', parameters: { migrate_to_chat_id: -100123 } })).toBe('migrated');
    expect(tgOutcome({ ok: false, error_code: 400, description: 'Bad Request: message to edit not found' })).toBe('missing');
    expect(tgOutcome({ ok: false, error_code: 403, description: 'Forbidden: bot was kicked from the group chat' })).toBe('gone');
    expect(tgOutcome({ ok: false, error_code: 400, description: 'Bad Request: chat not found' })).toBe('gone');
    expect(tgOutcome({ ok: false, error_code: 429, description: 'Too Many Requests' })).toBe('retry');
    expect(tgOutcome(null)).toBe('retry');
  });

  it('переезд в супергруппу переносит вызов', () => {
    const g = new GroupChallenges(null);
    const { c } = g.create(-5, 'Семья', 'pushup', 'tg:1', 'Аня', 'ru', NOW);
    g.migrate(-5, -1005);
    expect(g.ofChat(-1005)?.id).toBe(c.id);
    expect(g.create(-1005, 'Семья', 'pushup', 'tg:1', 'Аня', 'ru', NOW).created).toBe(false);
  });

  it('считает повторы упражнения за дни вызова, без «посчитал сам» и сверх предела', () => {
    const p = { log: { '2026-11-01': { r: { pushup: 50 } }, '2026-11-02': { r: { pushup: 40, squat: 99 } }, '2026-11-03': { r: { pushup: 1e9 } }, '2026-11-04': { r: { pushup: 500 } } }, days: { '2026-11-01': 50, '2026-11-02': 139, '2026-11-03': 1e9, '2026-11-04': 30 }, manual: { '2026-11-02': 15 } };
    // 04.11: в log завышено (500), а всего за день — 30: берём меньшее.
    expect(challengeScore(p, 'pushup', '2026-11-02', '2026-11-08')).toBe(25 + 3000 + 30);
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
    // Маленькая выборка (меньше 10 с известным D1) «оставить» не получает.
    expect(contentRows([src('reel-3', 4, 4)])[0].keep).toBe(false);
  });
  it('у каждого рилса и карусели своя ссылка с меткой', () => {
    expect(contentLink('reel', 7)).toBe('https://t.me/ArenaNikitenokBot?start=src-reel-7');
    expect(contentLink('carousel', 2)).toContain('src-car-2');
  });
  it('продвижение — только после D1 25% на достаточной выборке', () => {
    expect(promoGate(5, 10).ok).toBe(false);
    expect(promoGate(6, 40).ok).toBe(false);
    expect(promoGate(12, 40).ok).toBe(true);
  });
});
