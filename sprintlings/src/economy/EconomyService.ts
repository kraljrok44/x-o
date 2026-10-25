import { AdConfig, type RewardedPlacement, type RewardedPlacementConfig } from '../config/AdConfig';
import { EconomyConfig, type ChestId } from '../config/EconomyConfig';
import { PRODUCT_BY_ID } from '../config/ProductCatalog';
import { CHARACTERS, isCharacterId } from '../player/CharacterDefinition';
import type { Rarity } from '../shop/CosmeticCatalog';
import { BUNDLES, chestPool, cosmeticCoinValue, findOffer } from '../shop/ShopCatalog';
import { grantEntitlement, hasEntitlement, revokeEntitlement } from '../shop/EntitlementService';
import { dayKey } from '../shared/time';
import type { Rng } from '../shared/Rng';
import type { RaceTicket } from '../game/RaceVerifier';
import { ACHIEVEMENTS, assertClaimable, updateAchievements, type AchievementDefinition } from '../progression/AchievementService';
import { assertDailyClaimable, markDailyClaimed } from '../progression/DailyRewardService';
import { applyRaceToQuests, findQuest, refreshQuests, type RaceOutcome } from '../progression/QuestService';
import type { QuestState } from './Profile';
import { assertTierClaimable, premiumEntitlement, seasonAt, syncSeason, tierForPoints, type SeasonReward } from '../progression/SeasonPassService';
import type { LevelReward } from '../progression/LevelProgression';
import { addXp } from '../progression/XPService';
import { EconomyError } from './EconomyError';
import { addCosmetic, ownsCharacter, ownsCosmetic, removeCosmetic } from './InventoryService';
import type { PlayerProfile } from './Profile';
import { calculateRaceReward, type RaceRewardBreakdown } from './RewardCalculator';
import { assertNew, entry, record } from './RewardLedger';
import { credit, debit } from './Wallet';

/**
 * The single place where currencies, items and progress change. Used
 * identically by the local (offline/portal) authority and by the server, so
 * rules can't drift between them. Every operation takes the authority's
 * clock and an event id; repeating an event id is rejected (idempotency).
 */

export interface RaceSettlement {
  raceId: string;
  outcome: RaceOutcome;
  breakdown: RaceRewardBreakdown;
  levelUps: LevelReward[];
  questsCompleted: QuestState[];
  achievements: AchievementDefinition[];
  seasonTierBefore: number;
  seasonTierAfter: number;
  newBest: boolean;
}

export interface GrantResult {
  coins: number;
  gems: number;
  xp: number;
  items: string[];
  /** Duplicate items converted to coins. */
  duplicates: { id: string; coins: number }[];
  levelUps: LevelReward[];
}

function emptyGrant(): GrantResult {
  return { coins: 0, gems: 0, xp: 0, items: [], duplicates: [], levelUps: [] };
}

/** Called whenever the profile is loaded or before any operation. */
export function syncProfile(profile: PlayerProfile, now: number, rng: Rng): { questAutoClaims: QuestState[]; seasonAutoRewards: GrantResult | null } {
  if (now + 5 * 60_000 < profile.lastSeenTime) {
    // Clock moved backwards by more than 5 minutes: keep going, but daily features stay locked (see DailyRewardService).
  } else profile.lastSeenTime = Math.max(profile.lastSeenTime, now);
  const { autoClaimed } = refreshQuests(profile, now);
  for (const q of autoClaimed) {
    applyGrant(profile, { coins: q.reward.coins }, rng);
    addXp(profile, q.reward.xp);
    q.status = 'claimed';
    record(profile, entry({ id: `quest_auto:${q.id}`, type: 'quest_claim', at: now, coins: q.reward.coins, xp: q.reward.xp, reason: `Auto-claimed expired quest: ${q.description}`, ref: q.id }));
  }
  const roll = syncSeason(profile, now);
  let seasonGrant: GrantResult | null = null;
  if (roll.ended) {
    seasonGrant = emptyGrant();
    for (const r of roll.autoRewards) mergeGrant(seasonGrant, applyGrant(profile, r.reward, rng));
    profile.seasonHistory.push({
      seasonId: roll.ended.id,
      points: roll.endedPoints,
      premium: hasEntitlement(profile, premiumEntitlement(roll.ended.id)),
    });
    if (roll.autoRewards.length) {
      record(profile, entry({ id: `season_end:${roll.ended.id}`, type: 'season_claim', at: now, coins: seasonGrant.coins, gems: seasonGrant.gems, items: seasonGrant.items, reason: `Season ${roll.ended.name} ended: unclaimed rewards granted`, ref: roll.ended.id }));
    }
  }
  updateAchievements(profile, now);
  return { questAutoClaims: autoClaimed, seasonAutoRewards: seasonGrant };
}

