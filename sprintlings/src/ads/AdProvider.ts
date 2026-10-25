/**
 * Ad network abstraction. Game code only talks to this interface, so the
 * concrete network (CrazyGames, GameMonetize, none) is swappable and the game
 * works when ads are missing, blocked or fail.
 */
export type AdStatus =
  | 'unavailable'
  | 'loading'
  | 'ready'
  | 'showing'
  | 'completed'
  | 'skipped'
  | 'failed'
  | 'rewardPending'
  | 'rewardGranted';

export type AdResult =
  | { status: 'completed'; /** Unique id for this completed view (used as idempotency key). */ token: string; verifiedBy: 'provider-callback' | 'server' }
  | { status: 'skipped' | 'failed' | 'unavailable'; reason: string };

export interface AdProvider {
  readonly name: string;
  readonly supportsRewarded: boolean;
  readonly supportsInterstitial: boolean;
  /** Whether a rewarded ad can be requested now (not a guarantee of fill). */
  rewardedAvailable(): boolean;
  showRewarded(): Promise<AdResult>;
  showInterstitial(): Promise<AdResult>;
  /** Hooks so the app can mute and pause while an ad plays. */
  onAdStart: (() => void) | null;
  onAdEnd: (() => void) | null;
}

export class NoAdsProvider implements AdProvider {
  readonly name = 'none';
  readonly supportsRewarded = false;
  readonly supportsInterstitial = false;
  onAdStart: (() => void) | null = null;
  onAdEnd: (() => void) | null = null;
  rewardedAvailable(): boolean {
    return false;
  }
  async showRewarded(): Promise<AdResult> {
    return { status: 'unavailable', reason: 'Ads are not available in this version.' };
  }
  async showInterstitial(): Promise<AdResult> {
    return { status: 'unavailable', reason: 'Ads are not available in this version.' };
  }
}
