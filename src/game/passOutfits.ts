// Облики пропуска: у каждого сезона своя пара — бесплатный (эпический) и Pro (легендарный, с короной и крыльями).
// Первый сезон — «Серый страж» и «Страж Золотого щита» (src/game/items.ts), дальше — темы ниже по кругу:
// во втором круге герои меняются местами и у облика другие цвета, так что двух одинаковых нет.
// Только данные: их читают и предметы, и костюмы (src/game/outfitSkin.ts), и пропуск (src/game/pass.ts).
import type { CharName } from '../three/kit';
import type { Metal, Motif } from '../three/skin';
import { t } from '../i18n';

// Сезоны с заготовленными обликами: первый — свои, со второго по PASS_LAST — по темам.
export const PASS_LAST = 27;

interface Theme {
  free: string;
  pro: string;
  freeHero: CharName;
  proHero: CharName;
  // Ткань, вторая ткань, камень.
  cloth: string;
  cloth2: string;
  gem: string;
  freeMetal: Metal;
  proMetal: Metal;
  proTrim: Metal;
  motif: Motif;
}

const T = (free: string, pro: string, freeHero: CharName, proHero: CharName, cloth: string, cloth2: string, gem: string, freeMetal: Metal, proMetal: Metal, proTrim: Metal, motif: Motif): Theme => ({
  free, pro, freeHero, proHero, cloth, cloth2, gem, freeMetal, proMetal, proTrim, motif,
});

const THEMES: Theme[] = [
  T(t('Страж бури'), t('Повелитель бури'), 'Barbarian', 'Mage', '#263b5e', '#4fc3f7', '#4fc3f7', 'steel', 'silver', 'gold', 'crystal'),
  T(t('Угольный боец'), t('Владыка пламени'), 'Barbarian', 'Mage', '#5a1a10', '#ff7043', '#ff5722', 'bronze', 'gold', 'gold', 'flame'),
  T(t('Лесной дозорный'), t('Король чащи'), 'Rogue', 'Barbarian', '#1f5a2a', '#9ccc65', '#76ff03', 'bronze', 'gold', 'gold', 'leaf'),
  T(t('Ночной клинок'), t('Князь полуночи'), 'Rogue', 'Knight', '#1a1433', '#7c4dff', '#b388ff', 'obsidian', 'obsidian', 'gold', 'spikes'),
  T(t('Вестник рассвета'), t('Солнечный паладин'), 'Mage', 'Knight', '#f2e6c8', '#ffb74d', '#ffca28', 'silver', 'gold', 'gold', 'royal'),
  T(t('Морской страж'), t('Владыка глубин'), 'Rogue', 'Mage', '#0d4a5a', '#26c6da', '#1de9b6', 'steel', 'silver', 'gold', 'crystal'),
  T(t('Инейный следопыт'), t('Король севера'), 'Rogue', 'Barbarian', '#2a4f78', '#b3e5fc', '#80deea', 'ice', 'ice', 'silver', 'crystal'),
  T(t('Песчаный странник'), t('Фараон арены'), 'Mage', 'Knight', '#c9a25a', '#1e88e5', '#00b0ff', 'bronze', 'gold', 'gold', 'royal'),
  T(t('Сакуровый воин'), t('Хранитель сакуры'), 'Knight', 'Mage', '#8e2c50', '#f8bbd0', '#ff80ab', 'rose', 'rose', 'gold', 'leaf'),
  T(t('Громовой ученик'), t('Наследник Грома'), 'Barbarian', 'Barbarian', '#2b2b3a', '#ffd740', '#ffea00', 'steel', 'obsidian', 'gold', 'spikes'),
  T(t('Аметистовый страж'), t('Аметистовый монарх'), 'Knight', 'Rogue', '#3b1f5e', '#ce93d8', '#e040fb', 'silver', 'silver', 'gold', 'crystal'),
  T(t('Изумрудный лучник'), t('Изумрудный император'), 'Rogue', 'Knight', '#0f4a3a', '#69f0ae', '#00e676', 'silver', 'gold', 'gold', 'royal'),
  T(t('Алый рубака'), t('Алый король'), 'Barbarian', 'Rogue', '#6a0f1a', '#ff5252', '#ff1744', 'steel', 'gold', 'gold', 'flame'),
];

export interface PassOutfit {
  id: string;
  season: number;
  track: 'free' | 'pro';
  name: string;
  hero: CharName;
  // Цвет и свечение — для иконок; костюм — в look.
  color: string;
  glow: string;
  look: { metal: Metal; trim: Metal; cloth: string; cloth2: string; gem: string; motif: Motif };
}

const mixHex = (a: string, b: string) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `#${p(a).map((v, i) => Math.round((v + p(b)[i]) / 2).toString(16).padStart(2, '0')).join('')}`;
};

/** Облики пропуска всех заготовленных сезонов, начиная со второго. */
export function passOutfits(): PassOutfit[] {
  const out: PassOutfit[] = [];
  for (let season = 2; season <= PASS_LAST; season++) {
    const k = season - 2;
    const th = THEMES[k % THEMES.length];
    const second = k >= THEMES.length;
    // Второй круг: герои меняются, ткани меняются местами, к имени — «II».
    const cloth = second ? mixHex(th.cloth2, th.cloth) : th.cloth;
    const cloth2 = second ? th.cloth : th.cloth2;
    const suffix = second ? ' II' : '';
    out.push({
      id: `pass-free-${season}`,
      season,
      track: 'free',
      name: th.free + suffix,
      hero: second ? th.proHero : th.freeHero,
      color: cloth2,
      glow: th.gem,
      look: { metal: th.freeMetal, trim: 'silver', cloth, cloth2, gem: th.gem, motif: th.motif },
    });
    out.push({
      id: `pass-pro-${season}`,
      season,
      track: 'pro',
      name: th.pro + suffix,
      hero: second ? th.freeHero : th.proHero,
      color: th.gem,
      glow: th.gem,
      look: { metal: th.proMetal, trim: th.proTrim, cloth, cloth2, gem: th.gem, motif: th.motif },
    });
  }
  return out;
}

/** id облика наград сезона: первый сезон — прежние, дальше — свои, после заготовленных — последние. */
export function passOutfitIds(season: number): { free: string; pro: string } {
  if (season <= 1) return { free: 'pass-silver', pro: 'pass-gold' };
  const s = Math.min(season, PASS_LAST);
  return { free: `pass-free-${s}`, pro: `pass-pro-${s}` };
}
