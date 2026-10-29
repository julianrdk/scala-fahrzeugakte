-- Credentials are deliberately outside fleet settings, generations and exports.
CREATE TABLE IF NOT EXISTS ai_credentials (
 owner TEXT PRIMARY KEY REFERENCES record_accounts(owner),
 version TEXT NOT NULL, ciphertext TEXT NOT NULL, iv TEXT NOT NULL,
 suffix TEXT NOT NULL, updated_at TEXT NOT NULL
);
-- A single bounded row per account: no prompts, audio or generated drafts.
CREATE TABLE IF NOT EXISTS ai_limits (
 owner TEXT PRIMARY KEY REFERENCES record_accounts(owner),
 window INTEGER NOT NULL, requests INTEGER NOT NULL,
 lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0
);
