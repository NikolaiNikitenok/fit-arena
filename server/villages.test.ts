import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { lootAvailable } from '../shared/village';
import { baseOf, type Deploy, simulateBattle } from '../shared/villageBattle';
import { LOCK_MS, REVENGE_MS, SHIELD_BIG_MS, type TargetView } from '../shared/villagePvp';
import { townOf } from '../src/village/state';
import { villageApi } from './villageApi';
import { isFail, VillageStore } from './villages';
import { testProgress } from './villages.fixture';

// 12:00 по Москве.
const T0 = Date.UTC(2026, 9, 20, 9);
const ARMY = { troops: { warrior: 20, archer: 10 }, level: 2, hero: 5 };
const WIN: Deploy[] = [
  ...Array.from({ length: 20 }, (_, k) => ({ t: k, u: 'warrior' as const, x: 10 + (k % 5) * 0.4, y: 26 })),
  ...Array.from({ length: 10 }, (_, k) => ({ t: 20 + k, u: 'archer' as const, x: 12 + (k % 5) * 0.4, y: 26 })),
];

function setup(extra: Partial<ConstructorParameters<typeof VillageStore>[1]> = {}) {
  const clock = { now: T0 };
  const flags: string[] = [];
  const blocks: [string, string][] = [];
  const v = new VillageStore(null, {
    now: () => clock.now,
    random: () => 0.42,
    flag: (id, kind) => flags.push(`${id}:${kind}`),
    blocked: (a, b) => blocks.some(([x, y]) => (x === a && y === b) || (x === b && y === a)),
    heroLevel: () => 10,
    ...extra,
  });
  return { v, clock, flags, blocks };
}
const target = (r: ReturnType<VillageStore['find']>): TargetView => {
  if (isFail(r)) throw new Error(r.error);
  return r;
};

describe('снимок деревни из сохранения', () => {
  it('правдоподобный принимается, невозможный — нет, и игрок отмечается', () => {
    const { v, flags } = setup();
    expect(v.update('tg:1', testProgress(2), 'Аня')).toBe(true);
    const good = v.get('tg:1')!;
    const bad = (mut: (p: ReturnType<typeof testProgress>) => void) => {
      const p = testProgress(2);
      mut(p);
      return v.update('tg:1', p);
    };
    // Башня 5 уровня при ратуше 2.
    expect(bad((p) => (p.village!.b![5].l = 5))).toBe(false);
    // Вторая ратуша.
    expect(bad((p) => p.village!.b!.push({ i: 50, t: 'townhall', x: 0, y: 10, l: 2 }))).toBe(false);
    // Постройки наложены.
    expect(bad((p) => (p.village!.b![2].x = 3))).toBe(false);
    // За сеткой.
    expect(bad((p) => (p.village!.b![2].x = 23))).toBe(false);
    // Пять казарм.
    expect(bad((p) => [0, 1, 2, 3].forEach((k) => p.village!.b!.push({ i: 60 + k, t: 'barracks', x: 2 + 3 * k, y: 6, l: 1 })))).toBe(false);
    // Войско больше лагеря и закрытый отряд.
    expect(bad((p) => (p.village!.army = { warrior: 31 }))).toBe(false);
    expect(bad((p) => (p.village!.army = { giant: 1 }))).toBe(false);
    expect(v.get('tg:1')).toBe(good);
    expect(flags.filter((f) => f === 'tg:1:village')).toHaveLength(7);
  });
});

describe('поиск соперника', () => {
  it('близкая ратуша и кубки; не себя, не со щитом, не из чёрного списка, не того, на кого уже нападают', () => {
    const { v, blocks } = setup();
    v.update('tg:1', testProgress(2), 'Я');
    v.update('tg:2', testProgress(2), 'Боря');
    v.update('tg:3', testProgress(5), 'Далеко');
    v.update('tg:4', testProgress(3), 'Щит');
    v.update('tg:5', testProgress(1), 'Враг');
    v.get('tg:4')!.shieldUntil = T0 + 1000;
    blocks.push(['tg:5', 'tg:1']);
    expect(v.candidates('tg:1', T0).map((x) => x.id)).toEqual(['tg:2']);
    const t = target(v.find('tg:1', 'Я'));
    expect(t.bot).toBeUndefined();
    expect(t.name).toBe('Боря');
    expect(t.layout.buildings).toEqual(baseOf(townOf(testProgress(2))).buildings);
    // Деревню охраняет герой защитника его уровня.
    expect(t.layout.hero).toBe(10);
    expect(t.lootAvailable).toEqual(lootAvailable(townOf(testProgress(2)), T0));
    // Пока tg:1 бьёт Борю, другим его не выдают.
    v.update('tg:6', testProgress(2), 'Вика');
    expect(v.candidates('tg:6', T0).map((x) => x.id)).not.toContain('tg:2');
  });

  it('никого нет — деревня-бот; пропуск отпускает цель, не чаще 10 раз в минуту', () => {
    const { v } = setup();
    v.update('tg:1', testProgress(2));
    expect(target(v.find('tg:1', 'Я')).bot).toBe(true);
    v.update('tg:2', testProgress(2));
    const a = target(v.find('tg:1', 'Я'));
    expect(a.bot).toBeUndefined();
    // Пропустили Борю: он снова свободен для других, а нам его 10 минут не выдают.
    expect(target(v.find('tg:1', 'Я')).bot).toBe(true);
    v.update('tg:3', testProgress(2));
    expect(v.candidates('tg:3', T0).map((x) => x.id)).toContain('tg:2');
    for (let k = 3; k < 10; k++) expect(isFail(v.find('tg:1', 'Я'))).toBe(false);
    const r = v.find('tg:1', 'Я');
    expect(isFail(r) && r.status).toBe(429);
  });

  it('без сохранённой деревни искать нельзя', () => {
    const { v } = setup();
    const r = v.find('tg:9', 'Я');
    expect(isFail(r) && r.status).toBe(409);
  });
});

