import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { LedgerEntry, PlayerProfile } from '../../src/economy/Profile';
import type { RaceTicket } from '../../src/game/RaceVerifier';
import type { Account, PurchaseRecord, Repository } from './Repository';

interface State {
  accounts: Record<string, Account>;
  tokens: Record<string, string>;
  profiles: Record<string, { profile: PlayerProfile; version: number }>;
  ledger: Record<string, LedgerEntry[]>;
  tickets: Record<string, RaceTicket>;
  purchases: Record<string, PurchaseRecord>;
  webhookEvents: Record<string, true>;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** In-memory repository; with a file path it persists to JSON (single-instance dev only). */
export class MemoryRepository implements Repository {
  readonly kind: string;
  private s: State = { accounts: {}, tokens: {}, profiles: {}, ledger: {}, tickets: {}, purchases: {}, webhookEvents: {} };
  private dirty = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly file: string | null = null) {
    this.kind = file ? 'file' : 'memory';
    if (file) {
      mkdirSync(join(file, '..'), { recursive: true });
      if (existsSync(file)) this.s = { ...this.s, ...(JSON.parse(readFileSync(file, 'utf8')) as State) };
      this.timer = setInterval(() => this.flush(), 1000);
    }
  }

  private touch(): void {
    this.dirty = true;
  }

  flush(): void {
    if (!this.file || !this.dirty) return;
    this.dirty = false;
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.s));
    renameSync(tmp, this.file);
  }

  async createAccount(account: Account, profile: PlayerProfile): Promise<void> {
    this.s.accounts[account.id] = { ...account };
    this.s.tokens[account.tokenHash] = account.id;
    this.s.profiles[account.id] = { profile: clone(profile), version: 1 };
    this.touch();
  }

  async accountByToken(hash: string): Promise<Account | null> {
    const id = this.s.tokens[hash];
    return id ? { ...this.s.accounts[id] } : null;
  }

  async loadProfile(id: string) {
    const p = this.s.profiles[id];
    return p ? { profile: clone(p.profile), version: p.version } : null;
  }

  async saveProfile(id: string, profile: PlayerProfile, expected: number): Promise<boolean> {
    const cur = this.s.profiles[id];
    if (!cur || cur.version !== expected) return false;
    this.s.profiles[id] = { profile: clone(profile), version: expected + 1 };
    this.touch();
    return true;
  }

  async appendLedger(id: string, entries: LedgerEntry[]): Promise<void> {
    (this.s.ledger[id] ??= []).push(...clone(entries));
    this.touch();
  }

  async ledger(id: string, limit: number): Promise<LedgerEntry[]> {
    return clone((this.s.ledger[id] ?? []).slice(-limit));
  }

  async putTicket(id: string, t: RaceTicket): Promise<void> {
    this.s.tickets[`${id}:${t.raceId}`] = clone(t);
    this.touch();
  }

  async takeTicket(id: string, raceId: string): Promise<RaceTicket | null> {
    const key = `${id}:${raceId}`;
    const t = this.s.tickets[key];
    if (!t) return null;
    delete this.s.tickets[key];
    this.touch();
    return t;
  }

  async createPurchase(p: PurchaseRecord): Promise<void> {
    this.s.purchases[p.id] = { ...p };
    this.touch();
  }

  async getPurchase(id: string): Promise<PurchaseRecord | null> {
    const p = this.s.purchases[id];
    return p ? { ...p } : null;
  }

  async purchaseByProviderRef(provider: string, ref: string): Promise<PurchaseRecord | null> {
    const p = Object.values(this.s.purchases).find((x) => x.provider === provider && x.providerRef === ref);
    return p ? { ...p } : null;
  }

  async purchaseByTxId(provider: string, txId: string): Promise<PurchaseRecord | null> {
    const p = Object.values(this.s.purchases).find((x) => x.provider === provider && x.providerTxId === txId);
    return p ? { ...p } : null;
  }

  async updatePurchase(id: string, patch: Partial<PurchaseRecord>): Promise<void> {
    const p = this.s.purchases[id];
    if (!p) return;
    if (patch.providerTxId && Object.values(this.s.purchases).some((x) => x.id !== id && x.providerTxId === patch.providerTxId)) {
      throw new Error('duplicate provider transaction');
    }
    this.s.purchases[id] = { ...p, ...patch };
    this.touch();
  }

  async purchasesForAccount(accountId: string): Promise<PurchaseRecord[]> {
    return Object.values(this.s.purchases).filter((p) => p.accountId === accountId).map((p) => ({ ...p }));
  }

  async markWebhookEvent(provider: string, eventId: string): Promise<boolean> {
    const key = `${provider}:${eventId}`;
    if (this.s.webhookEvents[key]) return false;
    this.s.webhookEvents[key] = true;
    this.touch();
    return true;
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.flush();
  }
}
