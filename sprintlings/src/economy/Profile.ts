import { EconomyConfig } from '../config/EconomyConfig';
import type { CharacterId } from '../player/CharacterDefinition';
import { STARTER_COSMETICS } from '../shop/CosmeticCatalog';

export const PROFILE_SCHEMA_VERSION = 2;

/** Equippable cosmetic slots (outfit = full suit, hand = held prop, mount = ride; all purely visual). */
export const LOADOUT_SLOTS = ['hat', 'eyes', 'back', 'trail', 'emote', 'outfit', 'hand', 'mount'] as const;
export type LoadoutSlot = (typeof LOADOUT_SLOTS)[number];

export interface LedgerEntry {
  /** Unique economic event id (idempotency key). */
  id: string;
  type:
    | 'race_reward'
    | 'quest_claim'
    | 'achievement_claim'
    | 'daily_claim'
    | 'level_reward'
    | 'season_claim'
    | 'ad_reward'
    | 'shop_purchase'
    | 'chest_open'
    | 'iap_grant'
    | 'iap_refund'
    | 'admin';
  /** Server time when it happened. */
  at: number;
  coins: number;
  gems: number;
  xp: number;
  items: string[];
  reason: string;
  /** Link to a transaction, race or reward id. */
  ref: string;
}

export interface QuestState {
  id: string;
  templateId: string;
  description: string;
  target: number;
  progress: number;
  reward: { coins: number; xp: number; seasonPoints: number };
  startsAt: number;
  expiresAt: number;
  status: 'active' | 'completed' | 'claimed';
}

export interface AchievementState {
  progress: number;
  completedAt: number | null;
  claimed: boolean;
}

export interface ProfileStats {
  races: number;
  finishes: number;
  wins: number;
  podiums: number;
  podiumStreak: number;
  bestPodiumStreak: number;
  bestTimes: Record<string, number>;
  tracksFinished: string[];
  jumps: number;
  hurdles: number;
  abilitiesUsed: number;
  hitsLanded: number;
  shieldBlocks: number;
  glimmers: number;
  falls: number;
  questsCompleted: number;
  dailyQuestSweeps: number;
  itemsUnlocked: number;
  playSeconds: number;
}

export interface PlayerProfile {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  wallet: { coins: number; gems: number };
  xp: number;
  level: number;
  /** Owned cosmetic ids. */
  inventory: string[];
  characters: CharacterId[];
  loadout: Record<LoadoutSlot, string | null> & { characterId: CharacterId; variants: Partial<Record<CharacterId, string | null>> };
  /** Permanent rights: 'ad_free', 'season_1_premium', 'starter_pack', ... */
  entitlements: string[];
  stats: ProfileStats;
  quests: { day: string; list: QuestState[]; rerollsUsed: number; sweptDay: string | null };
  achievements: Record<string, AchievementState>;
  daily: { lastClaimDay: string | null; claims: number; lastClaimAt: number };
  season: { seasonId: string; points: number; claimedFree: number[]; claimedPremium: number[] };
  /** Archive of finished seasons (rights and items stay in inventory/entitlements). */
  seasonHistory: { seasonId: string; points: number; premium: boolean }[];
  ads: {
    day: string;
    rewardedToday: number;
    perPlacement: Record<string, number>;
    lastRewardedAt: number;
    lastInterstitialAt: number;
    racesSinceInterstitial: number;
    rewardedRaceIds: string[];
  };
  /** Recently processed event ids, for idempotency (bounded). */
  processedEvents: string[];
  /** Recent audit log (the server keeps the full one). */
  ledger: LedgerEntry[];
  /** Highest server/clock time seen, to detect clocks moved backwards. */
  lastSeenTime: number;
  tutorialDone: boolean;
  /** Ranked ladder (see progression/LeagueService). */
  trophies: number;
  bestTrophies: number;
  /** XP earned per animal, for Animal Levels. */
  animalXp: Partial<Record<CharacterId, number>>;
}

export function emptyStats(): ProfileStats {
  return {
    races: 0,
    finishes: 0,
    wins: 0,
    podiums: 0,
    podiumStreak: 0,
    bestPodiumStreak: 0,
    bestTimes: {},
    tracksFinished: [],
    jumps: 0,
    hurdles: 0,
    abilitiesUsed: 0,
    hitsLanded: 0,
    shieldBlocks: 0,
    glimmers: 0,
    falls: 0,
    questsCompleted: 0,
    dailyQuestSweeps: 0,
    itemsUnlocked: 0,
    playSeconds: 0,
  };
}

export function createProfile(id: string, now: number, name = 'Sprinter'): PlayerProfile {
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    id,
    name,
    createdAt: now,
    updatedAt: now,
    wallet: { ...EconomyConfig.startingWallet },
    xp: 0,
    level: 1,
    inventory: [...STARTER_COSMETICS],
    characters: ['moss', 'kip'],
    loadout: { characterId: 'moss', variants: {}, hat: 'hat_leaf', eyes: null, back: null, trail: 'trail_dust', emote: 'emote_wave', outfit: null, hand: null, mount: null },
    entitlements: [],
    stats: emptyStats(),
    quests: { day: '', list: [], rerollsUsed: 0, sweptDay: null },
    achievements: {},
    daily: { lastClaimDay: null, claims: 0, lastClaimAt: 0 },
    season: { seasonId: '', points: 0, claimedFree: [], claimedPremium: [] },
    seasonHistory: [],
    ads: { day: '', rewardedToday: 0, perPlacement: {}, lastRewardedAt: 0, lastInterstitialAt: 0, racesSinceInterstitial: 0, rewardedRaceIds: [] },
    processedEvents: [],
    ledger: [],
    lastSeenTime: now,
    tutorialDone: false,
    trophies: 0,
    bestTrophies: 0,
    animalXp: {},
  };
}

/** Deep copy (profiles are plain JSON). */
export function cloneProfile(p: PlayerProfile): PlayerProfile {
  return JSON.parse(JSON.stringify(p)) as PlayerProfile;
}
