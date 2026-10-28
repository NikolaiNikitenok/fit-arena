import { describe, expect, it } from 'vitest';
import { anonId } from '../shared/anon';
import { ALERT_PER_HOUR, clientAnon, fingerprint, IpLimit, mskDay, normalizeMessage, Telemetry, topFrame } from './telemetry';
import { statsHtml } from './statsPage';

const KEY = Buffer.alloc(32, 7);
const DAY = 86_400_000;
// 10:00 по Москве.
const T0 = Date.UTC(2026, 9, 1, 7);
const anon = (n: number) => n.toString(16).padStart(32, 'a');
const make = () => {
  let now = T0;
  const t = new Telemetry(null, () => now, KEY);
  return { t, at: (ms: number) => (now = ms), ip: (i: number) => `10.0.0.${i}` };
};

describe('анонимный id', () => {
  it('телефон и сервер считают одинаково', async () => {
    expect(await anonId('tg:123456')).toBe(clientAnon('tg:123456'));
    expect(clientAnon('tg:123456')).toMatch(/^[0-9a-f]{32}$/);
    expect(clientAnon('tg:123456')).not.toContain('123456');
  });
});

describe('отпечаток ошибки', () => {
  const chrome = "TypeError: x is undefined\n    at drawHero (https://arena.example/assets/index-Bx81kQ2a.js:1:4521)\n    at loop (https://arena.example/assets/index-Bx81kQ2a.js:1:900)";
  it('верхний кадр без хеша сборки и номеров строк', () => {
    expect(topFrame(chrome)).toBe('drawHero (index.js)');
    expect(topFrame('drawHero@https://arena.example/assets/index-Zz99Yy88.js:1:77\nloop@…')).toBe('drawHero (index.js)');
    expect(topFrame('')).toBe('');
  });
  it('числа и адреса в сообщении не плодят группы', () => {
    expect(normalizeMessage('Cannot read 12 of https://a.b/c?d=1')).toBe('Cannot read N of <url>');
    const a = fingerprint('error', 'Index 5 out of range', chrome);
    expect(fingerprint('error', 'Index 7 out of range', chrome.replace('Bx81kQ2a', 'Qq00Ww11').replace('4521', '4600'))).toBe(a);
    expect(fingerprint('react', 'Index 5 out of range', chrome)).not.toBe(a);
    expect(fingerprint('error', 'Другое', chrome)).not.toBe(a);
  });
});

describe('ограничения', () => {
  it('не больше 30 пакетов в минуту с одного адреса', () => {
    const l = new IpLimit(30, 60_000);
    for (let i = 0; i < 30; i++) expect(l.take('1.1.1.1', 0)).toBe(true);
    expect(l.take('1.1.1.1', 1000)).toBe(false);
    expect(l.take('2.2.2.2', 1000)).toBe(true);
    expect(l.take('1.1.1.1', 60_000)).toBe(true);
  });
  it('мусор и чужие события отбрасываются', () => {
    const { t, ip } = make();
    expect(t.ingest(null, ip(1))).toBe(400);
    expect(t.ingest({ anon: 'tg:123' }, ip(1))).toBe(400);
    expect(t.ingest({ anon: anon(1), events: [{ n: 'hack' }, { n: 'app_open', p: '<script>' }, ...Array(80).fill({ n: 'duel_start' })] }, ip(1))).toBe(200);
    const d = t.stats(1).dau[0];
    expect(d.events.hack).toBeUndefined();
    expect(d.events.app_open).toBe(1);
    expect(Object.keys(d.events).some((k) => k.includes('script'))).toBe(false);
    // Не больше 50 событий из пакета.
    expect(d.events.duel_start).toBe(48);
    for (let i = 0; i < 40; i++) t.ingest({ anon: anon(1) }, ip(2));
    expect(t.ingest({ anon: anon(1) }, ip(2))).toBe(429);
  });
});

