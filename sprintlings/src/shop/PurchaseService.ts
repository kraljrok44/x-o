import { PRODUCTS, type ProductDefinition } from '../config/ProductCatalog';

export interface ProductOffer {
  product: ProductDefinition;
  priceLabel: string;
  test: boolean;
  owned: boolean;
}

export type PurchaseOutcome =
  | { status: 'granted'; productId: string }
  | { status: 'pending'; message: string }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

export interface PurchaseService {
  readonly available: boolean;
  readonly unavailableReason: string;
  loadOffers(): Promise<ProductOffer[]>;
  buy(productId: string): Promise<PurchaseOutcome>;
  restore(): Promise<number>;
}

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
