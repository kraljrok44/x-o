import { createServer as createHttpServer, type Server } from 'node:http';
import { join } from 'node:path';
import { PRODUCT_BY_ID } from '../src/config/ProductCatalog';
import { HttpError, Router, readBody, send, type Request } from './api/http';
import { registerRoutes, type Services } from './api/routes';
import { AuthService } from './auth/AuthService';
import { AccountService } from './economy/AccountService';
import { loadConfig, type ServerConfig } from './config';
import { MemoryRepository } from './persistence/MemoryRepository';
import { PostgresRepository } from './persistence/PostgresRepository';
import type { Repository } from './persistence/Repository';
import { PurchaseService } from './purchases/PurchaseService';
import { SandboxProvider } from './purchases/SandboxProvider';
import { StripeProvider } from './purchases/StripeProvider';
import type { PaymentProvider } from './purchases/PaymentProvider';
import { RaceService } from './rewards/RaceService';
import { VerifierPool } from './antiCheat/VerifierPool';
import { MatchmakingService } from './matchmaking/MatchmakingService';

export interface RunningServer {
  server: Server;
  url: string;
  services: Services;
  sandbox: SandboxProvider | null;
  close(): Promise<void>;
}

async function createRepository(cfg: ServerConfig): Promise<Repository> {
  if (cfg.storage === 'postgres') {
    if (!cfg.databaseUrl) throw new Error('DATABASE_URL is required for STORAGE=postgres');
    const repo = new PostgresRepository(cfg.databaseUrl);
    const applied = await repo.migrate();
    if (applied.length) console.log(`[db] applied migrations ${applied.join(', ')}`);
    return repo;
  }
  return new MemoryRepository(cfg.storage === 'file' ? join(cfg.dataDir, 'db.json') : null);
}

function createProvider(cfg: ServerConfig): PaymentProvider | null {
  if (cfg.paymentProvider === 'sandbox') return new SandboxProvider(cfg.sandboxSecret, cfg.publicUrl);
  if (cfg.paymentProvider === 'stripe') {
    if (!cfg.stripeSecretKey || !cfg.stripeWebhookSecret) throw new Error('STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required');
    return new StripeProvider(cfg.stripeSecretKey, cfg.stripeWebhookSecret, cfg.publicUrl);
  }
  return null;
}

/** Sandbox checkout page: plainly a TEST, with buttons for every outcome. */
function sandboxPage(ref: string, productName: string, price: string): string {
  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
  return `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>Sandbox checkout (TEST)</title>
<style>body{font-family:system-ui;background:#fff4f4;display:grid;place-items:center;min-height:100vh;margin:0}main{background:#fff;border:3px dashed #c0182c;border-radius:14px;padding:24px;max-width:420px}b.t{color:#c0182c}button{font-size:16px;margin:4px;padding:10px 14px;border-radius:10px;border:2px solid #333;cursor:pointer}</style>
<main><p><b class=t>TEST CHECKOUT – sandbox payment provider. No real money is charged.</b></p><h2>${esc(productName)}</h2><p>Test price: ${esc(price)}</p>
<button data-t=paid>Simulate successful payment</button><button data-t=cancelled>Cancel</button><button data-t=failed>Simulate failure</button><p id=o></p></main>
<script>for(const b of document.querySelectorAll('button'))b.onclick=async()=>{const r=await fetch('/sandbox/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ref:${JSON.stringify(ref)},type:b.dataset.t})});document.getElementById('o').textContent=r.ok?'Done – you can return to the game.':'Error';setTimeout(()=>window.close(),900)}</script>`;
}

export async function startServer(overrides: Partial<ServerConfig> = {}, opts: { now?: () => number; matchWaitMs?: number } = {}): Promise<RunningServer> {
  const cfg = { ...loadConfig(), ...overrides };
  const repo = await createRepository(cfg);
  const provider = createProvider(cfg);
  const accounts = new AccountService(repo, opts.now);
  const verifier = new VerifierPool(cfg.verifyInWorkers);
  const services: Services = {
    repo,
    auth: new AuthService(repo),
    accounts,
    races: new RaceService(repo, accounts, verifier),
    purchases: new PurchaseService(repo, accounts, provider),
  };
  const router = new Router();
  registerRoutes(router, services);
  const sandbox = provider instanceof SandboxProvider ? provider : null;

  const server = createHttpServer(async (req, res) => {
    const origin = String(req.headers.origin ?? '');
    const allowed = cfg.corsOrigins.includes('*') ? '*' : cfg.corsOrigins.includes(origin) ? origin : '';
    if (allowed) {
      res.setHeader('access-control-allow-origin', allowed);
      res.setHeader('access-control-allow-headers', 'authorization, content-type');
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    const url = new URL(req.url ?? '/', 'http://x');
    try {
      if (sandbox && req.method === 'GET' && url.pathname.startsWith('/sandbox/checkout/')) {
        const ref = url.pathname.split('/').pop()!;
        const pur = await repo.purchaseByProviderRef('sandbox', ref);
        if (!pur) return send(res, 404, 'Unknown checkout', 'text/plain');
        return send(res, 200, sandboxPage(ref, PRODUCT_BY_ID[pur.productId]?.name ?? pur.productId, pur.priceLabel), 'text/html');
      }
      if (sandbox && req.method === 'POST' && url.pathname === '/sandbox/complete') {
        const body = JSON.parse(await readBody(req)) as { ref: string; type: 'paid' | 'cancelled' | 'failed' };
        const hook = sandbox.makeWebhook(body.type, body.ref, body.type === 'paid' ? `sbx_tx_${body.ref}` : null);
        const changed = await services.purchases.webhook('sandbox', hook.body, { 'x-sandbox-signature': hook.signature });
        return send(res, 200, { changed });
      }
      if (req.method === 'GET' && url.pathname === '/checkout/done') return send(res, 200, '<p>Payment finished. You can close this tab and return to the game.</p>', 'text/html');
      const m = router.match(req.method ?? 'GET', url.pathname);
      if (!m) throw new HttpError(404, 'not_found', 'Not found');
      const rawBody = req.method === 'POST' ? await readBody(req) : '';
      let body: unknown = null;
      if (rawBody && !m.route.raw) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          throw new HttpError(400, 'invalid', 'Invalid JSON');
        }
      }
      const request: Request = { method: req.method ?? 'GET', path: url.pathname, params: m.params, query: url.searchParams, headers: req.headers, rawBody, body, ip: req.socket.remoteAddress ?? '?' };
      send(res, 200, await m.route.handler(request));
    } catch (err) {
      if (err instanceof HttpError) send(res, err.status, { error: err.code, message: err.message });
      else {
        console.error('[server]', err);
        send(res, 500, { error: 'internal', message: 'Internal error' });
      }
    }
  });

  const matchmaking = new MatchmakingService(server, repo, accounts, { waitMs: opts.matchWaitMs });
  await new Promise<void>((resolve) => server.listen(cfg.port, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : cfg.port;
  return {
    server,
    url: `http://localhost:${port}`,
    services,
    sandbox,
    async close() {
      matchmaking.close();
      await new Promise<void>((r) => server.close(() => r()));
      await verifier.close();
      await repo.close();
    },
  };
}

if (process.argv[1] && /server[\\/]index\.ts$/.test(process.argv[1])) {
  startServer()
    .then((s) => console.log(`Sprintlings server on ${s.url} (storage: ${s.services.repo.kind}, payments: ${s.services.purchases.provider?.id ?? 'none'})`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
