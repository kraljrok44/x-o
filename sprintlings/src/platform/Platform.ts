import type { AdProvider } from '../ads/AdProvider';
import type { KeyValueStore } from '../persistence/KeyValueStore';

export type PlatformId = 'dev' | 'standalone' | 'crazygames' | 'gamemonetize' | 'web';

declare const __PLATFORM__: PlatformId;
export const BUILD_PLATFORM: PlatformId = __PLATFORM__;

export interface Platform {
  readonly id: PlatformId;
  readonly displayName: string;
  readonly ads: AdProvider;
  readonly ownPurchasesAllowed: boolean;
  readonly externalLinksAllowed: boolean;
  readonly usesOwnServer: boolean;
  init(): Promise<void>;
  loadingStart(): void;
  loadingStop(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  happyTime(): void;
  cloudStore(): KeyValueStore | null;
  userName(): Promise<string | null>;
  onMuteRequest: ((muted: boolean) => void) | null;
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
