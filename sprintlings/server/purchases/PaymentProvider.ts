import type { ProductDefinition } from '../../src/config/ProductCatalog';

export interface CheckoutSession {
  /** Provider reference for this checkout (session id). */
  ref: string;
  /** URL the client opens to pay. */
  url: string;
}

export interface PaymentEvent {
  /** Provider event id (webhook idempotency). */
  eventId: string;
  type: 'paid' | 'failed' | 'cancelled' | 'refunded';
  /** Checkout reference the event belongs to. */
  ref: string;
  /** Provider payment/transaction id (unique per real payment). */
  txId: string | null;
}

/**
 * Payment provider abstraction. The server never trusts the client about
 * payments: only signature-verified provider webhooks change purchase state.
 */
export interface PaymentProvider {
  readonly id: string;
  /** Sandbox prices are fake and must be shown with a TEST marker. */
  readonly test: boolean;
  /** Localized price string from the provider, or null if unknown. */
  priceLabel(product: ProductDefinition): Promise<string | null>;
  createCheckout(purchaseId: string, accountId: string, product: ProductDefinition): Promise<CheckoutSession>;
  /** Verifies the webhook signature and parses its events; throws if invalid. */
  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): PaymentEvent[];
}
