import type { ProductDefinition } from '../../src/config/ProductCatalog';

export interface CheckoutSession {
  ref: string;
  url: string;
}

export interface PaymentEvent {
  eventId: string;
  type: 'paid' | 'failed' | 'cancelled' | 'refunded';
  ref: string;
  txId: string | null;
}

export interface PaymentProvider {
  readonly id: string;
  readonly test: boolean;
  priceLabel(product: ProductDefinition): Promise<string | null>;
  createCheckout(purchaseId: string, accountId: string, product: ProductDefinition): Promise<CheckoutSession>;
  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): PaymentEvent[];
}
