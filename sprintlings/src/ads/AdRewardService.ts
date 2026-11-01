import { AdConfig, type RewardedPlacement } from '../config/AdConfig';

export function describeAdReward(placement: RewardedPlacement): string {
  const r = AdConfig.rewarded[placement].reward as { coins?: number; seasonPoints?: number };
  const parts: string[] = [];
  if (r.coins) parts.push(`+${r.coins} Coins`);
  if (r.seasonPoints) parts.push(`+${r.seasonPoints} Season Points`);
  return parts.join(', ');
}

export function placementLimits(placement: RewardedPlacement): string {
  const cfg = AdConfig.rewarded[placement];
  return `Up to ${cfg.maxPerDay} per day · max ${AdConfig.rewardedDailyCap} video rewards per day in total`;
}
