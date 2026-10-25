import { EconomyConfig } from '../config/EconomyConfig';
import { EconomyError } from '../economy/EconomyError';
import type { PlayerProfile } from '../economy/Profile';

export interface SeasonReward {
  coins?: number;
  gems?: number;
  cosmetic?: string;
  chest?: string;
}

export interface SeasonTier {
  tier: number;
  free: SeasonReward;
  premium: SeasonReward;
}

export interface SeasonDefinition {
  id: string;
  name: string;
  /** ISO dates, inclusive start, exclusive end (UTC). */
  start: string;
  end: string;
  tiers: SeasonTier[];
  /** What happens at the end: unclaimed reached rewards are granted, progress is archived. */
  endRule: string;
}

function tiers(special: Record<number, { free?: SeasonReward; premium?: SeasonReward }>): SeasonTier[] {
  const out: SeasonTier[] = [];
  for (let t = 1; t <= 30; t++) {
    const free: SeasonReward = t % 5 === 0 ? { chest: 'chest_acorn' } : { coins: 40 + t * 4 };
    const premium: SeasonReward = t % 3 === 0 ? { gems: 30 } : { coins: 80 + t * 6 };
    out.push({ tier: t, free: special[t]?.free ?? free, premium: special[t]?.premium ?? premium });
  }
  return out;
}

export const SEASONS: SeasonDefinition[] = [
  {
    id: 'season_1',
    name: 'Harvest Hoopla',
    start: '2026-10-01',
    end: '2027-01-01',
    endRule: 'Reached but unclaimed tiers are granted automatically when the season ends; items and the premium right are kept forever.',
    tiers: tiers({
      4: { premium: { cosmetic: 'eyes_harvest' } },
      8: { free: { cosmetic: 'back_harvest' } },
      12: { premium: { cosmetic: 'trail_harvest' } },
      15: { free: { cosmetic: 'hat_pumpkin' } },
      20: { premium: { cosmetic: 'emote_harvest' } },
      25: { free: { gems: 25 } },
      30: { free: { coins: 500 }, premium: { gems: 150 } },
    }),
  },
  {
    id: 'season_2',
    name: 'Frostfall Frolic',
    start: '2027-01-01',
    end: '2027-04-01',
    endRule: 'Same as season 1.',
    tiers: tiers({}),
  },
];

export function seasonAt(now: number): SeasonDefinition | null {
  return SEASONS.find((s) => now >= Date.parse(s.start) && now < Date.parse(s.end)) ?? null;
}

export function premiumEntitlement(seasonId: string): string {
  return `${seasonId}_premium`;
}

export function tierForPoints(points: number): number {
  return Math.min(30, Math.floor(points / EconomyConfig.season.pointsPerTier));
}

export interface SeasonRollover {
  ended: SeasonDefinition | null;
  /** Season points the profile had in the season that ended. */
  endedPoints: number;
  /** Rewards granted automatically for the season that ended. */
  autoRewards: { tier: number; track: 'free' | 'premium'; reward: SeasonReward }[];
}

/**
 * Moves the profile into the current season. If the previous season ended,
 * its reached-but-unclaimed rewards are returned for automatic granting.
 */
export function syncSeason(profile: PlayerProfile, now: number): SeasonRollover {
  const current = seasonAt(now);
  const st = profile.season;
  const result: SeasonRollover = { ended: null, endedPoints: 0, autoRewards: [] };
  if (st.seasonId && (!current || current.id !== st.seasonId)) {
    const old = SEASONS.find((s) => s.id === st.seasonId) ?? null;
    if (old) {
      const reached = tierForPoints(st.points);
      const premium = profile.entitlements.includes(premiumEntitlement(old.id));
      for (const t of old.tiers) {
        if (t.tier > reached) break;
        if (!st.claimedFree.includes(t.tier)) result.autoRewards.push({ tier: t.tier, track: 'free', reward: t.free });
        if (premium && !st.claimedPremium.includes(t.tier)) result.autoRewards.push({ tier: t.tier, track: 'premium', reward: t.premium });
      }
      result.ended = old;
      result.endedPoints = st.points;
    }
    profile.season = { seasonId: current?.id ?? '', points: 0, claimedFree: [], claimedPremium: [] };
  } else if (!st.seasonId && current) {
    profile.season = { seasonId: current.id, points: 0, claimedFree: [], claimedPremium: [] };
  }
  return result;
}

export function assertTierClaimable(profile: PlayerProfile, tier: number, track: 'free' | 'premium', now: number): SeasonReward {
  const season = seasonAt(now);
  if (!season || season.id !== profile.season.seasonId) throw new EconomyError('not_eligible', 'No active season.');
  const t = season.tiers.find((x) => x.tier === tier);
  if (!t) throw new EconomyError('not_found', 'Tier not found.');
  if (tierForPoints(profile.season.points) < tier) throw new EconomyError('locked', 'Tier not reached yet.');
  if (track === 'premium' && !profile.entitlements.includes(premiumEntitlement(season.id))) {
    throw new EconomyError('locked', 'Premium track not unlocked.');
  }
  const claimed = track === 'free' ? profile.season.claimedFree : profile.season.claimedPremium;
  if (claimed.includes(tier)) throw new EconomyError('already_claimed', 'Already claimed.');
  return track === 'free' ? t.free : t.premium;
}