function mergeGrant(into: GrantResult, g: GrantResult): void {
  into.coins += g.coins;
  into.gems += g.gems;
  into.xp += g.xp;
  into.items.push(...g.items);
  into.duplicates.push(...g.duplicates);
  into.levelUps.push(...g.levelUps);
}

/** Applies a reward bundle (coins, gems, cosmetic, chest). Duplicate cosmetics become coins. */
function applyGrant(profile: PlayerProfile, r: SeasonReward & { xp?: number; cosmetics?: string[] }, rng: Rng): GrantResult {
  const g = emptyGrant();
  if (r.coins) {
    credit(profile, 'coins', r.coins);
    g.coins += r.coins;
  }
  if (r.gems) {
    credit(profile, 'gems', r.gems);
    g.gems += r.gems;
  }
  const items = [...(r.cosmetics ?? []), ...(r.cosmetic ? [r.cosmetic] : [])];
  for (const id of items) {
    if (addCosmetic(profile, id)) g.items.push(id);
    else {
      const refund = Math.max(EconomyConfig.chests.chest_acorn.duplicateRefundMin, Math.floor(cosmeticCoinValue(id) * 0.5));
      credit(profile, 'coins', refund);
      g.coins += refund;
      g.duplicates.push({ id, coins: refund });
    }
  }
  if (r.chest) mergeGrant(g, rollChest(profile, r.chest as ChestId, rng));
  if (r.xp) {
    g.levelUps.push(...addXp(profile, r.xp));
    g.xp += r.xp;
  }
  return g;
}

// --- races ------------------------------------------------------------------------

/**
 * Settles a verified race. `outcome` must come from verifyRace() on the
 * authority, never from the client's own claim.
 */
export function settleRace(profile: PlayerProfile, ticket: RaceTicket, outcome: RaceOutcome, now: number): RaceSettlement {
  const eventId = `race:${ticket.raceId}`;
  assertNew(profile, eventId);
  const breakdown = calculateRaceReward(outcome);
  credit(profile, 'coins', breakdown.coins);
  const levelUps = addXp(profile, breakdown.xp);
  const tierBefore = tierForPoints(profile.season.points);
  if (seasonAt(now)?.id === profile.season.seasonId && profile.season.seasonId) profile.season.points += breakdown.seasonPoints;

  const st = profile.stats;
  st.races++;
  if (outcome.finished) st.finishes++;
  const multi = outcome.racerCount > 1 && outcome.mode !== 'practice';
  if (multi && outcome.finished && outcome.place === 1) st.wins++;
  if (multi && outcome.finished && outcome.place <= 3) {
    st.podiums++;
    st.podiumStreak++;
    st.bestPodiumStreak = Math.max(st.bestPodiumStreak, st.podiumStreak);
  } else if (multi) st.podiumStreak = 0;
  let newBest = false;
  if (outcome.finished && outcome.finishTime !== null) {
    const prev = st.bestTimes[outcome.trackId];
    if (prev === undefined || outcome.finishTime < prev) {
      st.bestTimes[outcome.trackId] = outcome.finishTime;
      newBest = true;
    }
    if (!st.tracksFinished.includes(outcome.trackId)) st.tracksFinished.push(outcome.trackId);
  }
  st.jumps += outcome.stats.jumps;
  st.hurdles += outcome.stats.hurdlesCleared;
  st.abilitiesUsed += outcome.stats.abilitiesUsed;
  st.hitsLanded += outcome.stats.hitsLanded;
  st.shieldBlocks += outcome.stats.shieldBlocks;
  st.glimmers += outcome.stats.glimmers;
  st.falls += outcome.stats.falls;
  st.playSeconds += Math.round(outcome.finishTime ?? 60);
  profile.ads.racesSinceInterstitial++;

  refreshQuests(profile, now);
  const questsCompleted = applyRaceToQuests(profile, outcome, now);
  if (profile.quests.list.length && profile.quests.list.every((q) => q.status !== 'active') && profile.quests.sweptDay !== profile.quests.day) {
    profile.quests.sweptDay = profile.quests.day;
    st.dailyQuestSweeps++;
  }
  const achievements = updateAchievements(profile, now);
  record(profile, entry({ id: eventId, type: 'race_reward', at: now, coins: breakdown.coins, xp: breakdown.xp, reason: `Race ${outcome.trackId}: place ${outcome.place}${outcome.finished ? '' : ' (DNF)'}`, ref: ticket.raceId }));
  return {
    raceId: ticket.raceId,
    outcome,
    breakdown,
    levelUps,
    questsCompleted,
    achievements,
    seasonTierBefore: tierBefore,
    seasonTierAfter: tierForPoints(profile.season.points),
    newBest,
  };
}

