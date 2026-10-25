import { describe, expect, it } from 'vitest';
import { createProfile, type PlayerProfile } from '../../src/economy/Profile';
import {
  buyOffer,
  buySeasonPremium,
  claimAchievement,
  claimDaily,
  claimQuest,
  claimSeasonTier,
  grantAdReward,
  grantProduct,
  revokeProduct,
  rewardedEligibility,
  rollChest,
  settleRace,
  syncProfile,
  bundlePrice,
} from '../../src/economy/EconomyService';
import { calculateRaceReward } from '../../src/economy/RewardCalculator';
import { EconomyError } from '../../src/economy/EconomyError';
import { emptyStats } from '../../src/game/RaceState';
import type { RaceOutcome } from '../../src/progression/QuestService';
import type { RaceTicket } from '../../src/game/RaceVerifier';
import { Rng } from '../../src/shared/Rng';
import { DAY_MS } from '../../src/shared/time';
import { EconomyConfig } from '../../src/config/EconomyConfig';
import { levelForXp } from '../../src/progression/LevelProgression';

const NOW = Date.parse('2026-10-25T12:00:00Z');
const rng = () => new Rng(42);

function fresh(): PlayerProfile {
  const p = createProfile('p1', NOW);
  syncProfile(p, NOW, rng());
  return p;
}

function outcome(place: number, finished = true, extra: Partial<RaceOutcome['stats']> = {}): RaceOutcome {
  return { raceId: `r${Math.random()}`, trackId: 'mossy_hollow', mode: 'race', place, racerCount: 4, finished, finishTime: finished ? 44.2 : null, stats: { ...emptyStats(), ...extra } };
}

function ticket(id: string): RaceTicket {
  return { raceId: id, trackId: 'mossy_hollow', seed: 1, mode: 'race', racers: [], issuedAt: NOW };
}

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof EconomyError) return e.code;
    throw e;
  }
  return 'ok';
}

describe('race rewards', () => {
  it('pays base + place bonus and the configured XP', () => {
    const first = calculateRaceReward(outcome(1));
    expect(first.coins).toBe(25 + 20);
    expect(first.xp).toBe(5 + 3);
    expect(calculateRaceReward(outcome(2)).coins).toBe(25 + 12);
    expect(calculateRaceReward(outcome(3)).coins).toBe(25 + 6);
  });

  it('last place still earns progress', () => {
    const last = calculateRaceReward(outcome(4));
    expect(last.coins).toBe(25);
    expect(last.xp).toBe(5);
    const dnf = calculateRaceReward(outcome(4, false));
    expect(dnf.coins).toBeGreaterThan(0);
  });

  it('glimmer coins are capped', () => {
    expect(calculateRaceReward(outcome(4, true, { glimmers: 1000 })).coins).toBe(25 + EconomyConfig.race.glimmerCoinCap);
  });

  it('a race can only be settled once', () => {
    const p = fresh();
    const before = p.wallet.coins;
    settleRace(p, ticket('race_a'), outcome(1), NOW);
    expect(p.wallet.coins).toBe(before + 45);
    expect(code(() => settleRace(p, ticket('race_a'), outcome(1), NOW))).toBe('duplicate_event');
    expect(p.wallet.coins).toBe(before + 45);
    expect(p.ledger.at(-1)?.type).toBe('race_reward');
  });

  it('levels up with rewards and unlocks characters by level', () => {
    const p = fresh();
    for (let i = 0; i < 30; i++) settleRace(p, ticket(`lvl_${i}`), outcome(1), NOW);
    expect(p.level).toBe(levelForXp(p.xp));
    expect(p.level).toBeGreaterThanOrEqual(5);
    expect(p.characters).toContain('pebble');
    expect(p.characters).toContain('lumi');
  });
});

