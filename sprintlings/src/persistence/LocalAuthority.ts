import type { GameAuthority } from '../app/GameAuthority';
import type { RewardedPlacement } from '../config/AdConfig';
import {
  buyOffer,
  buySeasonPremium,
  claimAchievement,
  claimDaily,
  claimQuest,
  claimSeasonTier,
  grantAdReward,
  rewardedEligibility,
  settleRace,
  syncProfile,
  type AdEligibility,
} from '../economy/EconomyService';
import { EconomyError } from '../economy/EconomyError';
import { equip } from '../economy/InventoryService';
import { cloneProfile, createProfile, type LoadoutSlot, type PlayerProfile } from '../economy/Profile';
import { rerollQuest } from '../progression/QuestService';
import type { InputLog } from '../game/RaceReplay';
import { createTicket, verifyRace, type DifficultyChoice, type RaceMode, type RaceTicket } from '../game/RaceVerifier';
import { newId } from '../shared/ids';
import { Rng, hashString } from '../shared/Rng';
import { visibleLoadout } from '../economy/InventoryService';
import type { ProfileRepository } from './ProfileRepository';

/**
 * Offline / portal authority. Applies exactly the same EconomyService rules
 * and re-simulates every race from its ticket before paying out, but it runs
 * on the player's device, so it is not tamper-proof; purchases are therefore
 * never offered through it.
 */
export class LocalAuthority implements GameAuthority {
  readonly kind = 'local' as const;
  readonly purchasesAvailable = false;
  private p!: PlayerProfile;
  private readonly listeners = new Set<(p: PlayerProfile) => void>();
  private readonly tickets = new Map<string, RaceTicket>();
  private lastNow = 0;

  constructor(
    private readonly repo: ProfileRepository,
    readonly storageLabel: string,
  ) {}

  async init(): Promise<PlayerProfile> {
    const now = this.now();
    const loaded = await this.repo.load(now);
    this.p = loaded ?? createProfile(newId('local'), now);
    syncProfile(this.p, now, this.rng('sync'));
    await this.repo.saveNow(this.p);
    return this.p;
  }

  get profile(): PlayerProfile {
    return this.p;
  }

  /** Device clock, never allowed to run backwards within a session. */
  now(): number {
    this.lastNow = Math.max(this.lastNow, Date.now());
    return this.lastNow;
  }

  onChange(cb: (p: PlayerProfile) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private rng(salt: string): Rng {
    return new Rng(hashString(`${salt}:${Math.random()}:${Date.now()}`));
  }

  /** Applies an operation to a copy and commits only if it succeeds. */
  private mutate<T>(fn: (draft: PlayerProfile, now: number) => T): T {
    const draft = cloneProfile(this.p);
    const now = this.now();
    syncProfile(draft, now, this.rng('sync'));
    const result = fn(draft, now);
    draft.updatedAt = now;
    this.p = draft;
    this.repo.save(this.p);
    for (const l of this.listeners) l(this.p);
    return result;
  }

  async startRace(trackId: string, mode: RaceMode, difficulty: DifficultyChoice): Promise<RaceTicket> {
    const p = this.p;
    const now = this.now();
    const seed = hashString(newId('seed'));
    const ticket = createTicket(
      newId('race'),
      trackId,
      mode,
      {
        id: p.id,
        name: p.name,
        characterId: p.loadout.characterId,
        isPlayer: true,
        cosmetics: visibleLoadout(p),
        variantId: p.loadout.variants[p.loadout.characterId] ?? null,
      },
      difficulty,
      p.level,
      seed,
      now,
    );
    this.tickets.set(ticket.raceId, ticket);
    return ticket;
  }

  async finishRace(ticket: RaceTicket, log: InputLog) {
    const issued = this.tickets.get(ticket.raceId);
    if (!issued) throw new EconomyError('not_found', 'Unknown race.');
    this.tickets.delete(ticket.raceId);
    // Same verification as the server: re-simulate from the issued ticket.
    const verified = verifyRace(issued, log);
    if (!verified.ok) throw new EconomyError('invalid', `Race could not be verified (${verified.reason}).`);
    return this.mutate((d, now) => settleRace(d, issued, verified.outcome, now));
  }

  async claimQuest(questId: string) {
    return this.mutate((d, now) => claimQuest(d, questId, now, this.rng('quest')));
  }

  async rerollQuest(questId: string) {
    this.mutate((d, now) => void rerollQuest(d, questId, now));
  }

  async claimAchievement(id: string) {
    return this.mutate((d, now) => claimAchievement(d, id, now, this.rng('ach')));
  }

  async claimDaily() {
    return this.mutate((d, now) => claimDaily(d, now, this.rng('daily')));
  }

  async claimSeasonTier(tier: number, track: 'free' | 'premium') {
    return this.mutate((d, now) => claimSeasonTier(d, tier, track, now, this.rng('season')));
  }

  async buySeasonPremium() {
    this.mutate((d, now) => buySeasonPremium(d, now, newId('buy')));
  }

  async buyOffer(offerId: string) {
    return this.mutate((d, now) => buyOffer(d, offerId, now, newId('buy'), this.rng('shop')));
  }

  async equip(slot: LoadoutSlot | 'variant' | 'character', id: string | null) {
    this.mutate((d) => equip(d, slot, id));
  }

  async setName(name: string) {
    const clean = name.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16);
    if (clean.length < 2) throw new EconomyError('invalid', 'Name must be 2–16 letters or numbers.');
    this.mutate((d) => {
      d.name = clean;
    });
  }

  async completeTutorial() {
    this.mutate((d) => {
      d.tutorialDone = true;
    });
  }

  adEligibility(placement: RewardedPlacement, raceId?: string): AdEligibility {
    return rewardedEligibility(cloneProfile(this.p), placement, this.now(), raceId);
  }

  async grantAdReward(placement: RewardedPlacement, completionToken: string, raceId?: string) {
    return this.mutate((d, now) => grantAdReward(d, placement, now, `ad:${completionToken}`, raceId));
  }

  noteInterstitial(): void {
    this.mutate((d, now) => {
      d.ads.lastInterstitialAt = now;
      d.ads.racesSinceInterstitial = 0;
    });
  }

  async flush(): Promise<void> {
    await this.repo.flush();
  }
}