// --- claims -----------------------------------------------------------------------

export function claimQuest(profile: PlayerProfile, questId: string, now: number, rng: Rng): GrantResult {
  const eventId = `quest:${questId}`;
  assertNew(profile, eventId);
  const q = findQuest(profile, questId);
  if (q.status === 'claimed') throw new EconomyError('already_claimed', 'Reward already claimed.');
  if (q.status !== 'completed') throw new EconomyError('not_eligible', 'Quest not completed yet.');
  q.status = 'claimed';
  profile.stats.questsCompleted++;
  const g = applyGrant(profile, { coins: q.reward.coins, xp: q.reward.xp }, rng);
  if (seasonAt(now)?.id === profile.season.seasonId && profile.season.seasonId) profile.season.points += q.reward.seasonPoints;
  updateAchievements(profile, now);
  record(profile, entry({ id: eventId, type: 'quest_claim', at: now, coins: g.coins, xp: g.xp, reason: `Quest: ${q.description}`, ref: q.id }));
  return g;
}

export function claimAchievement(profile: PlayerProfile, id: string, now: number, rng: Rng): GrantResult {
  const eventId = `ach:${id}`;
  assertNew(profile, eventId);
  const def = assertClaimable(profile, id);
  profile.achievements[id].claimed = true;
  const g = applyGrant(profile, def.reward, rng);
  updateAchievements(profile, now);
  record(profile, entry({ id: eventId, type: 'achievement_claim', at: now, coins: g.coins, gems: g.gems, xp: g.xp, reason: `Achievement: ${def.name}`, ref: id }));
  return g;
}

export function claimDaily(profile: PlayerProfile, now: number, rng: Rng): GrantResult & { index: number } {
  const info = assertDailyClaimable(profile, now);
  const eventId = `daily:${dayKey(now)}`;
  assertNew(profile, eventId);
  markDailyClaimed(profile, now);
  const g = applyGrant(profile, info.reward, rng);
  record(profile, entry({ id: eventId, type: 'daily_claim', at: now, coins: g.coins, gems: g.gems, items: g.items, reason: `Daily login day ${info.index + 1}`, ref: dayKey(now) }));
  return { ...g, index: info.index };
}

export function claimSeasonTier(profile: PlayerProfile, tier: number, track: 'free' | 'premium', now: number, rng: Rng): GrantResult {
  const eventId = `season:${profile.season.seasonId}:${track}:${tier}`;
  assertNew(profile, eventId);
  const reward = assertTierClaimable(profile, tier, track, now);
  (track === 'free' ? profile.season.claimedFree : profile.season.claimedPremium).push(tier);
  const g = applyGrant(profile, reward, rng);
  record(profile, entry({ id: eventId, type: 'season_claim', at: now, coins: g.coins, gems: g.gems, items: g.items, reason: `Season tier ${tier} (${track})`, ref: profile.season.seasonId }));
  return g;
}