describe('quests', () => {
  it('creates three quests per day and progresses them from races', () => {
    const p = fresh();
    expect(p.quests.list).toHaveLength(3);
    const q = p.quests.list[0];
    q.templateId = 'q_finish';
    q.target = 2;
    settleRace(p, ticket('q1'), outcome(4), NOW);
    expect(q.progress).toBe(1);
    expect(code(() => claimQuest(p, q.id, NOW, rng()))).toBe('not_eligible');
    settleRace(p, ticket('q2'), outcome(4), NOW);
    expect(q.status).toBe('completed');
    const before = p.wallet.coins;
    const g = claimQuest(p, q.id, NOW, rng());
    expect(g.coins).toBe(q.reward.coins);
    // Quest XP may also trigger a level-up reward on top.
    const levelCoins = g.levelUps.reduce((n, l) => n + l.coins, 0);
    expect(p.wallet.coins).toBe(before + q.reward.coins + levelCoins);
    expect(code(() => claimQuest(p, q.id, NOW, rng()))).not.toBe('ok');
  });

  it('auto-pays completed quests when the day rolls over', () => {
    const p = fresh();
    const q = p.quests.list[0];
    q.status = 'completed';
    const before = p.wallet.coins;
    syncProfile(p, NOW + DAY_MS, rng());
    expect(p.wallet.coins).toBe(before + q.reward.coins);
    expect(p.quests.list.every((x) => x.status === 'active')).toBe(true);
  });
});

describe('daily login', () => {
  it('can be claimed once per day and never resets after missed days', () => {
    const p = fresh();
    const r1 = claimDaily(p, NOW, rng());
    expect(r1.index).toBe(0);
    expect(code(() => claimDaily(p, NOW + 1000, rng()))).toBe('already_claimed');
    const r2 = claimDaily(p, NOW + 5 * DAY_MS, rng());
    expect(r2.index).toBe(1);
  });

  it('rejects a clock moved backwards', () => {
    const p = fresh();
    claimDaily(p, NOW, rng());
    expect(code(() => claimDaily(p, NOW - 3 * DAY_MS, rng()))).toBe('clock_tampered');
  });
});

describe('achievements', () => {
  it('completes and pays once', () => {
    const p = fresh();
    settleRace(p, ticket('a1'), outcome(1), NOW);
    expect(p.achievements.ach_first_finish.completedAt).not.toBeNull();
    const before = p.wallet.gems;
    claimAchievement(p, 'ach_first_win', NOW, rng());
    expect(p.wallet.gems).toBe(before + 10);
    expect(code(() => claimAchievement(p, 'ach_first_win', NOW, rng()))).not.toBe('ok');
    expect(code(() => claimAchievement(p, 'ach_level_20', NOW, rng()))).toBe('not_eligible');
  });
});

describe('shop', () => {
  it('buys a cosmetic with coins and prevents buying it twice', () => {
    const p = fresh();
    p.wallet.coins = 1000;
    const r = buyOffer(p, 'hat_acorn', NOW, 'buy1', rng());
    expect(r.spent).toEqual({ currency: 'coins', amount: 150 });
    expect(p.inventory).toContain('hat_acorn');
    expect(code(() => buyOffer(p, 'hat_acorn', NOW, 'buy2', rng()))).toBe('already_owned');
    expect(code(() => buyOffer(p, 'hat_party', NOW, 'buy1', rng()))).toBe('duplicate_event');
  });

  it('refuses when funds are missing without changing anything', () => {
    const p = fresh();
    p.wallet.coins = 10;
    expect(code(() => buyOffer(p, 'hat_tophat', NOW, 'b', rng()))).toBe('insufficient_funds');
    expect(p.wallet.coins).toBe(10);
    expect(p.inventory).not.toContain('hat_tophat');
  });

  it('respects level requirements and sells characters for coins', () => {
    const p = fresh();
    p.wallet.coins = 5000;
    expect(code(() => buyOffer(p, 'hat_horns', NOW, 'b1', rng()))).toBe('locked');
    buyOffer(p, 'char_pebble', NOW, 'b2', rng());
    expect(p.characters).toContain('pebble');
  });

  it('discounts bundles by already owned items', () => {
    const p = fresh();
    const full = bundlePrice(p, 'bundle_explorer');
    p.inventory.push('hat_acorn');
    expect(bundlePrice(p, 'bundle_explorer')).toBeLessThan(full);
  });

  it('chests always give an item or a disclosed duplicate refund', () => {
    const p = fresh();
    for (let i = 0; i < 60; i++) {
      const r = rollChest(p, 'chest_acorn', new Rng(i));
      expect(r.items.length + r.duplicates.length).toBe(1);
      for (const d of r.duplicates) expect(d.coins).toBeGreaterThanOrEqual(EconomyConfig.chests.chest_acorn.duplicateRefundMin);
    }
  });
});

