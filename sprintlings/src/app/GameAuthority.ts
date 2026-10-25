import type { RewardedPlacement } from '../config/AdConfig';
import type { AdEligibility, GrantResult, PurchaseResult, RaceSettlement } from '../economy/EconomyService';
import type { LoadoutSlot, PlayerProfile } from '../economy/Profile';
import type { InputLog } from '../game/RaceReplay';
import type { DifficultyChoice, RaceMode, RaceTicket } from '../game/RaceVerifier';

/**
 * The source of truth for the player's profile. The client never edits
 * currencies directly: it asks the authority, which applies EconomyService
 * rules and returns the new state.
 *
 *  - LocalAuthority: offline / portal builds. Runs the same rules and race
 *    re-simulation on the device, saves locally (or to the CrazyGames cloud
 *    save). Clearly labelled as a device save in the UI.
 *  - ServerAuthority: web build with our own server (server/). Everything is
 *    validated server side, including purchases.
 */
export interface GameAuthority {
  readonly kind: 'local' | 'server';
  /** Short description of where progress is stored, shown in Profile. */
  readonly storageLabel: string;
  /** Whether real-money purchases can be offered through this authority. */
  readonly purchasesAvailable: boolean;

  init(): Promise<PlayerProfile>;
  get profile(): PlayerProfile;
  /** Authority clock (server time online, guarded device time offline). */
  now(): number;
  onChange(cb: (p: PlayerProfile) => void): () => void;

  startRace(trackId: string, mode: RaceMode, difficulty: DifficultyChoice): Promise<RaceTicket>;
  finishRace(ticket: RaceTicket, log: InputLog): Promise<RaceSettlement>;

  claimQuest(questId: string): Promise<GrantResult>;
  rerollQuest(questId: string): Promise<void>;
  claimAchievement(id: string): Promise<GrantResult>;
  claimDaily(): Promise<GrantResult & { index: number }>;
  claimSeasonTier(tier: number, track: 'free' | 'premium'): Promise<GrantResult>;
  buySeasonPremium(): Promise<void>;
  buyOffer(offerId: string): Promise<PurchaseResult>;
  equip(slot: LoadoutSlot | 'variant' | 'character', id: string | null): Promise<void>;
  setName(name: string): Promise<void>;
  completeTutorial(): Promise<void>;

  adEligibility(placement: RewardedPlacement, raceId?: string): AdEligibility;
  /** Called only after the ad provider confirmed completion. */
  grantAdReward(placement: RewardedPlacement, completionToken: string, raceId?: string): Promise<GrantResult>;
  noteInterstitial(): void;

  /** Ensures pending writes are persisted (page hide). */
  flush(): Promise<void>;
}
