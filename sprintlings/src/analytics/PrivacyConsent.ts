import type { LocalSettings } from '../persistence/LocalSettings';
import type { PlatformId } from '../platform/Platform';

export function analyticsAllowed(settings: LocalSettings, platform: PlatformId): boolean {
  if (platform === 'dev') return false;
  return settings.value.analyticsConsent === 'granted';
}
