import type { GameAuthority } from '../app/GameAuthority';
import type { RewardedPlacement } from '../config/AdConfig';
import type { GrantResult } from '../economy/EconomyService';
import type { AdProvider, AdStatus } from './AdProvider';

export type RewardedOutcome =
  | { status: 'rewardGranted'; grant: GrantResult }
  | { status: Exclude<AdStatus, 'rewardGranted'>; message: string };

/**
 * Runs the rewarded-ad flow for one placement:
 *   eligibility -> (player already confirmed in UI) -> showing -> completed
 *   -> rewardPending -> authority grants -> rewardGranted.
 * A closed, skipped or failed ad never grants anything.
 */
export class RewardedAdService {
  status: AdStatus = 'unavailable';
  private busy = false;

  constructor(
    private readonly provider: AdProvider,
    private readonly authority: GameAuthority,
  ) {
    this.status = provider.supportsRewarded ? 'ready' : 'unavailable';
  }

  get supported(): boolean {
    return this.provider.supportsRewarded;
  }

  canOffer(placement: RewardedPlacement, raceId?: string): { ok: boolean; reason?: string } {
    if (!this.provider.supportsRewarded) return { ok: false, reason: 'Video rewards are not available here.' };
    if (!this.provider.rewardedAvailable()) return { ok: false, reason: 'No video available right now.' };
    const el = this.authority.adEligibility(placement, raceId);
    return el.allowed ? { ok: true } : { ok: false, reason: el.reason };
  }

  async run(placement: RewardedPlacement, raceId?: string): Promise<RewardedOutcome> {
    if (this.busy) return { status: 'showing', message: 'A video is already playing.' };
    const can = this.canOffer(placement, raceId);
    if (!can.ok) return { status: 'unavailable', message: can.reason ?? 'Unavailable.' };
    this.busy = true;
    try {
      this.status = 'showing';
      const result = await this.provider.showRewarded();
      if (result.status !== 'completed') {
        this.status = result.status;
        const message = result.status === 'skipped' ? 'The video was closed early, so no reward this time.' : result.reason || 'The video could not be played.';
        return { status: result.status, message };
      }
      this.status = 'rewardPending';
      try {
        const grant = await this.authority.grantAdReward(placement, result.token, raceId);
        this.status = 'rewardGranted';
        return { status: 'rewardGranted', grant };
      } catch (err) {
        this.status = 'failed';
        return { status: 'failed', message: err instanceof Error ? err.message : 'Reward could not be granted.' };
      }
    } finally {
      this.busy = false;
      if (this.status !== 'unavailable') this.status = this.provider.supportsRewarded ? 'ready' : 'unavailable';
    }
  }
}
