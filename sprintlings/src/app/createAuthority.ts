import type { KeyValueStore } from '../persistence/KeyValueStore';
import { LocalAuthority } from '../persistence/LocalAuthority';
import { ProfileRepository } from '../persistence/ProfileRepository';
import type { Platform } from '../platform/Platform';
import { UnavailablePurchaseService, type PurchaseService } from '../shop/PurchaseService';
import { t } from '../ui/i18n';
import type { GameAuthority } from './GameAuthority';

export interface AuthoritySetup {
  authority: GameAuthority;
  purchases: PurchaseService;
  serverUrl: string | null;
}

/**
 * Chooses where the profile lives:
 *  - our server (web build, or dev with `npm run server` running): full
 *    server-side validation and real purchases,
 *  - otherwise a local profile (IndexedDB, or CrazyGames' data module).
 */
export async function createAuthority(platform: Platform, browserStore: KeyValueStore): Promise<AuthoritySetup> {
  if (platform.usesOwnServer) {
    const { connectServerAuthority } = await import('../network/ServerAuthority');
    const server = await connectServerAuthority();
    if (server) return server;
  }
  const cloud = platform.cloudStore();
  const store = cloud ?? browserStore;
  const label =
    platform.id === 'crazygames' && cloud
      ? t('Saved with CrazyGames (cloud save when you are logged in).')
      : t('Saved on this device. Local progress is not a server account.');
  const authority = new LocalAuthority(new ProfileRepository(store), label);
  const reason =
    platform.id === 'crazygames' || platform.id === 'gamemonetize'
      ? t('Purchases with real money are not available in this version of the game.')
      : t('Purchases with real money are not available in this version of the game.');
  return { authority, purchases: new UnavailablePurchaseService(reason), serverUrl: null };
}
