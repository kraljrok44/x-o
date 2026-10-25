import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testServer, type Api } from '../helpersServer';
import type { PlayerProfile } from '../../src/economy/Profile';

let api: Api;
beforeAll(async () => {
  api = await testServer();
});
afterAll(async () => {
  await api.srv.close();
});

async function profile(token: string): Promise<PlayerProfile> {
  return (await api.call<{ profile: PlayerProfile }>('GET', '/api/profile', undefined, token)).json.profile;
}

async function checkout(token: string, productId: string) {
  const r = await api.call<{ purchaseId: string; url: string }>('POST', '/api/purchases/checkout', { productId }, token);
  expect(r.status).toBe(200);
  const p = await api.srv.services.repo.getPurchase(r.json.purchaseId);
  return { purchaseId: r.json.purchaseId, ref: p!.providerRef };
}

async function webhook(type: 'paid' | 'failed' | 'cancelled' | 'refunded', ref: string, txId: string | null, signature?: string) {
  const hook = api.srv.sandbox!.makeWebhook(type, ref, txId);
  const res = await fetch(`${api.srv.url}/api/purchases/webhook/sandbox`, { method: 'POST', headers: { 'x-sandbox-signature': signature ?? hook.signature }, body: hook.body });
  return { status: res.status, body: hook.body, signature: hook.signature };
}

describe('server purchases', () => {
  it('offers show provider prices marked as test', async () => {
    const token = await api.guest();
    const r = await api.call<{ offers: { product: { id: string }; priceLabel: string; test: boolean }[] }>('GET', '/api/purchases/offers', undefined, token);
    const gems = r.json.offers.find((o) => o.product.id === 'gems_500')!;
    expect(gems.priceLabel).toContain('4.99');
    expect(gems.test).toBe(true);
  });

  it('successful payment grants gems only after the signed webhook', async () => {
    const token = await api.guest();
    const { purchaseId, ref } = await checkout(token, 'gems_500');
    expect((await profile(token)).wallet.gems).toBe(0);
    // The client claiming success means nothing: status stays pending.
    const s = await api.call<{ purchase: { status: string } }>('GET', `/api/purchases/${purchaseId}`, undefined, token);
    expect(s.json.purchase.status).toBe('pending');
    expect((await webhook('paid', ref, 'tx_ok_1')).status).toBe(200);
    expect((await profile(token)).wallet.gems).toBe(500);
  });

  it('duplicate webhook deliveries never grant twice', async () => {
    const token = await api.guest();
    const { ref } = await checkout(token, 'gems_1200');
    const first = await webhook('paid', ref, 'tx_dup');
    // Re-deliver the exact same signed event, then a new event for the same transaction.
    await fetch(`${api.srv.url}/api/purchases/webhook/sandbox`, { method: 'POST', headers: { 'x-sandbox-signature': first.signature }, body: first.body });
    await webhook('paid', ref, 'tx_dup');
    expect((await profile(token)).wallet.gems).toBe(1200);
  });

  it('cancelled and failed payments grant nothing', async () => {
    const token = await api.guest();
    const a = await checkout(token, 'gems_500');
    await webhook('cancelled', a.ref, null);
    const b = await checkout(token, 'gems_500');
    await webhook('failed', b.ref, null);
    expect((await profile(token)).wallet.gems).toBe(0);
    expect((await api.srv.services.repo.getPurchase(a.purchaseId))!.status).toBe('cancelled');
  });

  it('rejects webhooks with a bad signature', async () => {
    const token = await api.guest();
    const { ref } = await checkout(token, 'gems_500');
    expect((await webhook('paid', ref, 'tx_forged', 'deadbeef')).status).toBe(400);
    expect((await profile(token)).wallet.gems).toBe(0);
  });

  it('refunds revoke the grant', async () => {
    const token = await api.guest();
    const { ref } = await checkout(token, 'gems_500');
    await webhook('paid', ref, 'tx_ref');
    await webhook('refunded', ref, 'tx_ref');
    expect((await profile(token)).wallet.gems).toBe(0);
  });

  it('permanent rights are restored and cannot be bought twice', async () => {
    const token = await api.guest();
    const { ref } = await checkout(token, 'ad_free');
    await webhook('paid', ref, 'tx_adfree');
    const r = await api.call<{ entitlements: string[]; purchases: unknown[] }>('POST', '/api/purchases/restore', {}, token);
    expect(r.json.entitlements).toContain('ad_free');
    expect(r.json.purchases).toHaveLength(1);
    const again = await api.call('POST', '/api/purchases/checkout', { productId: 'ad_free' }, token);
    expect(again.status).toBe(409);
  });

  it('a payment completing after the client disconnected is still granted', async () => {
    const token = await api.guest();
    const { ref } = await checkout(token, 'gems_3000');
    // Client goes away (never polls). Provider confirms later:
    await webhook('paid', ref, 'tx_late');
    // Client comes back and simply loads its profile.
    expect((await profile(token)).wallet.gems).toBe(3000);
    // Even a late success after a recorded cancellation is honoured (money was taken).
    const b = await checkout(token, 'gems_500');
    await webhook('cancelled', b.ref, null);
    await webhook('paid', b.ref, 'tx_late_2');
    expect((await profile(token)).wallet.gems).toBe(3500);
  });

  it('keeps an audit trail of grants and refunds', async () => {
    const token = await api.guest();
    const { ref } = await checkout(token, 'gems_500');
    await webhook('paid', ref, 'tx_audit');
    await webhook('refunded', ref, 'tx_audit');
    const r = await api.call<{ ledger: { type: string }[] }>('GET', '/api/ledger', undefined, token);
    expect(r.json.ledger.map((e) => e.type)).toEqual(expect.arrayContaining(['iap_grant', 'iap_refund']));
  });
});
