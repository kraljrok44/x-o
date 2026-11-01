import { CrazyGamesPlatform } from './CrazyGamesPlatform';
import { GameMonetizePlatform } from './GameMonetizePlatform';
import type { Platform } from './Platform';
import { StandalonePlatform } from './StandalonePlatform';

declare const __PLATFORM__: string;

export async function createPlatform(): Promise<Platform> {
  if (__PLATFORM__ === 'crazygames') return new CrazyGamesPlatform();
  if (__PLATFORM__ === 'gamemonetize') return new GameMonetizePlatform();
  if (__PLATFORM__ === 'dev') {
    const { DevTestAdProvider } = await import('./DevTestAdProvider');
    return new StandalonePlatform('dev', new DevTestAdProvider());
  }
  return new StandalonePlatform(__PLATFORM__ === 'web' ? 'web' : 'standalone');
}
