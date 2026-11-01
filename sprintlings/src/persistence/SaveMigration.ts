import { PROFILE_SCHEMA_VERSION, createProfile, type PlayerProfile } from '../economy/Profile';

type AnyProfile = Record<string, unknown> & { schemaVersion?: number };

const MIGRATIONS: ((p: AnyProfile) => AnyProfile)[] = [
  (p) => {
    const ads = (p.ads ?? {}) as Record<string, unknown>;
    const quests = (p.quests ?? {}) as Record<string, unknown>;
    return {
      ...p,
      seasonHistory: Array.isArray(p.seasonHistory) ? p.seasonHistory : [],
      ads: { ...ads, rewardedRaceIds: Array.isArray(ads.rewardedRaceIds) ? ads.rewardedRaceIds : [] },
      quests: { ...quests, sweptDay: quests.sweptDay ?? null },
      schemaVersion: 2,
    };
  },
];

export interface MigrationResult {
  profile: PlayerProfile;
  migratedFrom: number | null;
}

export function migrateProfile(raw: unknown, now: number): MigrationResult {
  if (!raw || typeof raw !== 'object') throw new Error('Save is not an object');
  let p = raw as AnyProfile;
  const from = typeof p.schemaVersion === 'number' ? p.schemaVersion : 1;
  if (from > PROFILE_SCHEMA_VERSION) throw new Error(`Save is from a newer version (${from})`);
  for (let v = from; v < PROFILE_SCHEMA_VERSION; v++) p = MIGRATIONS[v - 1](p);
  const base = createProfile(String(p.id ?? 'local'), now);
  const merged = deepDefaults(p, base as unknown as AnyProfile) as unknown as PlayerProfile;
  merged.schemaVersion = PROFILE_SCHEMA_VERSION;
  return { profile: merged, migratedFrom: from === PROFILE_SCHEMA_VERSION ? null : from };
}

function deepDefaults(value: AnyProfile, defaults: AnyProfile): AnyProfile {
  const out: AnyProfile = { ...defaults };
  for (const [k, v] of Object.entries(value)) {
    const d = (defaults as Record<string, unknown>)[k];
    if (d && typeof d === 'object' && !Array.isArray(d) && v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepDefaults(v as AnyProfile, d as AnyProfile);
    } else if (v !== undefined) out[k] = v;
  }
  return out;
}
