/** Server configuration from environment variables (see README). */
export interface ServerConfig {
  port: number;
  /** memory (tests), file (single-instance dev), postgres (production). */
  storage: 'memory' | 'file' | 'postgres';
  dataDir: string;
  databaseUrl: string | null;
  paymentProvider: 'sandbox' | 'stripe' | 'none';
  /** HMAC secret used to sign sandbox webhooks. */
  sandboxSecret: string;
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  /** Public base URL of this server (for checkout return URLs). */
  publicUrl: string;
  /** Allowed browser origins for CORS ("*" in dev). */
  corsOrigins: string[];
  /** Verify races in worker threads (true in production). */
  verifyInWorkers: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? 8787);
  const storage = (env.STORAGE ?? 'file') as ServerConfig['storage'];
  return {
    port,
    storage,
    dataDir: env.DATA_DIR ?? 'server/data',
    databaseUrl: env.DATABASE_URL ?? null,
    paymentProvider: (env.PAYMENT_PROVIDER ?? 'sandbox') as ServerConfig['paymentProvider'],
    sandboxSecret: env.SANDBOX_WEBHOOK_SECRET ?? 'dev-sandbox-secret-change-me',
    stripeSecretKey: env.STRIPE_SECRET_KEY ?? null,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? null,
    publicUrl: env.PUBLIC_URL ?? `http://localhost:${port}`,
    corsOrigins: (env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()),
    verifyInWorkers: env.VERIFY_IN_WORKERS !== 'false',
  };
}