describe('счётчики', () => {
  it('DAU, новые, уровни и воронка без сырого журнала', () => {
    const { t, at, ip } = make();
    t.ingest({ anon: anon(1), events: [{ n: 'app_open' }, { n: 'onb_step', p: 1 }, { n: 'onb_done', p: 1 }, { n: 'camera_granted' }, { n: 'mission_start', p: 1 }, { n: 'mission_win', p: 1 }] }, ip(1));
    t.ingest({ anon: anon(2), events: [{ n: 'app_open' }, { n: 'mission_start', p: 1 }, { n: 'mission_lose', p: 1 }] }, ip(2));
    t.ingest({ anon: anon(1), events: [{ n: 'app_open' }] }, ip(1));
    let s = t.stats(30);
    const today = s.dau[s.dau.length - 1];
    expect(today).toMatchObject({ users: 2, newUsers: 2 });
    expect(today.events).toMatchObject({ app_open: 3, mission_start: 2, mission_win: 1, mission_lose: 1, 'onb_step:1': 1 });
    expect(s.levels).toEqual([{ id: 1, start: 2, win: 1, lose: 1 }]);
    expect(s.funnel.map((f) => f.users)).toEqual([2, 1, 1, 1, 2, 1, 0, 0]);

    // На следующий день вернулся только первый; через неделю — второй.
    at(T0 + DAY);
    t.ingest({ anon: anon(1), events: [{ n: 'app_open' }, { n: 'duel_start' }] }, ip(1));
    at(T0 + 7 * DAY);
    t.ingest({ anon: anon(2), events: [{ n: 'app_open' }] }, ip(2));
    s = t.stats(30);
    const cohort = s.retention.find((r) => r.cohort === 2)!;
    expect(cohort).toMatchObject({ cohort: 2, d1: 1, d7: 1 });
    expect(s.funnel.find((f) => f.label.includes('другой день'))!.users).toBe(2);
    expect(s.dau.filter((d) => d.users).length).toBe(3);
  });

  it('откуда пришли и до какого уровня дошли', () => {
    const { t, at, ip } = make();
    t.ingest({ anon: anon(1), src: 'VK', events: [{ n: 'app_open' }, { n: 'camera_granted' }, { n: 'mission_win', p: 1 }, { n: 'mission_win', p: 4 }, { n: 'mission_win', p: 'daily' }] }, ip(1));
    t.ingest({ anon: anon(2), src: 'vk', events: [{ n: 'app_open' }] }, ip(2));
    t.ingest({ anon: anon(3), src: 'friend', events: [{ n: 'app_open' }, { n: 'mission_win', p: 1 }] }, ip(3));
    t.ingest({ anon: anon(4), src: '<script>', events: [{ n: 'app_open' }] }, ip(4));
    // Источник запоминается по первому входу, позже не меняется.
    t.ingest({ anon: anon(2), src: 'friend', events: [{ n: 'mission_win', p: 2 }] }, ip(2));
    expect(t.stats(30).dau.at(-1)!.events).toMatchObject({ 'src:vk': 2, 'src:friend': 1, 'src:unknown': 1 });

    // Через неделю: первый и третий не заходили, второй вернулся на следующий день.
    at(T0 + DAY);
    t.ingest({ anon: anon(2), events: [{ n: 'app_open' }] }, ip(2));
    at(T0 + 7 * DAY);
    const s = t.stats(30);
    expect(s.sources.map((x) => [x.source, x.users, x.won, x.d1, x.d1Of])).toEqual([
      ['vk', 2, 1, 1, 2],
      ['friend', 1, 1, 0, 1],
      ['unknown', 1, 0, 0, 1],
    ]);
    const reach = Object.fromEntries(s.reach.map((r) => [r.label, [r.gone, r.playing]]));
    expect(reach).toMatchObject({ 'Ни одного уровня': [1, 0], '1 уровень': [1, 0], '2 уровня': [1, 0], '4–5': [1, 0] });
    expect(s.trackSince).toBe('2026-10-01');

    const html = statsHtml(s);
    expect(html).toContain('Метка «vk»');
    expect(html).toContain('Приглашение друга');
    expect(html).toContain('Больше всего новичков пришло через «Метка «vk»»: 2');
  });

  it('меток не больше 50: дальше всё в «прочие»', () => {
    const { t, ip } = make();
    for (let i = 0; i < 60; i++) t.ingest({ anon: anon(i), src: `ad${i}` }, ip(i));
    const s = t.stats(30);
    expect(s.sources.length).toBe(51);
    expect(s.sources[0]).toMatchObject({ source: 'other', users: 10 });
  });

  it('старые дни выбрасываются, файл не растёт', () => {
    const { t, at, ip } = make();
    for (let d = 0; d < 80; d++) {
      at(T0 + d * DAY);
      t.ingest({ anon: anon(d), events: [{ n: 'app_open' }] }, ip(d % 250));
    }
    const data = (t as unknown as { data: { days: { day: number }[] } }).data;
    expect(data.days.length).toBeLessThanOrEqual(45);
    expect(data.days[0].day).toBeGreaterThan(mskDay(T0 + 79 * DAY) - 45);
  });
});

