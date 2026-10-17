// Crate opening without duplicates (crate spec 6, 12).
// The result is chosen only from items the player does not own yet, written to the
// inventory, and only then returned for the animation. Retries with the same idempotency
// key return the original result instead of granting a second item.

import { COLLECTIBLES, CATALOG_TOTAL, getCollectible } from './catalog.js';
import { CATALOG_VERSION, GAME } from './config.js';

export const CRATE_ID = 'glide_vault';

export const CRATE_STATUS = {
  SUCCESS: 'SUCCESS',
  COLLECTION_COMPLETE: 'COLLECTION_COMPLETE',
  RETRY_SAFE: 'RETRY_SAFE',
  COOLDOWN: 'COOLDOWN',
  BAD_REQUEST: 'BAD_REQUEST',
};

export function emptyProfile() {
  return { owned: [], equipped: null, idem: {}, lastOpenAt: 0, opens: 0, catalogVersion: CATALOG_VERSION };
}

/**
 * @param store  { load(key) -> profile|null, save(key, profile) } (save must be durable before returning)
 * @param key    player key
 * @param idemKey client generated idempotency key (string)
 * @param opts   { now:number(ms), rng:()=>number, cooldownMs?:number }
 */
export function openCrate(store, key, idemKey, opts = {}) {
  const now = opts.now ?? Date.now();
  const rng = opts.rng ?? Math.random;
  const cooldownMs = opts.cooldownMs ?? GAME.crateCooldownSec * 1000;
  if (typeof idemKey !== 'string' || idemKey.length < 8 || idemKey.length > 64) {
    return { status: CRATE_STATUS.BAD_REQUEST };
  }

  const profile = store.load(key) || emptyProfile();

  // Idempotency: the same request returns the already committed result.
  const prev = profile.idem[idemKey];
  if (prev) {
    return { status: CRATE_STATUS.SUCCESS, collectible_id: prev, collection_count: profile.owned.length, collection_total: CATALOG_TOTAL, replay: true };
  }

  const owned = new Set(profile.owned);
  const available = COLLECTIBLES.filter((c) => c.enabled && !owned.has(c.collectible_id));
  if (available.length === 0) {
    return { status: CRATE_STATUS.COLLECTION_COMPLETE, collection_count: owned.size, collection_total: CATALOG_TOTAL };
  }
  if (now - profile.lastOpenAt < cooldownMs) {
    return { status: CRATE_STATUS.COOLDOWN, retryInMs: cooldownMs - (now - profile.lastOpenAt) };
  }

  const chosen = available[Math.floor(rng() * available.length) % available.length];
  if (owned.has(chosen.collectible_id) || !getCollectible(chosen.collectible_id)) {
    return { status: CRATE_STATUS.RETRY_SAFE };
  }

  const next = {
    ...profile,
    owned: [...profile.owned, chosen.collectible_id],
    idem: { ...profile.idem, [idemKey]: chosen.collectible_id },
    lastOpenAt: now,
    opens: (profile.opens || 0) + 1,
    catalogVersion: CATALOG_VERSION,
  };
  // keep the idempotency table bounded
  const keys = Object.keys(next.idem);
  if (keys.length > 50) for (const k of keys.slice(0, keys.length - 50)) delete next.idem[k];

  try {
    store.save(key, next); // commit before the client is told anything
  } catch (e) {
    return { status: CRATE_STATUS.RETRY_SAFE, error: String(e && e.message) };
  }
  return {
    status: CRATE_STATUS.SUCCESS,
    collectible_id: chosen.collectible_id,
    collection_count: next.owned.length,
    collection_total: CATALOG_TOTAL,
  };
}

export function equipKnife(store, key, collectibleId) {
  const profile = store.load(key) || emptyProfile();
  if (collectibleId !== null && !profile.owned.includes(collectibleId)) return false;
  store.save(key, { ...profile, equipped: collectibleId });
  return true;
}