describe('набег', () => {
  it('сервер сам считает бой: кубки, щит, журнал защитника, добыча только по ответу', () => {
    const { v, clock } = setup();
    v.update('tg:1', testProgress(2), 'Я');
    v.update('tg:2', testProgress(2), 'Боря');
    v.get('tg:1')!.shieldUntil = T0 + 5000;
    const t = target(v.find('tg:1', 'Я'));
    // Поиск снял свой щит.
    expect(v.get('tg:1')!.shieldUntil).toBe(T0);
    clock.now += 60_000;
    const r = v.submit('tg:1', { token: t.token, seed: t.seed, army: ARMY, deploys: WIN });
    if (isFail(r)) throw new Error(r.error);
    // Тот же бой, что посчитал телефон.
    expect(r.result).toEqual(simulateBattle({ base: t.layout, army: ARMY, deploys: WIN, loot: t.lootAvailable, seed: t.seed }));
    expect(r.result.stars).toBe(3);
    expect(r.win!.trophies).toBe(t.offer!.win);
    expect(r.me!.trophies).toBe(t.offer!.win);
    expect(v.get('tg:2')!.shieldUntil).toBe(clock.now + SHIELD_BIG_MS);
    expect(v.candidates('tg:3', clock.now).map((x) => x.id)).not.toContain('tg:2');

    // Защитник получает набег для журнала с повтором; пока телефон не применил — сервер сам вычитает добычу.
    const inbox = v.inbox('tg:2');
    expect(inbox.defenses).toHaveLength(1);
    const d = inbox.defenses[0];
    expect(d).toMatchObject({ who: 'Я', stars: 3, loot: r.result.loot, seed: t.seed, deploys: WIN });
    expect(d.revenge).toBe(REVENGE_MS);
    expect(v.current('tg:2')!.res.wood).toBeLessThan(2000);
    // Телефон применил и сохранил: больше не вычитаем.
    v.update('tg:2', testProgress(2, { res: 2000 - r.result.loot.wood, pvp: { def: [d.id] } }));
    expect(v.current('tg:2')!.res.wood).toBe(2000 - r.result.loot.wood);

    // Нападающий: пока телефон не зачёл набег, он в wins, а войско на сервере уже потрачено.
    expect(v.inbox('tg:1').wins.map((w) => w.id)).toEqual([r.win!.id]);
    expect(v.current('tg:1')!.army).toMatchObject({ warrior: 0, archer: 0 });
    v.update('tg:1', testProgress(2, { army: {}, pvp: { won: [r.win!.id] } }));
    expect(v.inbox('tg:1').wins).toEqual([]);
  });

  it('бронь: только своя; итог можно прислать и после брони, но не позже чем через 15 минут', () => {
    const { v, clock } = setup();
    v.update('tg:1', testProgress(2));
    v.update('tg:2', testProgress(2));
    v.update('tg:3', testProgress(2));
    const t = target(v.find('tg:1', 'Я'));
    expect(isFail(v.submit('tg:3', { token: t.token, army: ARMY, deploys: WIN }))).toBe(true);
    clock.now += LOCK_MS + 15 * 60_000 + 1;
    const late = v.submit('tg:1', { token: t.token, army: ARMY, deploys: WIN });
    expect(isFail(late) && late.error).toBe('Время набега вышло');
    // После брони цель снова доступна.
    expect(v.candidates('tg:3', clock.now).length).toBeGreaterThan(0);
    // Связь пропала, итог дошёл через пару минут после конца брони — засчитывается.
    const t2 = target(v.find('tg:1', 'Я'));
    clock.now += LOCK_MS + 2 * 60_000;
    const first = v.submit('tg:1', { token: t2.token, army: ARMY, deploys: WIN });
    if (isFail(first)) throw new Error(first.error);
    // Ответ не дошёл, телефон прислал тот же бой ещё раз — тот же итог, без второй награды.
    const again = v.submit('tg:1', { token: t2.token, army: ARMY, deploys: WIN });
    if (isFail(again)) throw new Error(again.error);
    expect(again.win!.id).toBe(first.win!.id);
    expect(again.result.loot).toEqual(first.result.loot);
    expect(again.me!.trophies).toBe(first.me!.trophies);
    // Чужой токен чужого боя не отдаём.
    expect(isFail(v.submit('tg:3', { token: t2.token, army: ARMY, deploys: WIN }))).toBe(true);
  });

  it('бронь переживает перезапуск сервера', () => {
    const file = `${tmpdir()}/villages-${process.pid}-${Date.now()}.json`;
    const clock = { now: T0 };
    const deps = { now: () => clock.now, random: () => 0.42, heroLevel: () => 10 };
    const a = new VillageStore(file, deps);
    a.update('tg:1', testProgress(2), 'Я');
    a.update('tg:2', testProgress(2), 'Боря');
    const t = target(a.find('tg:1', 'Я'));
    a.flush();
    clock.now += 90_000;
    const b = new VillageStore(file, deps);
    const r = b.submit('tg:1', { token: t.token, seed: t.seed, army: ARMY, deploys: WIN });
    if (isFail(r)) throw new Error(r.error);
    expect(r.result.stars).toBe(3);
    rmSync(file, { force: true });
  });

  it('подделанное войско и высадки не проходят и отмечаются', () => {
    const { v, flags } = setup();
    v.update('tg:1', testProgress(2));
    v.update('tg:2', testProgress(2));
    const tries: [object, Deploy[] | unknown, number?][] = [
      [{ ...ARMY, troops: { warrior: 25, archer: 10 } }, WIN],
      [{ ...ARMY, level: 8 }, WIN],
      [{ ...ARMY, hero: 99 }, WIN],
      [{ ...ARMY, troops: { giant: 1 } }, WIN],
      // Высадка прямо в деревне.
      [ARMY, [{ t: 0, u: 'warrior', x: 11, y: 11 }]],
      // Отрядов больше, чем в войске.
      [ARMY, [...WIN, { t: 40, u: 'warrior', x: 10, y: 26 }]],
      // Не по порядку и после сдачи.
      [ARMY, [{ t: 5, u: 'warrior', x: 10, y: 26 }, { t: 1, u: 'warrior', x: 10, y: 26 }]],
      [ARMY, WIN, 10],
    ];
    for (const [army, deploys, endTick] of tries) {
      const t = target(v.find('tg:1', 'Я'));
      v.get('tg:2')!.shieldUntil = 0;
      const r = v.submit('tg:1', { token: t.token, seed: t.seed, army, deploys, endTick });
      expect(isFail(r) && r.status).toBe(400);
    }
    const t = target(v.find('tg:1', 'Я'));
    expect(isFail(v.submit('tg:1', { token: t.token, seed: t.seed + 1, army: ARMY, deploys: WIN }))).toBe(true);
    expect(flags.filter((f) => f.startsWith('tg:1:pvp'))).toHaveLength(tries.length + 1);
  });

  it('то же войско дважды не использовать, ту же деревню — раз в сутки', () => {
    const { v, clock } = setup();
    v.update('tg:1', testProgress(2), 'Я');
    v.update('tg:2', testProgress(2), 'Боря');
    v.update('tg:3', testProgress(2), 'Вика');
    const t = target(v.find('tg:1', 'Я'));
    const victim = t.name;
    expect(isFail(v.submit('tg:1', { token: t.token, army: ARMY, deploys: WIN }))).toBe(false);
    // Снимок ещё старый, но сервер помнит, что войско потрачено.
    v.get('tg:2')!.shieldUntil = 0;
    v.get('tg:3')!.shieldUntil = 0;
    const t2 = target(v.find('tg:1', 'Я'));
    expect(isFail(v.submit('tg:1', { token: t2.token, army: ARMY, deploys: WIN }))).toBe(true);
    const ids = v.candidates('tg:1', clock.now).map((x) => x.id);
    expect(ids.some((id) => v.get(id)!.name === victim)).toBe(false);
  });
});

