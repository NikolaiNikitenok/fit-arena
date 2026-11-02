// Облик героя как костюм (src/three/skin.ts): металл, ткань, камни и мотив деталей у каждого облика.
// Чем выше редкость, тем больше деталей: редкий — наручи и пряжка, эпический — наплечники в два слоя,
// медальон и убор на голове, легендарный — корона и крылья.
import type { Metal, Motif, Skin } from '../three/skin';
import type { CharName } from '../three/kit';
import type { Item, Rarity } from './items';

const TIER: Record<Rarity, Skin['tier']> = { common: 0, rare: 1, epic: 2, legendary: 3 };

// Мотив по умолчанию: рыцарь — королевский, варвар — шипы, маг — кристаллы, разбойник — листья.
const MOTIF: Record<string, Motif> = { Knight: 'royal', Barbarian: 'spikes', Mage: 'crystal', Rogue: 'leaf' };

type Look = Partial<Pick<Skin, 'metal' | 'trim' | 'cloth' | 'cloth2' | 'leather' | 'gem' | 'motif'>>;

// Облики, которым подобран свой костюм. Остальные получают его из цвета и свечения облика.
const LOOKS: Record<string, Look> = {
  forest: { cloth: '#2e7d32', cloth2: '#1b5e20', leather: '#6d4c2f' },
  sky: { cloth: '#1e66c8', cloth2: '#42a5f5' },
  iron: { metal: 'steel', trim: 'silver', cloth: '#2f4f8a', gem: '#64b5f6' },
  cosmo: { metal: 'silver', trim: 'silver', cloth: '#1d2a6b', cloth2: '#4fc3f7', gem: '#4fc3f7' },
  shadow: { metal: 'obsidian', trim: 'silver', cloth: '#2a1f4a', cloth2: '#4527a0', leather: '#1c1428', gem: '#b388ff', motif: 'spikes' },
  'zombie-hunter': { metal: 'steel', trim: 'bronze', cloth: '#3b5323', cloth2: '#4e3b26', gem: '#aeea00' },
  crystal: { metal: 'silver', trim: 'silver', cloth: '#6a2c91', cloth2: '#e040fb', gem: '#e040fb', motif: 'crystal' },
  dragon: { metal: 'bronze', trim: 'gold', cloth: '#7a1a0c', cloth2: '#3a120a', leather: '#2a0d08', gem: '#ff3d00', motif: 'spikes' },
  'pass-silver': { metal: 'silver', trim: 'silver', cloth: '#56636f', gem: '#cfd8dc' },
  'pass-gold': { metal: 'gold', trim: 'gold', cloth: '#1f3f9a', cloth2: '#f2ede2', leather: '#3a2a1a', gem: '#40a9ff' },
  explorer: { metal: 'bronze', trim: 'gold', cloth: '#1f6f66', cloth2: '#26a69a', gem: '#64ffda', motif: 'leaf' },
  gold: { metal: 'gold', trim: 'gold', cloth: '#9b1430', leather: '#4a1a10', gem: '#ff2e4d' },
  'prog-fist': { metal: 'steel', trim: 'bronze', cloth: '#b23a1e', cloth2: '#4a1a0e', gem: '#ff5722', motif: 'flame' },
  'prog-bogatyr': { metal: 'silver', trim: 'gold', cloth: '#a0522d', cloth2: '#5a3a22', gem: '#ffa726', motif: 'royal' },
  'prog-stone': { metal: 'stone', trim: 'silver', cloth: '#5d5670', gem: '#c4b5fd', motif: 'crystal' },
  'prog-champion': { metal: 'gold', trim: 'gold', cloth: '#b3361f', gem: '#ff8a5c', motif: 'flame' },
  'ref-brother': { metal: 'silver', trim: 'silver', cloth: '#11697a', cloth2: '#00acc1', gem: '#00e5ff' },
  'ref-leader': { metal: 'obsidian', trim: 'gold', cloth: '#4a2a7a', cloth2: '#2a1840', gem: '#7c4dff', motif: 'spikes' },
  'titan-slayer': { metal: 'bronze', trim: 'gold', cloth: '#3a1f1a', gem: '#ff7043', motif: 'spikes' },
  'event-ice': { metal: 'ice', trim: 'silver', cloth: '#2a6fa8', gem: '#80deea', motif: 'crystal' },
  'event-remote': { metal: 'silver', trim: 'gold', cloth: '#ad1457', cloth2: '#ff4081', gem: '#ff4081' },
  'event-pizza': { metal: 'gold', trim: 'gold', cloth: '#d84315', cloth2: '#ffb74d', gem: '#ffd54f', motif: 'flame' },
  'event-excuse': { metal: 'gold', trim: 'gold', cloth: '#c79100', cloth2: '#fff176', gem: '#fff176' },
  'event-grill': { metal: 'bronze', trim: 'gold', cloth: '#bf360c', cloth2: '#3e1a10', gem: '#ff5722', motif: 'flame' },
  'event-lounger': { metal: 'silver', trim: 'gold', cloth: '#00838f', cloth2: '#4dd0e1', gem: '#4dd0e1' },
  'event-icecream': { metal: 'rose', trim: 'silver', cloth: '#f48fb1', cloth2: '#fce4ec', gem: '#f8bbd0', motif: 'crystal' },
  'event-siesta': { metal: 'gold', trim: 'gold', cloth: '#ef6c00', gem: '#ffb300' },
  'event-alarm': { metal: 'silver', trim: 'silver', cloth: '#455a64', gem: '#eceff1' },
  'event-pumpkin': { metal: 'bronze', trim: 'gold', cloth: '#e65100', cloth2: '#1b1b1b', gem: '#ff9100', motif: 'flame' },
  'event-blanket': { metal: 'silver', trim: 'silver', cloth: '#5e35b1', cloth2: '#b39ddb', gem: '#b39ddb' },
  'event-olivier': { metal: 'gold', trim: 'gold', cloth: '#2e7d32', cloth2: '#a5d6a7', gem: '#66bb6a', motif: 'royal' },
};

// Металл по редкости, если облик не задал свой.
const METAL_BY_TIER: Metal[] = ['steel', 'steel', 'silver', 'gold'];
const TRIM_BY_TIER: Metal[] = ['steel', 'silver', 'gold', 'gold'];

/** Костюм облика. Стартовый облик — родные цвета модели, без костюма. */
export function outfitSkin(item: Pick<Item, 'id' | 'hero' | 'rarity' | 'color' | 'glow'>): Skin | undefined {
  if (item.id === 'starter') return undefined;
  const tier = TIER[item.rarity];
  const look = LOOKS[item.id] ?? {};
  const cloth = look.cloth ?? item.color;
  return {
    key: item.id,
    tier,
    metal: look.metal ?? METAL_BY_TIER[tier],
    trim: look.trim ?? TRIM_BY_TIER[tier],
    cloth,
    cloth2: look.cloth2 ?? item.glow ?? cloth,
    leather: look.leather ?? '#5b3a24',
    gem: look.gem ?? item.glow ?? item.color,
    motif: look.motif ?? MOTIF[item.hero as CharName] ?? 'royal',
  };
}

/** Как выглядит герой в этом облике: модель, костюм и — только у облика без костюма — старый оттенок и свечение. */
export function heroLook(item: Item): { model: CharName; skin?: Skin; tint?: string; glow?: string } {
  const skin = outfitSkin(item);
  return skin ? { model: item.hero, skin } : { model: item.hero, tint: item.tint, glow: item.glow };
}