describe('ошибки', () => {
  const err = (message: string, count = 1) => ({ kind: 'error', message, stack: 'at boom (https://x/assets/index-AAAAAAAA.js:1:2)', count });
  it('группы с числом, первым и последним появлением и примером', () => {
    const { t, at, ip } = make();
    t.ingest({ anon: anon(1), v: 'abc-2026', platform: 'android', tgv: '8.0', ua: 'UA', screen: '390x844@3', lowPower: true, errors: [err('Boom 1'), err('Boom 2', 3)] }, ip(1));
    at(T0 + 60_000);
    t.ingest({ anon: anon(2), v: 'def-2026', errors: [err('Boom 9')] }, ip(2));
    const [g] = t.stats().errors;
    expect(t.stats().errors).toHaveLength(1);
    expect(g).toMatchObject({ count: 5, firstSeen: T0, lastSeen: T0 + 60_000, frame: 'boom (index.js)', versions: ['abc-2026', 'def-2026'] });
    expect(g.sample.version).toBe('def-2026');
    expect(t.stats(1).dau[0].errors).toBe(5);
  });

  it('тревога один раз, когда новая ошибка набрала 5 за час', () => {
    const { t, at, ip } = make();
    t.ingest({ anon: anon(1), errors: [err('Rare', ALERT_PER_HOUR - 1)] }, ip(1));
    expect(t.takeAlerts()).toHaveLength(0);
    // Прошёл час: счёт часа начинается заново.
    at(T0 + 3_700_000);
    t.ingest({ anon: anon(1), errors: [err('Rare', ALERT_PER_HOUR - 1)] }, ip(1));
    expect(t.takeAlerts()).toHaveLength(0);
    t.ingest({ anon: anon(1), errors: [err('Rare')] }, ip(1));
    const alerts = t.takeAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].perHour).toBe(ALERT_PER_HOUR);
    t.ingest({ anon: anon(1), errors: [err('Rare', 50)] }, ip(1));
    expect(t.takeAlerts()).toHaveLength(0);
  });

  it('страница экранирует текст ошибок', () => {
    const { t, ip } = make();
    t.ingest({ anon: anon(1), errors: [err('<img src=x onerror=alert(1)>')] }, ip(1));
    const html = statsHtml(t.stats());
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(html).toContain('Игроков в день');
  });
});

describe('сводка', () => {
  it('в 9:00 по Москве, один раз в день', () => {
    const { t, at } = make();
    at(Date.UTC(2026, 9, 2, 5, 59));
    expect(t.summaryDue()).toBe(false);
    at(Date.UTC(2026, 9, 2, 6, 0));
    expect(t.summaryDue()).toBe(true);
    expect(t.summaryDue()).toBe(false);
    at(Date.UTC(2026, 9, 3, 6, 5));
    expect(t.summaryDue()).toBe(true);
    expect(t.summaryText()).toMatch(/Сводка NikitenokArena за 2026-10-02/);
  });
});
