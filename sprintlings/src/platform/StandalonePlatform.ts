import { NoAdsProvider, type AdProvider } from '../ads/AdProvider';
import type { KeyValueStore } from '../persistence/KeyValueStore';
import type { Platform, PlatformId } from './Platform';

/** Dev server, offline standalone build and our own website build. */
export class StandalonePlatform implements Platform {
  readonly displayName: string;
  readonly ads: AdProvider;
  readonly ownPurchasesAllowed: boolean;
  readonly externalLinksAllowed = true;
  readonly usesOwnServer: boolean;
  onMuteRequest: ((muted: boolean) => void) | null = null;
  onPauseRequest: ((paused: boolean) => void) | null = null;

  constructor(
    readonly id: Extract<PlatformId, 'dev' | 'standalone' | 'web'>,
    ads: AdProvider = new NoAdsProvider(),
  ) {
    this.displayName = id === 'dev' ? 'Development' : id === 'web' ? 'Web' : 'Standalone';
    this.ads = ads;
    this.ownPurchasesAllowed = id !== 'standalone';
    this.usesOwnServer = id !== 'standalone';
  }

  async init(): Promise<void> {}
  loadingStart(): void {}
  loadingStop(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}
  happyTime(): void {}
  cloudStore(): KeyValueStore | null {
    return null;
  }
  async userName(): Promise<string | null> {
    return null;
  }
}
