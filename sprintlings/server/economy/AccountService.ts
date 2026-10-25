import { randomInt } from 'node:crypto';
import { syncProfile } from '../../src/economy/EconomyService';
import type { LedgerEntry, PlayerProfile } from '../../src/economy/Profile';
import { Rng } from '../../src/shared/Rng';
import { HttpError } from '../api/http';
import type { Repository } from '../persistence/Repository';

export function serverRng(): Rng {
  return new Rng(randomInt(1, 2 ** 31));
}

/**
 * Runs economy operations on an account's profile: one at a time per account
 * (in-process lock) plus optimistic versioning in storage (safe across
 * several server instances). New ledger entries go to the permanent audit log.
 */
export class AccountService {
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly repo: Repository,
    readonly now: () => number = Date.now,
  ) {}

  private async locked<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(accountId) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    this.locks.set(accountId, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(accountId) === run) this.locks.delete(accountId);
    }
  }

  async read(accountId: string): Promise<PlayerProfile> {
    return this.mutate(accountId, () => undefined).then((r) => r.profile);
  }

  async mutate<T>(accountId: string, fn: (p: PlayerProfile, now: number) => T): Promise<{ result: T; profile: PlayerProfile }> {
    return this.locked(accountId, async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const loaded = await this.repo.loadProfile(accountId);
        if (!loaded) throw new HttpError(404, 'not_found', 'Account not found');
        const p = loaded.profile;
        const original = JSON.stringify(p);
        const before = new Set(p.ledger.map((e) => e.id));
        const now = this.now();
        syncProfile(p, now, serverRng());
        const result = fn(p, now);
        if (JSON.stringify(p) === original) return { result, profile: p };
        p.updatedAt = now;
        if (await this.repo.saveProfile(accountId, p, loaded.version)) {
          const fresh: LedgerEntry[] = p.ledger.filter((e) => !before.has(e.id));
          if (fresh.length) await this.repo.appendLedger(accountId, fresh);
          return { result, profile: p };
        }
      }
      throw new HttpError(409, 'conflict', 'Please retry');
    });
  }
}
