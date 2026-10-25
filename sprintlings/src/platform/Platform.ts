import type { AdProvider } from '../ads/AdProvider';
import type { KeyValueStore } from '../persistence/KeyValueStore';

export type PlatformId = 'dev' | 'standalone' | 'crazygames' | 'gamemonetize' | 'web';

declare const __PLATFORM__: PlatformId;
export const BUILD_PLATFORM: PlatformId = __PLATFORM__;

/**
 * Distribution platform integration: portal SDK lifecycle events, ads, cloud
 * storage and platform rules (e.g. no external links or own payments on
 * portals unless the portal provides them).
 */
export interface Platform {
  readonly id: PlatformId;
  readonly displayName: string;
  readonly ads: AdProvider;
  /** Our own IAP may be offered (requires our server). */
  readonly ownPurchasesAllowed: boolean;
  /** Outgoing links (e.g. privacy policy on our site) allowed. */
  readonly externalLinksAllowed: boolean;
  /** Whether the game should talk to our own server (server/). */
  readonly usesOwnServer: boolean;
  init(): Promise<void>;
  loadingStart(): void;
  loadingStop(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  /** Celebrate a great moment (e.g. a win). */
  happyTime(): void;
  /** Portal-provided persistent storage, if any. */
  cloudStore(): KeyValueStore | null;
  /** Portal user name, if the player is logged in on the portal. */
  userName(): Promise<string | null>;
  /** Portal asks the game to mute (e.g. its own audio setting). */
  onMuteRequest: ((muted: boolean) => void) | null;
  /** Portal pauses/resumes the game (e.g. GameMonetize ad events). */
  onPauseRequest: ((paused: boolean) => void) | null;
}

export function loadScript(src: string, id?: string, timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    if (id) s.id = id;
    s.async = true;
    const timer = setTimeout(() => reject(new Error(`Timed out loading ${src}`)), timeoutMs);
    s.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    s.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`Failed to load ${src}`));
    };
    document.head.appendChild(s);
  });
}
