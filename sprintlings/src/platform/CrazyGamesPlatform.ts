import { NoAdsProvider, type AdProvider, type AdResult } from '../ads/AdProvider';
import type { KeyValueStore } from '../persistence/KeyValueStore';
import { newId } from '../shared/ids';
import { loadScript, type Platform } from './Platform';

/** The subset of the CrazyGames HTML5 SDK v3 we use. */
interface CrazySDK {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  ad: {
    requestAd(type: 'midgame' | 'rewarded', callbacks: { adStarted?: () => void; adFinished?: () => void; adError?: (error: { code?: string; message?: string }) => void }): void;
    hasAdblock?(): Promise<boolean>;
  };
  game: {
    gameplayStart(): void;
    gameplayStop(): void;
    loadingStart(): void;
    loadingStop(): void;
    happytime(): void;
    settings?: { muteAudio?: boolean };
    addSettingsChangeListener?(cb: (s: { muteAudio?: boolean }) => void): void;
  };
  data?: { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
  user?: { isUserAccountAvailable?: boolean; getUser?(): Promise<{ username?: string } | null> };
}

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

function sdk(): CrazySDK | null {
  return (window as unknown as { CrazyGames?: { SDK?: CrazySDK } }).CrazyGames?.SDK ?? null;
}

class CrazyGamesAdProvider implements AdProvider {
  readonly name = 'CrazyGames';
  readonly supportsRewarded = true;
  readonly supportsInterstitial = true;
  onAdStart: (() => void) | null = null;
  onAdEnd: (() => void) | null = null;
  adblock = false;

  rewardedAvailable(): boolean {
    const s = sdk();
    return !!s && s.environment !== 'disabled' && !this.adblock;
  }

  private request(type: 'midgame' | 'rewarded'): Promise<AdResult> {
    const s = sdk();
    if (!s || s.environment === 'disabled') return Promise.resolve({ status: 'unavailable', reason: 'Ads are disabled.' });
    return new Promise((resolve) => {
      let started = false;
      let settled = false;
      const finish = (r: AdResult) => {
        if (settled) return;
        settled = true;
        if (started) this.onAdEnd?.();
        resolve(r);
      };
      try {
        s.ad.requestAd(type, {
          adStarted: () => {
            started = true;
            this.onAdStart?.();
          },
          // CrazyGames calls adFinished only when the ad ran to completion.
          adFinished: () => finish({ status: 'completed', token: newId('cg'), verifiedBy: 'provider-callback' }),
          adError: (e) =>
            finish({ status: 'failed', reason: e?.code === 'unfilled' ? 'No video is available right now. Please try again later.' : 'The video could not be played.' }),
        });
      } catch {
        finish({ status: 'failed', reason: 'The video could not be played.' });
      }
      // Safety net so the UI never hangs.
      setTimeout(() => finish({ status: 'failed', reason: 'The video timed out.' }), 90_000);
    });
  }

  showRewarded(): Promise<AdResult> {
    return this.request('rewarded');
  }

  showInterstitial(): Promise<AdResult> {
    return this.request('midgame');
  }
}

/** CrazyGames data module (cloud save for logged-in players, local otherwise). */
class CrazyDataStore implements KeyValueStore {
  readonly name = 'crazygames-data';
  async get(key: string): Promise<string | null> {
    try {
      return sdk()?.data?.getItem(`sprintlings_${key}`) ?? null;
    } catch {
      return null;
    }
  }
  async set(key: string, value: string): Promise<void> {
    try {
      sdk()?.data?.setItem(`sprintlings_${key}`, value);
    } catch {
      /* ignore */
    }
  }
  async remove(key: string): Promise<void> {
    try {
      sdk()?.data?.removeItem(`sprintlings_${key}`);
    } catch {
      /* ignore */
    }
  }
}

export class CrazyGamesPlatform implements Platform {
  readonly id = 'crazygames' as const;
  readonly displayName = 'CrazyGames';
  ads: AdProvider = new NoAdsProvider();
  readonly ownPurchasesAllowed = false;
  readonly externalLinksAllowed = false;
  readonly usesOwnServer = false;
  onMuteRequest: ((muted: boolean) => void) | null = null;
  onPauseRequest: ((paused: boolean) => void) | null = null;
  private ready = false;
  private inGameplay = false;

  async init(): Promise<void> {
    try {
      if (!sdk()) await loadScript(SDK_URL);
      const s = sdk();
      if (!s) return;
      await s.init();
      this.ready = true;
      const ads = new CrazyGamesAdProvider();
      try {
        ads.adblock = (await s.ad.hasAdblock?.()) ?? false;
      } catch {
        /* ignore */
      }
      this.ads = ads;
      if (s.game.settings?.muteAudio) this.onMuteRequest?.(true);
      s.game.addSettingsChangeListener?.((st) => {
        if (typeof st.muteAudio === 'boolean') this.onMuteRequest?.(st.muteAudio);
      });
    } catch (err) {
      console.warn('[crazygames] SDK unavailable, continuing without it', err);
    }
  }

  private call(fn: (s: CrazySDK) => void): void {
    const s = sdk();
    if (!this.ready || !s) return;
    try {
      fn(s);
    } catch {
      /* SDK errors must never break the game */
    }
  }

  loadingStart(): void {
    this.call((s) => s.game.loadingStart());
  }
  loadingStop(): void {
    this.call((s) => s.game.loadingStop());
  }
  gameplayStart(): void {
    if (this.inGameplay) return;
    this.inGameplay = true;
    this.call((s) => s.game.gameplayStart());
  }
  gameplayStop(): void {
    if (!this.inGameplay) return;
    this.inGameplay = false;
    this.call((s) => s.game.gameplayStop());
  }
  happyTime(): void {
    this.call((s) => s.game.happytime());
  }
  cloudStore(): KeyValueStore | null {
    return this.ready && sdk()?.data ? new CrazyDataStore() : null;
  }
  async userName(): Promise<string | null> {
    try {
      const s = sdk();
      if (!s?.user?.isUserAccountAvailable || !s.user.getUser) return null;
      const u = await s.user.getUser();
      return u?.username ?? null;
    } catch {
      return null;
    }
  }
}