describe('месть', () => {
  it('один раз в течение суток, если у обидчика нет щита', () => {
    const { v, clock } = setup();
    v.update('tg:1', testProgress(2), 'Обидчик');
    v.update('tg:2', testProgress(2), 'Я');
    const t = target(v.find('tg:1', 'Обидчик'));
    const r = v.submit('tg:1', { token: t.token, army: ARMY, deploys: WIN });
    if (isFail(r)) throw new Error(r.error);
    const id = v.inbox('tg:2').defenses[0].id;
    // Чужой набег не отомстить.
    expect(isFail(v.revenge('tg:3', 'X', id))).toBe(true);
    v.get('tg:1')!.shieldUntil = clock.now + 1000;
    expect(isFail(v.revenge('tg:2', 'Я', id))).toBe(true);
    v.get('tg:1')!.shieldUntil = 0;
    const rv = v.revenge('tg:2', 'Я', id);
    if (isFail(rv)) throw new Error(rv.error);
    expect(rv.revenge).toBe(true);
    expect(rv.name).toBe('Обидчик');
    const back = v.submit('tg:2', { token: rv.token, army: ARMY, deploys: WIN });
    expect(isFail(back)).toBe(false);
    expect(v.inbox('tg:2').defenses[0].revenge).toBe(0);
    v.get('tg:1')!.shieldUntil = 0;
    expect(isFail(v.revenge('tg:2', 'Я', id))).toBe(true);
  });

  it('через сутки уже нельзя', () => {
    const { v, clock } = setup();
    v.update('tg:1', testProgress(2));
    v.update('tg:2', testProgress(2));
    const t = target(v.find('tg:1', 'A'));
    v.submit('tg:1', { token: t.token, army: ARMY, deploys: WIN });
    const id = v.inbox('tg:2').defenses[0].id;
    v.get('tg:1')!.shieldUntil = 0;
    clock.now += REVENGE_MS + 1;
    const r = v.revenge('tg:2', 'B', id);
    expect(isFail(r) && r.error).toMatch(/суток/);
  });
});

