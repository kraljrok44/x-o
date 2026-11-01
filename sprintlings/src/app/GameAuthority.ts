import type { RewardedPlacement } from '../config/AdConfig';
import type { AdEligibility, GrantResult, PurchaseResult, RaceSettlement } from '../economy/EconomyService';
import type { LoadoutSlot, PlayerProfile } from '../economy/Profile';
import type { InputLog } from '../game/RaceReplay';
import type { DifficultyChoice, RaceMode, RaceTicket } from '../game/RaceVerifier';

export interface GameAuthority {
  readonly kind: 'local' | 'server';
  readonly storageLabel: string;
  readonly purchasesAvailable: boolean;

  init(): Promise<PlayerProfile>;
  get profile(): PlayerProfile;
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
  acceptTerms(version: string): Promise<void>;

  adEligibility(placement: RewardedPlacement, raceId?: string): AdEligibility;
  grantAdReward(placement: RewardedPlacement, completionToken: string, raceId?: string): Promise<GrantResult>;
  noteInterstitial(): void;

  refresh?(): Promise<void>;
  onlineToken?(): string | null;

  flush(): Promise<void>;
}
