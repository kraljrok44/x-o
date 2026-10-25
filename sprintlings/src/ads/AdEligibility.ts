import { AdConfig } from '../config/AdConfig';
import type { PlayerProfile } from '../economy/Profile';
import { interstitialsDisabled } from '../shop/EntitlementService';

/**
 * Whether an interstitial may be shown at a natural break (never during a
 * race). Our own conservative rules on top of the network's.
 */
export function interstitialAllowed(profile: PlayerProfile, now: number): { allowed: boolean; reason: string } {
  const cfg = AdConfig.interstitial;
  if (interstitialsDisabled(profile)) return { allowed: false, reason: 'ad_free' };
  if (profile.stats.races < cfg.graceRaces) return { allowed: false, reason: 'grace' };
  if (profile.ads.racesSinceInterstitial < cfg.everyRaces) return { allowed: false, reason: 'frequency' };
  if (now - profile.ads.lastInterstitialAt < cfg.minIntervalSec * 1000) return { allowed: false, reason: 'interval' };
  if (now - profile.ads.lastRewardedAt < cfg.skipAfterRewardedSec * 1000) return { allowed: false, reason: 'recent_rewarded' };
  return { allowed: true, reason: 'ok' };
}
