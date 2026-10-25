import { CrazyGamesPlatform } from './CrazyGamesPlatform';
import { GameMonetizePlatform } from './GameMonetizePlatform';
import type { Platform } from './Platform';
import { StandalonePlatform } from './StandalonePlatform';

declare const __PLATFORM__: string;

export async function createPlatform(): Promise<Platform> {
  // __PLATFORM__ is a build-time constant, so unused branches (including the
  // development ad simulator) are removed from portal and production builds.
  if (__PLATFORM__ === 'crazygames') return new CrazyGamesPlatform();
  if (__PLATFORM__ === 'gamemonetize') return new GameMonetizePlatform();
  if (__PLATFORM__ === 'dev') {
    const { DevTestAdProvider } = await import('./DevTestAdProvider');
    return new StandalonePlatform('dev', new DevTestAdProvider());
  }
  return new StandalonePlatform(__PLATFORM__ === 'web' ? 'web' : 'standalone');
}
