-- Sprintlings server schema v1.
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at BIGINT NOT NULL
);

-- Whole profile as JSONB with an optimistic-lock version.
CREATE TABLE IF NOT EXISTS profiles (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Full, append-only economic audit log. The event id is globally unique: the same
-- economic event can never be recorded (or paid) twice.
CREATE TABLE IF NOT EXISTS ledger (
  id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  at BIGINT NOT NULL,
  coins INTEGER NOT NULL,
  gems INTEGER NOT NULL,
  xp INTEGER NOT NULL,
  items JSONB NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT NOT NULL,
  PRIMARY KEY (account_id, id)
);
CREATE INDEX IF NOT EXISTS ledger_account_at ON ledger (account_id, at);

CREATE TABLE IF NOT EXISTS race_tickets (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  race_id TEXT NOT NULL,
  data JSONB NOT NULL,
  issued_at BIGINT NOT NULL,
  PRIMARY KEY (account_id, race_id)
);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_ref TEXT NOT NULL,
  provider_tx_id TEXT UNIQUE,
  status TEXT NOT NULL,
  price_label TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE (provider, provider_ref)
);

CREATE TABLE IF NOT EXISTS webhook_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

INSERT INTO schema_migrations (version) VALUES (1) ON CONFLICT DO NOTHING;
