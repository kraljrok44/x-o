export type RewardedPlacement = 'post_race_bonus' | 'daily_bonus' | 'free_coins' | 'event_bonus';

export interface RewardedPlacementConfig {
  id: RewardedPlacement;
  title: string;
  description: string;
  reward: { coins?: number; seasonPoints?: number };
  maxPerDay: number;
  perRace?: boolean;
}

export const AdConfig = {
  rewarded: {
    post_race_bonus: {
      id: 'post_race_bonus',
      title: 'Bonus Coins',
      description: 'Watch a short video ad (usually 15–30 s) to get +15 Coins for this race.',
      reward: { coins: 15 },
      maxPerDay: 3,
      perRace: true,
    },
    daily_bonus: {
      id: 'daily_bonus',
      title: 'Daily Video Bonus',
      description: 'Watch a short video ad once per day for +30 Coins.',
      reward: { coins: 30 },
      maxPerDay: 1,
    },
    free_coins: {
      id: 'free_coins',
      title: 'Free Coins',
      description: 'Watch a short video ad for +20 Coins.',
      reward: { coins: 20 },
      maxPerDay: 2,
    },
    event_bonus: {
      id: 'event_bonus',
      title: 'Season Boost',
      description: 'Watch a short video ad for +50 Season Points.',
      reward: { seasonPoints: 50 },
      maxPerDay: 1,
    },
  } satisfies Record<RewardedPlacement, RewardedPlacementConfig>,
  rewardedDailyCap: 3,
  rewardedMinIntervalSec: 45,

  interstitial: {
    graceRaces: 3,
    everyRaces: 3,
    minIntervalSec: 180,
    skipAfterRewardedSec: 120,
  },
} as const;
