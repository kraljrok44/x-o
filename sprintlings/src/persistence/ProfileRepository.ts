import { hashString } from '../shared/Rng';
import type { PlayerProfile } from '../economy/Profile';
import type { KeyValueStore } from './KeyValueStore';
import { migrateProfile } from './SaveMigration';

const KEY = 'profile';
const BACKUP_KEY = 'profile_backup';

interface Envelope {
  v: 1;
  sum: number;
  data: string;
}

/**
 * Stores the local (offline / portal) profile with a checksum and a backup
 * slot, so a corrupted or half-written save falls back to the previous one.
 * The checksum detects corruption; it is not a security measure: local
 * saves are not equivalent to a server account and the UI says so.
 */
export class ProfileRepository {
  private pending: PlayerProfile | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  lastLoadInfo: { source: 'primary' | 'backup' | 'none'; migratedFrom: number | null; corrupted: boolean } = { source: 'none', migratedFrom: null, corrupted: false };

  constructor(readonly store: KeyValueStore) {}

  private static wrap(p: PlayerProfile): string {
    const data = JSON.stringify(p);
    const env: Envelope = { v: 1, sum: hashString(`sprintlings|${data}`), data };
    return JSON.stringify(env);
  }

  private static unwrap(raw: string | null): unknown | null {
    if (!raw) return null;
    try {
      const env = JSON.parse(raw) as Envelope;
      if (env.v !== 1 || typeof env.data !== 'string') return null;
      if (hashString(`sprintlings|${env.data}`) !== env.sum) return null;
      return JSON.parse(env.data);
    } catch {
      return null;
    }
  }

  async load(now: number): Promise<PlayerProfile | null> {
    const primaryRaw = await this.store.get(KEY);
    const primary = ProfileRepository.unwrap(primaryRaw);
    const candidates: [unknown, 'primary' | 'backup'][] = [];
    if (primary) candidates.push([primary, 'primary']);
    const backup = ProfileRepository.unwrap(await this.store.get(BACKUP_KEY));
    if (backup) candidates.push([backup, 'backup']);
    for (const [raw, source] of candidates) {
      try {
        const { profile, migratedFrom } = migrateProfile(raw, now);
        this.lastLoadInfo = { source, migratedFrom, corrupted: source === 'backup' && !!primaryRaw };
        return profile;
      } catch {
        /* try next */
      }
    }
    this.lastLoadInfo = { source: 'none', migratedFrom: null, corrupted: !!primaryRaw };
    return null;
  }

  /** Writes immediately (also rotates the backup slot). */
  async saveNow(p: PlayerProfile): Promise<void> {
    const current = await this.store.get(KEY);
    if (current) await this.store.set(BACKUP_KEY, current);
    await this.store.set(KEY, ProfileRepository.wrap(p));
  }

  /** Debounced save for frequent changes. */
  save(p: PlayerProfile): void {
    this.pending = p;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const next = this.pending;
      this.pending = null;
      if (next) void this.saveNow(next);
    }, 250);
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      await this.saveNow(p);
    }
  }

  async clear(): Promise<void> {
    await this.store.remove(KEY);
    await this.store.remove(BACKUP_KEY);
  }
}
