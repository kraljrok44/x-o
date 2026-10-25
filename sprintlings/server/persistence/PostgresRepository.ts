import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { LedgerEntry, PlayerProfile } from '../../src/economy/Profile';
import type { RaceTicket } from '../../src/game/RaceVerifier';
import type { Account, PurchaseRecord, Repository } from './Repository';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/** PostgreSQL implementation. Run migrations with `migrate()` at startup. */
export class PostgresRepository implements Repository {
  readonly kind = 'postgres';
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 10 });
  }

  /** Applies pending SQL migrations in filename order (each file runs once). */
  async migrate(): Promise<number[]> {
    await this.pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const done = new Set((await this.pool.query<{ version: number }>('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
    const applied: number[] = [];
    for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
      const version = Number(file.split('_')[0]);
      if (done.has(version)) continue;
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING', [version]);
        await client.query('COMMIT');
        applied.push(version);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
    return applied;
  }

  async createAccount(a: Account, profile: PlayerProfile): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO accounts (id, token_hash, created_at) VALUES ($1, $2, $3)', [a.id, a.tokenHash, a.createdAt]);
      await client.query('INSERT INTO profiles (account_id, version, data) VALUES ($1, 1, $2)', [a.id, JSON.stringify(profile)]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async accountByToken(hash: string): Promise<Account | null> {
    const r = await this.pool.query('SELECT id, token_hash, created_at FROM accounts WHERE token_hash = $1', [hash]);
    const row = r.rows[0];
    return row ? { id: row.id, tokenHash: row.token_hash, createdAt: Number(row.created_at) } : null;
  }

  async loadProfile(id: string) {
    const r = await this.pool.query('SELECT version, data FROM profiles WHERE account_id = $1', [id]);
    const row = r.rows[0];
    return row ? { profile: row.data as PlayerProfile, version: row.version as number } : null;
  }

  async saveProfile(id: string, profile: PlayerProfile, expected: number): Promise<boolean> {
    const r = await this.pool.query('UPDATE profiles SET data = $2, version = version + 1, updated_at = now() WHERE account_id = $1 AND version = $3', [id, JSON.stringify(profile), expected]);
    return r.rowCount === 1;
  }

  async appendLedger(id: string, entries: LedgerEntry[]): Promise<void> {
    for (const e of entries) {
      await this.pool.query(
        'INSERT INTO ledger (id, account_id, type, at, coins, gems, xp, items, reason, ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING',
        [e.id, id, e.type, e.at, e.coins, e.gems, e.xp, JSON.stringify(e.items), e.reason, e.ref],
      );
    }
  }

  async ledger(id: string, limit: number): Promise<LedgerEntry[]> {
    const r = await this.pool.query('SELECT * FROM ledger WHERE account_id = $1 ORDER BY at DESC LIMIT $2', [id, limit]);
    return r.rows.reverse().map((row) => ({ id: row.id, type: row.type, at: Number(row.at), coins: row.coins, gems: row.gems, xp: row.xp, items: row.items, reason: row.reason, ref: row.ref }));
  }

  async putTicket(id: string, t: RaceTicket): Promise<void> {
    await this.pool.query('INSERT INTO race_tickets (account_id, race_id, data, issued_at) VALUES ($1,$2,$3,$4)', [id, t.raceId, JSON.stringify(t), t.issuedAt]);
  }

  async takeTicket(id: string, raceId: string): Promise<RaceTicket | null> {
    const r = await this.pool.query('DELETE FROM race_tickets WHERE account_id = $1 AND race_id = $2 RETURNING data', [id, raceId]);
    return (r.rows[0]?.data as RaceTicket) ?? null;
  }

  private static purchase(row: Record<string, unknown>): PurchaseRecord {
    return {
      id: row.id as string,
      accountId: row.account_id as string,
      productId: row.product_id as string,
      provider: row.provider as string,
      providerRef: row.provider_ref as string,
      providerTxId: (row.provider_tx_id as string) ?? null,
      status: row.status as PurchaseRecord['status'],
      priceLabel: row.price_label as string,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  async createPurchase(p: PurchaseRecord): Promise<void> {
    await this.pool.query(
      'INSERT INTO purchases (id, account_id, product_id, provider, provider_ref, provider_tx_id, status, price_label, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [p.id, p.accountId, p.productId, p.provider, p.providerRef, p.providerTxId, p.status, p.priceLabel, p.createdAt, p.updatedAt],
    );
  }

  async getPurchase(id: string): Promise<PurchaseRecord | null> {
    const r = await this.pool.query('SELECT * FROM purchases WHERE id = $1', [id]);
    return r.rows[0] ? PostgresRepository.purchase(r.rows[0]) : null;
  }

  async purchaseByProviderRef(provider: string, ref: string): Promise<PurchaseRecord | null> {
    const r = await this.pool.query('SELECT * FROM purchases WHERE provider = $1 AND provider_ref = $2', [provider, ref]);
    return r.rows[0] ? PostgresRepository.purchase(r.rows[0]) : null;
  }

  async purchaseByTxId(provider: string, txId: string): Promise<PurchaseRecord | null> {
    const r = await this.pool.query('SELECT * FROM purchases WHERE provider = $1 AND provider_tx_id = $2', [provider, txId]);
    return r.rows[0] ? PostgresRepository.purchase(r.rows[0]) : null;
  }

  async updatePurchase(id: string, patch: Partial<PurchaseRecord>): Promise<void> {
    const cur = await this.getPurchase(id);
    if (!cur) return;
    const n = { ...cur, ...patch };
    await this.pool.query('UPDATE purchases SET status = $2, provider_tx_id = $3, provider_ref = $4, updated_at = $5 WHERE id = $1', [id, n.status, n.providerTxId, n.providerRef, n.updatedAt]);
  }

  async purchasesForAccount(accountId: string): Promise<PurchaseRecord[]> {
    const r = await this.pool.query('SELECT * FROM purchases WHERE account_id = $1 ORDER BY created_at', [accountId]);
    return r.rows.map(PostgresRepository.purchase);
  }

  async markWebhookEvent(provider: string, eventId: string): Promise<boolean> {
    const r = await this.pool.query('INSERT INTO webhook_events (provider, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [provider, eventId]);
    return r.rowCount === 1;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
