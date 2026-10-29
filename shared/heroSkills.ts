import { t } from '../src/i18n';
/**
 * Умения героя в набеге на деревню: открываются с уровнем героя (5, 10, 15 …), каждое — один раз за бой.
 * Игрок жмёт кнопку на панели высадки, и умение срабатывает вокруг героя на текущем тике.
 * В списке высадок умение записано как высадка с u = id умения, поэтому сервер пересчитывает его
 * тем же детерминированным боем (shared/villageBattle.ts) и проверяет, открыто ли оно у героя.
 */
export type SkillId = 'rage' | 'cry' | 'quake' | 'guard' | 'squad' | 'storm';

export interface SkillDef {
  id: SkillId;
  name: string;
  desc: string;
  // С какого уровня героя.
  level: number;
  color: string;
}

export const SKILLS: Record<SkillId, SkillDef> = {
  rage: { id: 'rage', name: t('Ярость'), desc: t('Герой восстанавливает 35% здоровья и 8 с бьёт в 1,6 раза сильнее и бегает быстрее.'), level: 5, color: '#ff7a59' },
  cry: { id: 'cry', name: t('Боевой клич'), desc: t('Отряды в 4 клетках от героя 8 с бьют на 40% сильнее и бегут на 25% быстрее.'), level: 10, color: '#ffd27a' },
  quake: { id: 'quake', name: t('Удар о землю'), desc: t('Четыре удара героя по всем постройкам рядом, стены — втрое сильнее. Башни в 4 клетках молчат 3 с.'), level: 15, color: '#c9a27a' },
  guard: { id: 'guard', name: t('Щит стража'), desc: t('Герой и отряды в 4 клетках от него 6 с получают на 60% меньше урона.'), level: 20, color: '#7ab8ff' },
  squad: { id: 'squad', name: t('Дружина'), desc: t('Рядом с героем встают 6 воинов — бесплатно, сила как у твоих воинов.'), level: 25, color: '#8affc1' },
  storm: { id: 'storm', name: t('Гнев Грома'), desc: t('Молнии бьют в три ближайшие к герою башни: −35% здоровья и 2 с тишины.'), level: 30, color: '#b9a6ff' },
};

export const SKILL_IDS: SkillId[] = ['rage', 'cry', 'quake', 'guard', 'squad', 'storm'];

export const isSkill = (u: unknown): u is SkillId => typeof u === 'string' && Object.prototype.hasOwnProperty.call(SKILLS, u);

/** Умения, открытые на этом уровне героя. */
export const skillsFor = (heroLevel: number | undefined): SkillId[] => (heroLevel ? SKILL_IDS.filter((k) => SKILLS[k].level <= heroLevel) : []);

/** Следующее умение, которое ещё не открыто. */
export const nextSkill = (heroLevel: number | undefined): SkillDef | undefined => SKILL_IDS.map((k) => SKILLS[k]).find((d) => d.level > (heroLevel ?? 0));

// Длительности (тики по 0,1 с), радиусы (клетки) и силы умений.
export const RAGE = { ticks: 80, heal: 0.35, dmg: 1.6, speed: 1.3 };
export const CRY = { ticks: 80, radius: 4, dmg: 1.4, speed: 1.25 };
export const QUAKE = { radius: 2.5, hits: 4, wallMul: 3, stunRadius: 4, stun: 30 };
export const GUARD = { ticks: 60, radius: 4, taken: 0.4 };
export const SQUAD = { count: 6, ring: 0.8 };
export const STORM = { targets: 3, share: 0.35, stun: 20 };
