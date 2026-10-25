import { EconomyConfig } from '../config/EconomyConfig';
import { dayKey } from '../shared/time';
import { EconomyError } from '../economy/EconomyError';
import type { PlayerProfile } from '../economy/Profile';

export interface DailyRewardInfo {
  /** Index into the reward cycle for the next claim. */
  index: number;
  reward: (typeof EconomyConfig.daily.cycle)[number];
  available: boolean;
}

/**
 * Login calendar. Each new day (by the authority's clock) one step can be
 * claimed. Missed days never reset progress: the next claim simply
 * continues the cycle.
 */
export function dailyInfo(profile: PlayerProfile, now: number): DailyRewardInfo {
  const cycle = EconomyConfig.daily.cycle;
  const index = profile.daily.claims % cycle.length;
  const available = profile.daily.lastClaimDay !== dayKey(now) && now >= profile.daily.lastClaimAt;
  return { index, reward: cycle[index], available };
}

export function assertDailyClaimable(profile: PlayerProfile, now: number): DailyRewardInfo {
  if (now < profile.daily.lastClaimAt) throw new EconomyError('clock_tampered', 'Your device clock looks wrong. Please fix it and try again.');
  const info = dailyInfo(profile, now);
  if (!info.available) throw new EconomyError('already_claimed', 'Come back tomorrow for the next reward.');
  return info;
}

export function markDailyClaimed(profile: PlayerProfile, now: number): void {
  profile.daily.lastClaimDay = dayKey(now);
  profile.daily.lastClaimAt = now;
  profile.daily.claims++;
}
