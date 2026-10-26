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
