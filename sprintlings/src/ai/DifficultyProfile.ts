export type DifficultyId = 'rookie' | 'racer' | 'ace' | 'perfect';

export interface DifficultyProfile {
  id: DifficultyId;
  label: string;
  replanInterval: number;
  horizon: number;
  jumpJitter: number;
  mistakeChance: number;
  mistakeTicks: number;
  itemDelay: number;
  greed: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyProfile> = {
  rookie: { id: 'rookie', label: 'Rookie', replanInterval: 10, horizon: 60, jumpJitter: 5, mistakeChance: 0.22, mistakeTicks: 24, itemDelay: 1.8, greed: 0.4 },
  racer: { id: 'racer', label: 'Racer', replanInterval: 8, horizon: 66, jumpJitter: 2, mistakeChance: 0.07, mistakeTicks: 16, itemDelay: 1.0, greed: 0.7 },
  ace: { id: 'ace', label: 'Ace', replanInterval: 6, horizon: 72, jumpJitter: 1, mistakeChance: 0.025, mistakeTicks: 12, itemDelay: 0.5, greed: 1 },
  perfect: { id: 'perfect', label: 'Perfect (validator)', replanInterval: 4, horizon: 78, jumpJitter: 0, mistakeChance: 0, mistakeTicks: 0, itemDelay: 0.3, greed: 1 },
};