export function buySeasonPremium(profile: PlayerProfile, now: number, eventId: string): void {
  assertNew(profile, eventId);
  const season = seasonAt(now);
  if (!season || season.id !== profile.season.seasonId) throw new EconomyError('not_eligible', 'No active season.');
  const ent = premiumEntitlement(season.id);
  if (hasEntitlement(profile, ent)) throw new EconomyError('already_owned', 'You already own this season’s premium track.');
  debit(profile, 'gems', EconomyConfig.season.premiumPriceGems);
  grantEntitlement(profile, ent);
  record(profile, entry({ id: eventId, type: 'shop_purchase', at: now, gems: -EconomyConfig.season.premiumPriceGems, reason: `Premium track: ${season.name}`, ref: ent }));
}

// --- shop -------------------------------------------------------------------------

export function bundlePrice(profile: PlayerProfile, bundleId: string): number {
  const b = BUNDLES.find((x) => x.id === bundleId);
  if (!b) throw new EconomyError('not_found', 'Bundle not found.');
  const owned = b.items.filter((i) => ownsCosmetic(profile, i)).length;
  if (!EconomyConfig.shop.bundleOwnedDiscount || owned === 0) return b.price.amount;
  return Math.max(1, Math.round(b.price.amount * (1 - owned / b.items.length)));
}

export interface PurchaseResult extends GrantResult {
  offerId: string;
  spent: { currency: 'coins' | 'gems'; amount: number };
  chestRarity?: Rarity;
}

/** Buys a shop offer with Coins or Gems after explicit player confirmation. */
export function buyOffer(profile: PlayerProfile, offerId: string, now: number, eventId: string, rng: Rng): PurchaseResult {
  assertNew(profile, eventId);
  const offer = findOffer(offerId, now);
  if (!offer) throw new EconomyError('not_found', 'This item is not on sale right now.');
  if (offer.requiresLevel && profile.level < offer.requiresLevel) throw new EconomyError('locked', `Reach level ${offer.requiresLevel} to buy this.`);
  let price = offer.price.amount;
  let result: GrantResult;
  if (offer.kind === 'cosmetic') {
    if (ownsCosmetic(profile, offer.id)) throw new EconomyError('already_owned', 'You already own this item.');
    debit(profile, offer.price.currency, price);
    result = emptyGrant();
    addCosmetic(profile, offer.id);
    result.items.push(offer.id);
  } else if (offer.kind === 'character') {
    const cid = offer.characterId!;
    if (!isCharacterId(cid) || !CHARACTERS[cid]) throw new EconomyError('not_found', 'Unknown character.');
    if (ownsCharacter(profile, cid)) throw new EconomyError('already_owned', 'You already have this character.');
    debit(profile, offer.price.currency, price);
    profile.characters.push(cid);
    result = emptyGrant();
    result.items.push(offer.id);
  } else if (offer.kind === 'bundle') {
    price = bundlePrice(profile, offer.id);
    if (offer.items!.every((i) => ownsCosmetic(profile, i))) throw new EconomyError('already_owned', 'You already own everything in this bundle.');
    debit(profile, offer.price.currency, price);
    result = emptyGrant();
    for (const i of offer.items!) if (addCosmetic(profile, i)) result.items.push(i);
  } else {
    debit(profile, offer.price.currency, price);
    result = rollChest(profile, offer.id as ChestId, rng);
  }
  updateAchievements(profile, now);
  record(
    profile,
    entry({
      id: eventId,
      type: offer.kind === 'chest' ? 'chest_open' : 'shop_purchase',
      at: now,
      coins: (offer.price.currency === 'coins' ? -price : 0) + result.coins,
      gems: offer.price.currency === 'gems' ? -price : 0,
      items: result.items,
      reason: `Bought ${offer.name}`,
      ref: offer.id,
    }),
  );
  return { ...result, offerId: offer.id, spent: { currency: offer.price.currency, amount: price } };
}

