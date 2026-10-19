// Небо, туман, свет и цвет дороги каждого мира.
export interface Look {
  top: string;
  horizon: string;
  fog: string;
  road: string;
  light: number;
  stars?: boolean;
  planet?: boolean;
}

export const LOOK: Record<number, Look> = {
  0: { top: '#5aa9ff', horizon: '#dff1ff', fog: '#cfe7fb', road: '#d8bf8a', light: 2.4 },
  1: { top: '#05030f', horizon: '#2a2050', fog: '#1d1838', road: '#2c3644', light: 1.8, stars: true, planet: true },
  2: { top: '#1e2a24', horizon: '#7f8f73', fog: '#6f7d66', road: '#3a3a3f', light: 1.6 },
  3: { top: '#1a0b26', horizon: '#6b3b7a', fog: '#4a2a58', road: '#7d6a8a', light: 1.7, stars: true },
};
