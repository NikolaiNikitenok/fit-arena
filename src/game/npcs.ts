import type { CharName } from '../three/kit';

// Жители и спутники героя. Портреты отрисованы заранее из тех же 3D-моделей (public/portraits).

export type NpcId = 'grom' | 'marfa' | 'fedor' | 'lisa' | 'bip' | 'vega' | 'boris' | 'knyaz';

export interface Npc {
  name: string;
  // Чем рисуется портрет: персонаж KayKit или робот.
  model: CharName | 'robot';
  tint?: string;
  color: string;
}

export const NPCS: Record<NpcId, Npc> = {
  grom: { name: 'Мастер Гром', model: 'Barbarian', color: '#ff7043' },
  marfa: { name: 'Бабушка Марфа', model: 'Mage', color: '#f48fb1' },
  fedor: { name: 'Купец Фёдор', model: 'Mage', color: '#9575cd' },
  lisa: { name: 'Лиса', model: 'Rogue', color: '#ffb74d' },
  bip: { name: 'БИП-7', model: 'robot', tint: '#80deea', color: '#4dd0e1' },
  vega: { name: 'Капитан Вега', model: 'Knight', tint: 'mul:0.7,0.9,1.45', color: '#64b5f6' },
  boris: { name: 'Борис Петрович', model: 'Barbarian', tint: 'mul:0.75,0.95,1.3', color: '#81c784' },
  knyaz: { name: 'Князь Диван', model: 'Skeleton_Mage', tint: 'mul:1.2,0.6,1.4', color: '#ba68c8' },
};

export const portraitUrl = (key: string) => `${import.meta.env.BASE_URL}portraits/${key}.png`;
