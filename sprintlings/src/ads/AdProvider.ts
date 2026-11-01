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
  | { status: 'completed'; token: string; verifiedBy: 'provider-callback' | 'server' }
  | { status: 'skipped' | 'failed' | 'unavailable'; reason: string };

export interface AdProvider {
  readonly name: string;
  readonly supportsRewarded: boolean;
  readonly supportsInterstitial: boolean;
  rewardedAvailable(): boolean;
  showRewarded(): Promise<AdResult>;
  showInterstitial(): Promise<AdResult>;
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
