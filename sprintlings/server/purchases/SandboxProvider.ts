import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ProductDefinition } from '../../src/config/ProductCatalog';
import type { CheckoutSession, PaymentEvent, PaymentProvider } from './PaymentProvider';

export function signSandbox(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Development/testing payment provider. Its checkout page is clearly marked
 * as a TEST and no money moves. It delivers HMAC-signed webhooks exactly
 * like a real provider so the whole grant/refund path is exercised.
 */
export class SandboxProvider implements PaymentProvider {
  readonly id = 'sandbox';
  readonly test = true;

  constructor(
    private readonly secret: string,
    private readonly publicUrl: string,
  ) {}

  async priceLabel(product: ProductDefinition): Promise<string | null> {
    return `€${product.testPriceLabel}`;
  }

  async createCheckout(purchaseId: string): Promise<CheckoutSession> {
    const ref = `sbx_${randomUUID()}`;
    return { ref, url: `${this.publicUrl}/sandbox/checkout/${ref}?p=${encodeURIComponent(purchaseId)}` };
  }

  /** Builds a signed webhook body, used by the sandbox checkout page and tests. */
  makeWebhook(type: PaymentEvent['type'], ref: string, txId: string | null): { body: string; signature: string } {
    const body = JSON.stringify({ id: `evt_${randomUUID()}`, type, ref, txId });
    return { body, signature: signSandbox(this.secret, body) };
  }

  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): PaymentEvent[] {
    const sig = String(headers['x-sandbox-signature'] ?? '');
    const expected = signSandbox(this.secret, rawBody);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('bad signature');
    const e = JSON.parse(rawBody) as { id: string; type: PaymentEvent['type']; ref: string; txId: string | null };
    if (!['paid', 'failed', 'cancelled', 'refunded'].includes(e.type)) throw new Error('bad event type');
    return [{ eventId: e.id, type: e.type, ref: e.ref, txId: e.txId }];
  }
}
