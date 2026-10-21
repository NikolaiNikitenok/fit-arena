import { describe, expect, it } from 'vitest';
import { TROOP_IDS, TROOPS } from '../../shared/villageBattle';
import { fmtDec, speedLabel, troopInfo } from './troopInfo';
import { faceTo, frameOf, troopPose, turnToward } from './troopPose';

const stat = (id: Parameters<typeof troopInfo>[0], label: string, lvl = 1) => troopInfo(id, lvl).stats.find((s) => s.label === label);

describe('описание отрядов в казармах', () => {
  it('числа по-русски', () => {
    expect(fmtDec(1.5)).toBe('1,5');
    expect(fmtDec(10)).toBe('10');
    expect(fmtDec(11.2)).toBe('11,2');
    expect(fmtDec(2.333, 2)).toBe('2,33');
  });

  it('воин: здоровье, урон, ближний бой, наземный', () => {
    const w = troopInfo('warrior', 1);
    expect(w.name).toBe('Воин');
    expect(stat('warrior', 'Здоровье')?.value).toBe('70');
    expect(stat('warrior', 'Урон за удар')?.value).toBe('10');
    expect(stat('warrior', 'Урон в секунду')?.value).toBe('10');
    expect(stat('warrior', 'Дальность')?.note).toBe('ближний бой');
    expect(w.tags).toContain('Наземный');
    expect(w.hitBy).toEqual(['Башня лучников', 'Катапульта']);
    expect(w.safeFrom).toEqual([]);
    expect(w.bonus).toBe(0);
    expect(w.perLevel).toBe(12);
  });

  it('уровень казарм усиливает так же, как в бою', () => {
    // 3 уровень: +24%.
    expect(troopInfo('giant', 3).bonus).toBe(24);
    expect(stat('giant', 'Здоровье', 3)?.value).toBe(String(Math.round(400 * 1.24)));
    expect(stat('giant', 'Урон за удар', 3)?.value).toBe(fmtDec(Math.round(21 * 1.24 * 10) / 10));
    expect(stat('giant', 'Урон в секунду')?.value).toBe('14');
    expect(stat('giant', 'Цель')?.value).toMatch(/Оборона/);
  });

  it('лучник — дальний бой; подрывник — взрыв по стенам; целитель летает и катапульта его не достаёт', () => {
    expect(stat('archer', 'Дальность')?.value).toBe('3,5 кл.');
    expect(troopInfo('archer', 1).tags).toContain('Дальний бой');
    expect(stat('wallbreaker', 'Урон взрыва')?.note).toBe('по стенам ×40 = 480');
    expect(stat('wallbreaker', 'Радиус взрыва')?.value).toBe('1,5 кл.');
    const h = troopInfo('healer', 1);
    expect(h.tags[0]).toBe('Летающий');
    expect(h.safeFrom).toEqual(['Катапульта']);
    expect(h.hitBy).toEqual(['Башня лучников']);
    expect(stat('healer', 'Лечение')?.value).toBe('18/с');
    expect(stat('healer', 'Урон за удар')).toBeUndefined();
    expect(h.bonusWhat).toBe('здоровья и лечения');
    expect(troopInfo('archer', 1).bonusWhat).toBe('здоровья и урона');
  });

  it('у каждого отряда есть место, обучение, цена и скорость словами', () => {
    for (const id of TROOP_IDS) {
      const i = troopInfo(id, 1);
      expect(stat(id, 'Мест в лагере')?.value).toBe(String(TROOPS[id].housing));
      expect(stat(id, 'Обучение')?.value).toBeTruthy();
      expect(i.role.length).toBeGreaterThan(40);
      expect(i.cost).toEqual(TROOPS[id].cost);
    }
    expect(speedLabel(2.4)).toBe('очень быстро');
    expect(speedLabel(1)).toBe('медленно');
  });
});

describe('движения отрядов в бою', () => {
  const base = { alive: true, moving: false, sinceHit: 99, every: 1, attackDur: 1.07, impact: 0.45, clock: 0.3 };
  it('бег, покой, смерть и лечение', () => {
    expect(troopPose({ ...base, moving: true }).clip).toBe('run');
    expect(troopPose(base).clip).toBe('idle');
    expect(troopPose({ ...base, alive: false, deadFor: 0.4 })).toEqual({ clip: 'death', t: 0.4 });
    expect(troopPose({ ...base, healing: true }).clip).toBe('cast');
  });

  it('попадание в движении удара совпадает с тиком удара', () => {
    // Сразу после удара — момент попадания.
    expect(troopPose({ ...base, sinceHit: 0 })).toEqual({ clip: 'attack', t: 0.45 });
    // Удары чаще, чем длится движение: оно ускоряется.
    const fast = troopPose({ ...base, every: 0.5, sinceHit: 0.1 });
    expect(fast.clip).toBe('attack');
    expect(fast.t).toBeCloseTo(0.45 + 0.1 * (1.07 / 0.5));
    // Перед следующим ударом — замах.
    const wind = troopPose({ ...base, sinceHit: 0.8 });
    expect(wind.clip).toBe('attack');
    expect(wind.t).toBeCloseTo(0.45 - 0.2 * 1.07);
  });

  it('подрывник замахивается бомбой на последних шагах', () => {
    const bomber = { ...base, every: 0, moving: true };
    // Далеко от стены — бежит.
    expect(troopPose({ ...bomber, blastIn: 2 }).clip).toBe('run');
    // Замах начинается так, чтобы удар пришёлся на взрыв.
    expect(troopPose({ ...bomber, blastIn: 0.3 })).toEqual({ clip: 'attack', t: 0.45 - 0.3 });
    expect(troopPose({ ...bomber, blastIn: 0 })).toEqual({ clip: 'attack', t: 0.45 });
  });

  it('кадры по кругу и с остановкой', () => {
    expect(frameOf(0, 1, 8, true)).toBe(0);
    expect(frameOf(0.99, 1, 8, true)).toBe(7);
    expect(frameOf(1.01, 1, 8, true)).toBe(0);
    expect(frameOf(5, 1, 8, false)).toBe(7);
    expect(frameOf(-1, 1, 8, false)).toBe(0);
  });

  it('поворот к цели кратчайшим путём', () => {
    expect(faceTo(0, 1)).toBeCloseTo(0);
    expect(faceTo(1, 0)).toBeCloseTo(Math.PI / 2);
    expect(turnToward(3, -3, 1)).toBeCloseTo(-3 + Math.PI * 2);
    expect(turnToward(0, 1, 0.5)).toBeCloseTo(0.5);
  });
});