/** Rolls a chest with the published odds. Duplicates are converted to Coins. */
export function rollChest(profile: PlayerProfile, chestId: ChestId, rng: Rng): GrantResult & { rarity?: Rarity } {
  const chest = EconomyConfig.chests[chestId];
  if (!chest) throw new EconomyError('not_found', 'Unknown chest.');
  const rarity = rng.weighted(chest.odds) as Rarity;
  const order: Rarity[] = ['legendary', 'epic', 'rare', 'common'];
  const pool = chestPool(chestId);
  let candidates = pool.filter((c) => c.rarity === rarity);
  for (let i = order.indexOf(rarity) + 1; candidates.length === 0 && i < order.length; i++) candidates = pool.filter((c) => c.rarity === order[i]);
  const item = rng.pick(candidates);
  const g = emptyGrant();
  if (addCosmetic(profile, item.id)) g.items.push(item.id);
  else {
    const refund = Math.max(chest.duplicateRefundMin, Math.floor(cosmeticCoinValue(item.id) * chest.duplicateRefundShare));
    credit(profile, 'coins', refund);
    g.coins += refund;
    g.duplicates.push({ id: item.id, coins: refund });
  }
  return { ...g, rarity: item.rarity };
}

// --- ads --------------------------------------------------------------------------

export interface AdEligibility {
  allowed: boolean;
  reason?: string;
  remainingToday: number;
}

export function rewardedEligibility(profile: PlayerProfile, placement: RewardedPlacement, now: number, raceId?: string): AdEligibility {
  resetAdDay(profile, now);
  const cfg = AdConfig.rewarded[placement];
  const used = profile.ads.perPlacement[placement] ?? 0;
  const remaining = Math.max(0, Math.min(cfg.maxPerDay - used, AdConfig.rewardedDailyCap - profile.ads.rewardedToday));
  if (remaining <= 0) return { allowed: false, reason: 'Daily limit reached. Come back tomorrow!', remainingToday: 0 };
  if (now - profile.ads.lastRewardedAt < AdConfig.rewardedMinIntervalSec * 1000) return { allowed: false, reason: 'Please wait a moment before the next video.', remainingToday: remaining };
  if (placement === 'event_bonus' && !seasonAt(now)) return { allowed: false, reason: 'No active event.', remainingToday: remaining };
  if ('perRace' in cfg && cfg.perRace) {
    if (!raceId) return { allowed: false, reason: 'No race to boost.', remainingToday: remaining };
    if (profile.ads.rewardedRaceIds.includes(raceId)) return { allowed: false, reason: 'Already boosted this race.', remainingToday: remaining };
    if (!profile.processedEvents.includes(`race:${raceId}`)) return { allowed: false, reason: 'Race not settled.', remainingToday: remaining };
  }
  if (placement === 'daily_bonus' && (profile.ads.perPlacement[placement] ?? 0) > 0) return { allowed: false, reason: 'Already claimed today.', remainingToday: 0 };
  return { allowed: true, remainingToday: remaining };
}

function resetAdDay(profile: PlayerProfile, now: number): void {
  const d = dayKey(now);
  if (profile.ads.day !== d) {
    profile.ads.day = d;
    profile.ads.rewardedToday = 0;
    profile.ads.perPlacement = {};
  }
}

/**
 * Grants a rewarded-ad payout. Call only after the ad provider confirmed the
 * ad was watched to completion (and, where possible, the server verified it).
 */
