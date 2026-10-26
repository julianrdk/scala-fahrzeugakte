CREATE TABLE IF NOT EXISTS oauth_requests (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  verifier TEXT NOT NULL,
  remember INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_expiry ON oauth_requests(expires_at);
CREATE TABLE IF NOT EXISTS credentials (
  owner_sub TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  tokens TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  session_hash TEXT PRIMARY KEY,
  owner_sub TEXT NOT NULL,
  csrf TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS account_jobs (
  owner_sub TEXT PRIMARY KEY,
  next_run INTEGER NOT NULL,
  lease_until INTEGER NOT NULL DEFAULT 0,
  last_run INTEGER,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS job_due ON account_jobs(next_run, lease_until);
CREATE TABLE IF NOT EXISTS fuel_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fuel_cache_expiry ON fuel_cache(expires_at);
CREATE TABLE IF NOT EXISTS fuel_limits (
  service TEXT PRIMARY KEY,
  next_at INTEGER NOT NULL
);
