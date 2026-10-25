import { startServer, type RunningServer } from '../server/index';

export interface Api {
  srv: RunningServer;
  clock: { t: number };
  call<T = Record<string, unknown>>(method: 'GET' | 'POST', path: string, body?: unknown, token?: string): Promise<{ status: number; json: T }>;
  guest(): Promise<string>;
}

export async function testServer(storage: 'memory' | 'postgres' = 'memory', databaseUrl?: string): Promise<Api> {
  const clock = { t: Date.parse('2026-10-25T10:00:00Z') };
  const srv = await startServer(
    { port: 0, storage, databaseUrl: databaseUrl ?? null, paymentProvider: 'sandbox', sandboxSecret: 'test-secret', verifyInWorkers: false, publicUrl: 'http://localhost' },
    { now: () => clock.t, matchWaitMs: 200 },
  );
  const call = async <T>(method: 'GET' | 'POST', path: string, body?: unknown, token?: string) => {
    const res = await fetch(`${srv.url}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as T };
  };
  return {
    srv,
    clock,
    call,
    async guest() {
      const r = await call<{ token: string }>('POST', '/api/auth/guest');
      return r.json.token;
    },
  };
}
