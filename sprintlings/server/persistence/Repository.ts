import type { LedgerEntry, PlayerProfile } from '../../src/economy/Profile';
import type { RaceTicket } from '../../src/game/RaceVerifier';

export interface Account {
  id: string;
  tokenHash: string;
  createdAt: number;
}

export type PurchaseStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';

export interface PurchaseRecord {
  id: string;
  accountId: string;
  productId: string;
  provider: string;
  providerRef: string;
  providerTxId: string | null;
  status: PurchaseStatus;
  priceLabel: string;
  createdAt: number;
  updatedAt: number;
}

export interface Repository {
  readonly kind: string;
  createAccount(account: Account, profile: PlayerProfile): Promise<void>;
  accountByToken(tokenHash: string): Promise<Account | null>;
  loadProfile(accountId: string): Promise<{ profile: PlayerProfile; version: number } | null>;
  saveProfile(accountId: string, profile: PlayerProfile, expectedVersion: number): Promise<boolean>;
  appendLedger(accountId: string, entries: LedgerEntry[]): Promise<void>;
  ledger(accountId: string, limit: number): Promise<LedgerEntry[]>;
  putTicket(accountId: string, ticket: RaceTicket): Promise<void>;
  takeTicket(accountId: string, raceId: string): Promise<RaceTicket | null>;
  createPurchase(p: PurchaseRecord): Promise<void>;
  getPurchase(id: string): Promise<PurchaseRecord | null>;
  purchaseByProviderRef(provider: string, ref: string): Promise<PurchaseRecord | null>;
  purchaseByTxId(provider: string, txId: string): Promise<PurchaseRecord | null>;
  updatePurchase(id: string, patch: Partial<PurchaseRecord>): Promise<void>;
  purchasesForAccount(accountId: string): Promise<PurchaseRecord[]>;
  markWebhookEvent(provider: string, eventId: string): Promise<boolean>;
  close(): Promise<void>;
}
