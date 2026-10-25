import type { AdProvider, AdResult } from '../ads/AdProvider';
import type { KeyValueStore } from '../persistence/KeyValueStore';
import { loadScript, type Platform } from './Platform';

const SDK_URL = 'https://api.gamemonetize.com/sdk.js';

interface GMWindow {
  SDK_OPTIONS?: { gameId: string; onEvent: (e: { name: string }) => void };
  sdk?: { showBanner?: () => void };
}

/**
 * GameMonetize SDK. Its documented API offers interstitial video ads via
 * sdk.showBanner() plus SDK_GAME_PAUSE / SDK_GAME_START events. Rewarded ads
 * are not part of the documented API, so rewarded placements are hidden on
 * this platform.
 */
class GameMonetizeAdProvider implements AdProvider {
  readonly name = 'GameMonetize';
  readonly supportsRewarded = false;
  readonly supportsInterstitial = true;
  onAdStart: (() => void) | null = null;
  onAdEnd: (() => void) | null = null;
  ready = false;
  private pending: ((r: AdResult) => void) | null = null;
  private paused = false;

  handleEvent(name: string): void {
    if (name === 'SDK_READY') this.ready = true;
    if (name === 'SDK_GAME_PAUSE') {
      this.paused = true;
      this.onAdStart?.();
    }
    if (name === 'SDK_GAME_START') {
      if (this.paused) this.onAdEnd?.();
      this.paused = false;
      const p = this.pending;
      this.pending = null;
      p?.({ status: 'completed', token: `gm_${Date.now()}`, verifiedBy: 'provider-callback' });
    }
  }

  rewardedAvailable(): boolean {
    return false;
  }

  async showRewarded(): Promise<AdResult> {
    return { status: 'unavailable', reason: 'Video rewards are not available on this site.' };
  }

  showInterstitial(): Promise<AdResult> {
    const w = window as unknown as GMWindow;
    if (!this.ready || typeof w.sdk?.showBanner !== 'function') return Promise.resolve({ status: 'unavailable', reason: 'SDK not ready.' });
    return new Promise((resolve) => {
      this.pending = resolve;
      try {
        w.sdk!.showBanner!();
      } catch {
        this.pending = null;
        resolve({ status: 'failed', reason: 'Ad failed.' });
        return;
      }
      // The SDK gives up on slow requests by itself; never wait forever.
      setTimeout(() => {
        if (this.pending === resolve) {
          this.pending = null;
          if (this.paused) this.onAdEnd?.();
          this.paused = false;
          resolve({ status: 'failed', reason: 'Ad timed out.' });
        }
      }, 25_000);
    });
  }
}

export class GameMonetizePlatform implements Platform {
  readonly id = 'gamemonetize' as const;
  readonly displayName = 'GameMonetize';
  readonly ads: GameMonetizeAdProvider = new GameMonetizeAdProvider();
  readonly ownPurchasesAllowed = false;
  readonly externalLinksAllowed = false;
  readonly usesOwnServer = false;
  onMuteRequest: ((muted: boolean) => void) | null = null;
  onPauseRequest: ((paused: boolean) => void) | null = null;

  async init(): Promise<void> {
    const gameId = import.meta.env.VITE_GAMEMONETIZE_GAME_ID as string | undefined;
    if (!gameId) {
      console.warn('[gamemonetize] VITE_GAMEMONETIZE_GAME_ID is not set; ads disabled.');
      return;
    }
    const w = window as unknown as GMWindow;
    w.SDK_OPTIONS = {
      gameId,
      onEvent: (e) => {
        this.ads.handleEvent(e.name);
        // Unrequested pauses (portal holding the screen) also pause the game.
        if (e.name === 'SDK_GAME_PAUSE') this.onPauseRequest?.(true);
        if (e.name === 'SDK_GAME_START') this.onPauseRequest?.(false);
      },
    };
    try {
      await loadScript(SDK_URL, 'gamemonetize-sdk');
    } catch (err) {
      console.warn('[gamemonetize] SDK unavailable, continuing without ads', err);
    }
  }

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
