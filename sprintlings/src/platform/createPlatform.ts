import { CrazyGamesPlatform } from './CrazyGamesPlatform';
import { GameMonetizePlatform } from './GameMonetizePlatform';
import { BUILD_PLATFORM, type Platform } from './Platform';
import { StandalonePlatform } from './StandalonePlatform';

export function createPlatform(): Platform {
  switch (BUILD_PLATFORM) {
    case 'crazygames':
      return new CrazyGamesPlatform();
    case 'gamemonetize':
      return new GameMonetizePlatform();
    case 'web':
    case 'dev':
    case 'standalone':
      return new StandalonePlatform(BUILD_PLATFORM);
  }
}