export function grantAdReward(profile: PlayerProfile, placement: RewardedPlacement, now: number, eventId: string, raceId?: string): GrantResult {
  assertNew(profile, eventId);
  const el = rewardedEligibility(profile, placement, now, raceId);
  if (!el.allowed) throw new EconomyError('limit_reached', el.reason ?? 'Not available.');
  const cfg: RewardedPlacementConfig = AdConfig.rewarded[placement];
  const g = emptyGrant();
  if (cfg.reward.coins) {
    credit(profile, 'coins', cfg.reward.coins);
    g.coins = cfg.reward.coins;
  }
  if (cfg.reward.seasonPoints && profile.season.seasonId) profile.season.points += cfg.reward.seasonPoints;
  profile.ads.rewardedToday++;
  profile.ads.perPlacement[placement] = (profile.ads.perPlacement[placement] ?? 0) + 1;
  profile.ads.lastRewardedAt = now;
  if (raceId) {
    profile.ads.rewardedRaceIds.push(raceId);
    if (profile.ads.rewardedRaceIds.length > 50) profile.ads.rewardedRaceIds.shift();
  }
  record(profile, entry({ id: eventId, type: 'ad_reward', at: now, coins: g.coins, reason: `Rewarded ad: ${cfg.title}`, ref: raceId ?? placement }));
  return g;
}

// --- real-money products (server side in production) ------------------------------

/**
 * Grants a verified purchase. `txId` is the payment provider's transaction
 * id, so a duplicated webhook or callback can never grant twice.
 */
export function grantProduct(profile: PlayerProfile, productId: string, txId: string, now: number, rng: Rng): GrantResult {
  const eventId = `iap:${txId}`;
  assertNew(profile, eventId);
  const p = PRODUCT_BY_ID[productId];
  if (!p) throw new EconomyError('not_found', 'Unknown product.');
  if (p.kind === 'permanent' && p.grants.entitlements?.every((e) => hasEntitlement(profile, e))) {
    throw new EconomyError('already_owned', 'Already owned.');
  }
  const g = applyGrant(profile, { gems: p.grants.gems, cosmetics: p.grants.cosmetics }, rng);
  for (const e of p.grants.entitlements ?? []) grantEntitlement(profile, e);
  record(profile, entry({ id: eventId, type: 'iap_grant', at: now, gems: g.gems, items: g.items, reason: `Purchase: ${p.name}`, ref: txId }));
  return g;
}

/** Reverses a refunded purchase as far as possible (currency can go to zero, never below). */
export function revokeProduct(profile: PlayerProfile, productId: string, txId: string, now: number): void {
  const eventId = `iap_refund:${txId}`;
  assertNew(profile, eventId);
  if (!profile.processedEvents.includes(`iap:${txId}`)) throw new EconomyError('not_found', 'Original purchase not found.');
  const p = PRODUCT_BY_ID[productId];
  if (!p) throw new EconomyError('not_found', 'Unknown product.');
  const gems = Math.min(profile.wallet.gems, p.grants.gems ?? 0);
  profile.wallet.gems -= gems;
  for (const c of p.grants.cosmetics ?? []) removeCosmetic(profile, c);
  for (const e of p.grants.entitlements ?? []) revokeEntitlement(profile, e);
  record(profile, entry({ id: eventId, type: 'iap_refund', at: now, gems: -gems, items: p.grants.cosmetics ?? [], reason: `Refund: ${p.name}`, ref: txId }));
}

export function claimableCounts(profile: PlayerProfile, now: number): { quests: number; achievements: number; daily: boolean; season: number } {
  const season = seasonAt(now);
  let seasonClaims = 0;
  if (season && season.id === profile.season.seasonId) {
    const reached = tierForPoints(profile.season.points);
    const premium = hasEntitlement(profile, premiumEntitlement(season.id));
    for (let t = 1; t <= reached; t++) {
      if (!profile.season.claimedFree.includes(t)) seasonClaims++;
      if (premium && !profile.season.claimedPremium.includes(t)) seasonClaims++;
    }
  }
  return {
    quests: profile.quests.list.filter((q) => q.status === 'completed').length,
    achievements: ACHIEVEMENTS.filter((a) => profile.achievements[a.id]?.completedAt && !profile.achievements[a.id].claimed).length,
    daily: profile.daily.lastClaimDay !== dayKey(now) && now >= profile.daily.lastClaimAt,
    season: seasonClaims,
  };
}
