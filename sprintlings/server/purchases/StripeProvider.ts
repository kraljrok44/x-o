import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ProductDefinition } from '../../src/config/ProductCatalog';
import type { CheckoutSession, PaymentEvent, PaymentProvider } from './PaymentProvider';

/**
 * Stripe Checkout integration (web build only).
 * Configure one Stripe Price per product via env: STRIPE_PRICE_<PRODUCT_ID>
 * (e.g. STRIPE_PRICE_GEMS_500=price_123). Localized prices come from Stripe.
 *
 * NOTE: written against Stripe's documented REST API and webhook signing
 * scheme but NOT yet exercised against a live Stripe account. Treat as
 * unverified until tested in Stripe test mode (see README).
 */
export class StripeProvider implements PaymentProvider {
  readonly id = 'stripe';
  readonly test: boolean;
  private readonly priceCache = new Map<string, string>();

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
    private readonly publicUrl: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {
    this.test = secretKey.startsWith('sk_test_');
  }

  private priceId(product: ProductDefinition): string | null {
    return this.env[`STRIPE_PRICE_${product.id.toUpperCase()}`] ?? null;
  }

  private async api(path: string, method: 'GET' | 'POST', form?: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method,
      headers: { authorization: `Bearer ${this.secretKey}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new Error(`Stripe ${res.status}: ${JSON.stringify(json.error ?? json)}`);
    return json;
  }

  async priceLabel(product: ProductDefinition): Promise<string | null> {
    const id = this.priceId(product);
    if (!id) return null;
    const hit = this.priceCache.get(id);
    if (hit) return hit;
    const p = await this.api(`prices/${id}`, 'GET');
    const amount = Number(p.unit_amount) / 100;
    const label = new Intl.NumberFormat('en', { style: 'currency', currency: String(p.currency).toUpperCase() }).format(amount);
    this.priceCache.set(id, label);
    return label;
  }

  async createCheckout(purchaseId: string, accountId: string, product: ProductDefinition): Promise<CheckoutSession> {
    const price = this.priceId(product);
    if (!price) throw new Error(`No Stripe price configured for ${product.id}`);
    const s = await this.api('checkout/sessions', 'POST', {
      mode: 'payment',
      'line_items[0][price]': price,
      'line_items[0][quantity]': '1',
      client_reference_id: purchaseId,
      'metadata[account_id]': accountId,
      'metadata[product_id]': product.id,
      success_url: `${this.publicUrl}/checkout/done?status=success`,
      cancel_url: `${this.publicUrl}/checkout/done?status=cancelled`,
    });
    return { ref: String(s.id), url: String(s.url) };
  }

  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): PaymentEvent[] {
    const header = String(headers['stripe-signature'] ?? '');
    const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
    const ts = Number(parts.t);
    if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) throw new Error('stale signature');
    const expected = createHmac('sha256', this.webhookSecret).update(`${ts}.${rawBody}`).digest('hex');
    const sigs = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
    const ok = sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
    if (!ok) throw new Error('bad signature');
    const event = JSON.parse(rawBody) as { id: string; type: string; data: { object: Record<string, unknown> } };
    const obj = event.data.object;
    switch (event.type) {
      case 'checkout.session.completed':
        if (obj.payment_status !== 'paid') return [];
        return [{ eventId: event.id, type: 'paid', ref: String(obj.id), txId: String(obj.payment_intent) }];
      case 'checkout.session.async_payment_failed':
        return [{ eventId: event.id, type: 'failed', ref: String(obj.id), txId: null }];
      case 'checkout.session.expired':
        return [{ eventId: event.id, type: 'cancelled', ref: String(obj.id), txId: null }];
      case 'charge.refunded':
        // Refunds reference the payment intent; the purchase service maps it to the checkout.
        return [{ eventId: event.id, type: 'refunded', ref: '', txId: String(obj.payment_intent) }];
      default:
        return [];
    }
  }
}
