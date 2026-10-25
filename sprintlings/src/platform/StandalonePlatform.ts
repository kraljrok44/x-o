import { NoAdsProvider, type AdProvider, type AdResult } from '../ads/AdProvider';
import type { KeyValueStore } from '../persistence/KeyValueStore';
import { newId } from '../shared/ids';
import type { Platform, PlatformId } from './Platform';

/**
 * Development-only ad simulator. It is clearly labelled as a TEST ad, is
 * never included in portal builds and exists only to exercise the reward
 * flow (complete / close early / fail) during development.
 */
export class DevTestAdProvider implements AdProvider {
  readonly name = 'Test ads (development only)';
  readonly supportsRewarded = true;
  readonly supportsInterstitial = true;
  onAdStart: (() => void) | null = null;
  onAdEnd: (() => void) | null = null;

  rewardedAvailable(): boolean {
    return true;
  }

  private show(kind: 'rewarded' | 'interstitial'): Promise<AdResult> {
    return new Promise((resolve) => {
      this.onAdStart?.();
      const el = document.createElement('div');
      el.className = 'test-ad';
      el.setAttribute('role', 'dialog');
      el.innerHTML = `
        <div class="test-ad__box">
          <div class="test-ad__label">TEST AD · development build · not a real advertisement</div>
          <div class="test-ad__title">${kind === 'rewarded' ? 'Rewarded video simulator' : 'Interstitial simulator'}</div>
          <div class="test-ad__count">5</div>
          <div class="test-ad__actions">
            <button data-a="close">Close now (no reward)</button>
            <button data-a="fail">Simulate failure</button>
          </div>
        </div>`;
      document.body.appendChild(el);
      let left = kind === 'rewarded' ? 5 : 3;
      const count = el.querySelector('.test-ad__count')!;
      count.textContent = String(left);
      const done = (r: AdResult) => {
        clearInterval(timer);
        el.remove();
        this.onAdEnd?.();
        resolve(r);
      };
      const timer = setInterval(() => {
        left--;
        count.textContent = String(left);
        if (left <= 0) done({ status: 'completed', token: newId('testad'), verifiedBy: 'provider-callback' });
      }, 1000);
      el.querySelector('[data-a=close]')!.addEventListener('click', () => done({ status: 'skipped', reason: 'Closed early.' }));
      el.querySelector('[data-a=fail]')!.addEventListener('click', () => done({ status: 'failed', reason: 'Simulated network error.' }));
    });
  }

  showRewarded(): Promise<AdResult> {
    return this.show('rewarded');
  }

  showInterstitial(): Promise<AdResult> {
    return this.show('interstitial');
  }
}

/** Dev server, offline standalone build and our own website build. */
export class StandalonePlatform implements Platform {
  readonly displayName: string;
  readonly ads: AdProvider;
  readonly ownPurchasesAllowed: boolean;
  readonly externalLinksAllowed = true;
  readonly usesOwnServer: boolean;
  onMuteRequest: ((muted: boolean) => void) | null = null;
  onPauseRequest: ((paused: boolean) => void) | null = null;

  constructor(readonly id: Extract<PlatformId, 'dev' | 'standalone' | 'web'>) {
    this.displayName = id === 'dev' ? 'Development' : id === 'web' ? 'Web' : 'Standalone';
    this.ads = id === 'dev' ? new DevTestAdProvider() : new NoAdsProvider();
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
