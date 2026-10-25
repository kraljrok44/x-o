import { randomUUID } from 'node:crypto';
import { PRODUCTS, PRODUCT_BY_ID } from '../../src/config/ProductCatalog';
import { grantProduct, revokeProduct } from '../../src/economy/EconomyService';
import { hasEntitlement } from '../../src/shop/EntitlementService';
import type { PlayerProfile } from '../../src/economy/Profile';
import { HttpError } from '../api/http';
import { serverRng, type AccountService } from '../economy/AccountService';
import type { PurchaseRecord, Repository } from '../persistence/Repository';
import type { PaymentProvider } from './PaymentProvider';

function owned(profile: PlayerProfile, productId: string): boolean {
  const p = PRODUCT_BY_ID[productId];
  if (!p || p.kind !== 'permanent') return false;
  return (p.grants.entitlements ?? []).every((e) => hasEntitlement(profile, e));
}

/**
 * Server-side purchase flow:
 *   offer -> checkout (pending record) -> provider -> signed webhook ->
 *   grant (idempotent on provider transaction id) -> client refreshes.
 * Cancel / failure / refund / duplicate webhooks / late payments after the
 * client disconnected are all handled from the webhook side.
 */
export class PurchaseService {
  constructor(
    private readonly repo: Repository,
    private readonly accounts: AccountService,
    readonly provider: PaymentProvider | null,
  ) {}

  async offers(accountId: string) {
    const profile = await this.accounts.read(accountId);
    return Promise.all(
      PRODUCTS.map(async (product) => ({
        product,
        priceLabel: this.provider ? ((await this.provider.priceLabel(product).catch(() => null)) ?? '') : '',
        test: this.provider?.test ?? false,
        owned: owned(profile, product.id),
      })),
    );
  }

  async checkout(accountId: string, productId: string): Promise<{ purchaseId: string; url: string }> {
    if (!this.provider) throw new HttpError(503, 'unavailable', 'Purchases are not configured on this server.');
    const product = PRODUCT_BY_ID[productId];
    if (!product) throw new HttpError(404, 'not_found', 'Unknown product');
    const profile = await this.accounts.read(accountId);
    if (owned(profile, productId)) throw new HttpError(409, 'already_owned', 'You already own this.');
    const now = this.accounts.now();
    const priceLabel = (await this.provider.priceLabel(product)) ?? '';
    const rec: PurchaseRecord = { id: `pur_${randomUUID()}`, accountId, productId, provider: this.provider.id, providerRef: `pending_${randomUUID()}`, providerTxId: null, status: 'pending', priceLabel, createdAt: now, updatedAt: now };
    await this.repo.createPurchase(rec);
    const session = await this.provider.createCheckout(rec.id, accountId, product);
    await this.repo.updatePurchase(rec.id, { providerRef: session.ref, updatedAt: now });
    return { purchaseId: rec.id, url: session.url };
  }

  async status(accountId: string, purchaseId: string): Promise<PurchaseRecord> {
    const p = await this.repo.getPurchase(purchaseId);
    if (!p || p.accountId !== accountId) throw new HttpError(404, 'not_found', 'Purchase not found');
    return p;
  }

  /** Processes a provider webhook. Returns how many events changed something. */
  async webhook(providerId: string, rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<number> {
    if (!this.provider || this.provider.id !== providerId) throw new HttpError(404, 'not_found', 'Unknown provider');
    let events;
    try {
      events = this.provider.parseWebhook(rawBody, headers);
    } catch {
      throw new HttpError(400, 'bad_signature', 'Webhook signature invalid');
    }
    let changed = 0;
    for (const e of events) {
      // Every transition below is idempotent (status checks + grants keyed on the
      // provider transaction id), so a duplicate or retried delivery is harmless.
      // The event is recorded only after it was applied, so a crash mid-way is retried.
      const rec = e.ref ? await this.repo.purchaseByProviderRef(providerId, e.ref) : e.txId ? await this.repo.purchaseByTxId(providerId, e.txId) : null;
      if (!rec) continue;
      const now = this.accounts.now();
      if (e.type === 'paid') {
        if (rec.status === 'paid' || rec.status === 'refunded') continue;
        const txId = e.txId ?? rec.providerRef;
        // A payment that succeeds after a cancel/failure (or after the client left) is still granted.
        await this.accounts.mutate(rec.accountId, (p, t) => {
          if (p.processedEvents.includes(`iap:${txId}`)) return;
          try {
            grantProduct(p, rec.productId, txId, t, serverRng());
          } catch (err) {
            // e.g. a second concurrent checkout for an already owned permanent item.
            console.warn(`[purchases] ${rec.id} paid but not granted (${(err as Error).message}); needs a manual refund`);
          }
        });
        await this.repo.updatePurchase(rec.id, { status: 'paid', providerTxId: txId, updatedAt: now });
        changed++;
      } else if (e.type === 'refunded') {
        if (rec.status !== 'paid') continue;
        const txId = rec.providerTxId ?? rec.providerRef;
        await this.accounts.mutate(rec.accountId, (p, t) => {
          if (!p.processedEvents.includes(`iap_refund:${txId}`)) revokeProduct(p, rec.productId, txId, t);
        });
        await this.repo.updatePurchase(rec.id, { status: 'refunded', updatedAt: now });
        changed++;
      } else if (rec.status === 'pending') {
        await this.repo.updatePurchase(rec.id, { status: e.type, updatedAt: now });
        changed++;
      }
      await this.repo.markWebhookEvent(providerId, e.eventId);
    }
    return changed;
  }

  /** Permanent rights live on the account; "restore" re-reads them and lists past purchases. */
  async restore(accountId: string) {
    const profile = await this.accounts.read(accountId);
    const purchases = await this.repo.purchasesForAccount(accountId);
    return { entitlements: profile.entitlements, purchases: purchases.filter((p) => p.status === 'paid').map((p) => ({ id: p.id, productId: p.productId })) };
  }
}