describe('бот о набегах', () => {
  const attackAt = (now: number, extra = {}) => {
    const s = setup(extra);
    s.clock.now = now;
    s.v.update('tg:1', testProgress(2), 'Вася');
    s.v.update('tg:2', testProgress(2), 'Я');
    const t = target(s.v.find('tg:1', 'Вася'));
    s.v.submit('tg:1', { token: t.token, army: ARMY, deploys: WIN });
    return s;
  };

  it('днём — сразу, со звёздами и добычей', () => {
    const { v } = attackAt(T0);
    const list = v.takeNotices();
    expect(list).toHaveLength(1);
    expect(list[0].to).toBe('tg:2');
    expect(list[0].text).toMatch(/^⚔️ Вася напал на твою деревню: 3★, унёс .* дерева/);
    expect(list[0].text).toMatch(/Отомстить\?/);
    expect(v.takeNotices()).toEqual([]);
  });

  it('ночью ждёт 9 утра по Москве', () => {
    // 23:30 по Москве.
    const night = Date.UTC(2026, 9, 20, 20, 30);
    const { v, clock } = attackAt(night);
    expect(v.takeNotices()).toEqual([]);
    clock.now = Date.UTC(2026, 9, 21, 6, 1);
    expect(v.takeNotices()).toHaveLength(1);
  });

  it('выключено или бот остановлен — не пишем', () => {
    const a = attackAt(T0, { botBlocked: () => true });
    expect(a.v.takeNotices()).toEqual([]);
    const b = setup();
    b.v.setNotify('tg:2', false);
    b.v.update('tg:1', testProgress(2));
    b.v.update('tg:2', testProgress(2));
    const t = target(b.v.find('tg:1', 'Вася'));
    b.v.submit('tg:1', { token: t.token, army: ARMY, deploys: WIN });
    expect(b.v.takeNotices()).toEqual([]);
    expect(b.v.me('tg:2').notify).toBe(false);
  });
});

describe('топ и удаление', () => {
  it('топ по кубкам, игрок видит себя; удаление стирает деревню и имя в чужом журнале', () => {
    const { v } = setup();
    v.update('tg:1', testProgress(2), 'Вася');
    v.update('tg:2', testProgress(2), 'Я');
    const t = target(v.find('tg:1', 'Вася'));
    v.submit('tg:1', { token: t.token, army: ARMY, deploys: WIN });
    const top = villageApi(v, '/api/village/top', { id: 'tg:1', name: 'Вася' }, {}).body as { top: { name: string; me?: boolean; league: string }[] };
    expect(top.top[0]).toMatchObject({ name: 'Вася', me: true, league: 'Бронза' });
    expect(villageApi(v, '/api/village/find', null, {}).status).toBe(401);
    v.forget('tg:1');
    expect(v.get('tg:1')).toBeUndefined();
    expect(v.inbox('tg:2').defenses[0].who).toBe('Удалённый игрок');
    expect(v.inbox('tg:2').defenses[0].revenge).toBe(0);
  });
});
