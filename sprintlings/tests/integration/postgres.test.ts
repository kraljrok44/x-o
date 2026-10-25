import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { PostgresRepository } from '../../server/persistence/PostgresRepository';
import { testServer, type Api } from '../helpersServer';
import { createProfile } from '../../src/economy/Profile';

/**
 * Runs only when TEST_DATABASE_URL points at a disposable PostgreSQL
 * database (e.g. postgres://sprint:sprint@localhost/sprintlings_test).
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('PostgreSQL repository', () => {
  let api: Api;
  beforeAll(async () => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await c.end();
    api = await testServer('postgres', url);
  });
  afterAll(async () => {
    await api?.srv.close();
  });

  it('migrates, creates accounts and enforces optimistic versions', async () => {
    const repo = new PostgresRepository(url!);
    expect(await repo.migrate()).toEqual([]); // already applied by the server
    await repo.createAccount({ id: 'acc_pg', tokenHash: 'h_pg', createdAt: 1 }, createProfile('acc_pg', 1));
    const loaded = await repo.loadProfile('acc_pg');
    expect(loaded?.version).toBe(1);
    expect(await repo.saveProfile('acc_pg', loaded!.profile, 1)).toBe(true);
    expect(await repo.saveProfile('acc_pg', loaded!.profile, 1)).toBe(false);
    expect(await repo.markWebhookEvent('sandbox', 'evt1')).toBe(true);
    expect(await repo.markWebhookEvent('sandbox', 'evt1')).toBe(false);
    await repo.close();
  });

  it('runs the purchase flow end to end on PostgreSQL', async () => {
    const token = await api.guest();
    const r = await api.call<{ purchaseId: string }>('POST', '/api/purchases/checkout', { productId: 'gems_500' }, token);
    const p = await api.srv.services.repo.getPurchase(r.json.purchaseId);
    const hook = api.srv.sandbox!.makeWebhook('paid', p!.providerRef, 'tx_pg');
    for (let i = 0; i < 2; i++) await fetch(`${api.srv.url}/api/purchases/webhook/sandbox`, { method: 'POST', headers: { 'x-sandbox-signature': hook.signature }, body: hook.body });
    const prof = await api.call<{ profile: { wallet: { gems: number } } }>('GET', '/api/profile', undefined, token);
    expect(prof.json.profile.wallet.gems).toBe(500);
    const ledger = await api.call<{ ledger: { type: string }[] }>('GET', '/api/ledger', undefined, token);
    expect(ledger.json.ledger.filter((e) => e.type === 'iap_grant')).toHaveLength(1);
  });
});