describe('season pass', () => {
  it('free tiers unlock by points, premium needs the entitlement', () => {
    const p = fresh();
    expect(p.season.seasonId).toBe('season_1');
    expect(code(() => claimSeasonTier(p, 1, 'free', NOW, rng()))).toBe('locked');
    p.season.points = 250;
    claimSeasonTier(p, 1, 'free', NOW, rng());
    expect(code(() => claimSeasonTier(p, 1, 'free', NOW, rng()))).not.toBe('ok');
    expect(code(() => claimSeasonTier(p, 1, 'premium', NOW, rng()))).toBe('locked');
    p.wallet.gems = 1000;
    buySeasonPremium(p, NOW, 'sp1');
    claimSeasonTier(p, 1, 'premium', NOW, rng());
    claimSeasonTier(p, 2, 'premium', NOW, rng());
    expect(p.entitlements).toContain('season_1_premium');
  });

  it('grants unclaimed reached tiers when the season ends and keeps rights', () => {
    const p = fresh();
    p.season.points = 1600;
    const before = p.inventory.length;
    syncProfile(p, Date.parse('2027-01-02T00:00:00Z'), rng());
    expect(p.season.seasonId).toBe('season_2');
    expect(p.inventory).toContain('back_harvest');
    expect(p.inventory).toContain('hat_pumpkin');
    expect(p.inventory.length).toBeGreaterThan(before);
    expect(p.seasonHistory[0]).toMatchObject({ seasonId: 'season_1', points: 1600 });
  });
});

describe('rewarded ads', () => {
  it('enforces per-race, per-day and interval limits', () => {
    const p = fresh();
    settleRace(p, ticket('ad_r1'), outcome(2), NOW);
    expect(rewardedEligibility(p, 'post_race_bonus', NOW, 'ad_r1').allowed).toBe(true);
    grantAdReward(p, 'post_race_bonus', NOW, 'ad1', 'ad_r1');
    expect(rewardedEligibility(p, 'post_race_bonus', NOW + 60_000, 'ad_r1').allowed).toBe(false);
    expect(code(() => grantAdReward(p, 'free_coins', NOW + 1000, 'ad2'))).toBe('limit_reached');
    grantAdReward(p, 'free_coins', NOW + 60_000, 'ad3');
    grantAdReward(p, 'daily_bonus', NOW + 120_000, 'ad4');
    // Daily cap of 3 reached.
    expect(rewardedEligibility(p, 'free_coins', NOW + 200_000).allowed).toBe(false);
    // Next day resets.
    expect(rewardedEligibility(p, 'free_coins', NOW + DAY_MS).allowed).toBe(true);
  });

  it('a reward token can never pay twice', () => {
    const p = fresh();
    grantAdReward(p, 'free_coins', NOW, 'same');
    expect(code(() => grantAdReward(p, 'free_coins', NOW + 100_000, 'same'))).toBe('duplicate_event');
  });

  it('rejects boosting a race that was never settled', () => {
    const p = fresh();
    expect(rewardedEligibility(p, 'post_race_bonus', NOW, 'ghost').allowed).toBe(false);
  });
});

describe('real-money grants', () => {
  it('are idempotent per transaction and reversible on refund', () => {
    const p = fresh();
    grantProduct(p, 'gems_500', 'tx_1', NOW, rng());
    expect(p.wallet.gems).toBe(500);
    expect(code(() => grantProduct(p, 'gems_500', 'tx_1', NOW, rng()))).toBe('duplicate_event');
    expect(p.wallet.gems).toBe(500);
    revokeProduct(p, 'gems_500', 'tx_1', NOW);
    expect(p.wallet.gems).toBe(0);
    expect(code(() => revokeProduct(p, 'gems_500', 'tx_1', NOW))).toBe('duplicate_event');
  });

  it('permanent products grant entitlements once', () => {
    const p = fresh();
    grantProduct(p, 'ad_free', 'tx_a', NOW, rng());
    expect(p.entitlements).toContain('ad_free');
    expect(code(() => grantProduct(p, 'ad_free', 'tx_b', NOW, rng()))).toBe('already_owned');
  });
});
