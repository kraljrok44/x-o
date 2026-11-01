import type { PlayerProfile } from '../economy/Profile';

export function hasEntitlement(profile: PlayerProfile, id: string): boolean {
  return profile.entitlements.includes(id);
}

export function grantEntitlement(profile: PlayerProfile, id: string): boolean {
  if (hasEntitlement(profile, id)) return false;
  profile.entitlements.push(id);
  return true;
}

export function revokeEntitlement(profile: PlayerProfile, id: string): boolean {
  const i = profile.entitlements.indexOf(id);
  if (i < 0) return false;
  profile.entitlements.splice(i, 1);
  return true;
}

export function interstitialsDisabled(profile: PlayerProfile): boolean {
  return hasEntitlement(profile, 'ad_free');
}
