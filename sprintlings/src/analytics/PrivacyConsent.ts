import type { LocalSettings } from '../persistence/LocalSettings';
import type { PlatformId } from '../platform/Platform';

/**
 * Consent for our own anonymous gameplay analytics. On portals the portal's
 * consent flow governs its own SDK; our analytics stay off there unless the
 * player opts in from Settings. Nothing is sent without 'granted'.
 */
export function analyticsAllowed(settings: LocalSettings, platform: PlatformId): boolean {
  if (platform === 'dev') return false;
  return settings.value.analyticsConsent === 'granted';
}
