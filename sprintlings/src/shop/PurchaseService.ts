import { PRODUCTS, type ProductDefinition } from '../config/ProductCatalog';

export interface ProductOffer {
  product: ProductDefinition;
  /** Localized price exactly as returned by the payment provider. */
  priceLabel: string;
  /** True for sandbox/test prices (rendered with a TEST marker). */
  test: boolean;
  /** Permanent product already owned. */
  owned: boolean;
}

export type PurchaseOutcome =
  | { status: 'granted'; productId: string }
  | { status: 'pending'; message: string }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

/**
 * Client side of real-money purchases. It never grants anything itself:
 * it opens the provider's checkout and then asks the server for the
 * resulting (server-verified) account state.
 */
export interface PurchaseService {
  readonly available: boolean;
  /** Why purchases are unavailable (shown in the Gem Store). */
  readonly unavailableReason: string;
  loadOffers(): Promise<ProductOffer[]>;
  buy(productId: string): Promise<PurchaseOutcome>;
  restore(): Promise<number>;
}

/** Used on portals and offline builds: the store explains purchases aren't offered. */
export class UnavailablePurchaseService implements PurchaseService {
  readonly available = false;
  constructor(readonly unavailableReason: string) {}
  async loadOffers(): Promise<ProductOffer[]> {
    return PRODUCTS.map((product) => ({ product, priceLabel: '', test: false, owned: false }));
  }
  async buy(): Promise<PurchaseOutcome> {
    return { status: 'failed', message: this.unavailableReason };
  }
  async restore(): Promise<number> {
    return 0;
  }
}
