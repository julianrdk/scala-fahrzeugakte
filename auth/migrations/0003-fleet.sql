-- Additive migration: legacy tables and original objects remain intact.
CREATE TABLE IF NOT EXISTS fleet_accounts (
 owner TEXT PRIMARY KEY REFERENCES record_accounts(owner), revision INTEGER NOT NULL DEFAULT 1,
 generation TEXT NOT NULL, settings TEXT NOT NULL, migrated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fleet_vehicles (
 owner TEXT NOT NULL, fleet_generation TEXT NOT NULL, id TEXT NOT NULL, generation TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, payload TEXT NOT NULL, preferences TEXT NOT NULL DEFAULT '{}',
 PRIMARY KEY(owner,fleet_generation,id)
);
CREATE TABLE IF NOT EXISTS fleet_entities (
 owner TEXT NOT NULL, vehicle TEXT NOT NULL, generation TEXT NOT NULL, kind TEXT NOT NULL,
 id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,vehicle,generation,kind,id)
);
CREATE INDEX IF NOT EXISTS fleet_entity_date ON fleet_entities(owner,vehicle,generation,kind,COALESCE(json_extract(payload,'$.date'),''),id);
CREATE INDEX IF NOT EXISTS fleet_entity_created ON fleet_entities(owner,vehicle,generation,kind,COALESCE(json_extract(payload,'$.created_at'),''),id);
CREATE INDEX IF NOT EXISTS fleet_document_hash ON fleet_entities(owner,vehicle,generation,kind,json_extract(payload,'$.sha256'));
CREATE TABLE IF NOT EXISTS fleet_receipts (
 owner TEXT NOT NULL, scope TEXT NOT NULL, operation TEXT NOT NULL, fingerprint TEXT NOT NULL,
 result TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(owner,scope,operation)
);
CREATE TABLE IF NOT EXISTS fleet_guards (
 nonce TEXT PRIMARY KEY, owner TEXT NOT NULL, vehicle TEXT, expected INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS fleet_revision_guard BEFORE INSERT ON fleet_guards
WHEN (NEW.vehicle IS NULL AND NOT EXISTS(SELECT 1 FROM fleet_accounts WHERE owner=NEW.owner AND revision=NEW.expected))
 OR (NEW.vehicle IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fleet_vehicles v JOIN fleet_accounts a ON a.owner=v.owner AND a.generation=v.fleet_generation WHERE v.owner=NEW.owner AND v.id=NEW.vehicle AND v.revision=NEW.expected))
BEGIN SELECT RAISE(ABORT,'FLEET_CONFLICT'); END;
CREATE TABLE IF NOT EXISTS fleet_restores (
 owner TEXT NOT NULL, id TEXT NOT NULL, vehicle TEXT, generation TEXT NOT NULL,
 source_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'staging', created_at TEXT NOT NULL,
 settings TEXT NOT NULL DEFAULT '{}', base_heads TEXT NOT NULL DEFAULT '{}', base_revision INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(owner,id), UNIQUE(owner,vehicle,source_hash)
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_restore_source ON fleet_restores(owner,COALESCE(vehicle,''),source_hash);
CREATE TABLE IF NOT EXISTS fleet_jobs (
 owner TEXT PRIMARY KEY, phase TEXT NOT NULL DEFAULT 'idle', cursor TEXT, run_date TEXT,
 next_run INTEGER NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0, last_run INTEGER,
 last_backup TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS fleet_mail_budget(day TEXT NOT NULL,id TEXT NOT NULL,PRIMARY KEY(day,id));
CREATE TABLE IF NOT EXISTS fleet_outbox(owner TEXT NOT NULL,run_id TEXT NOT NULL,vehicle TEXT NOT NULL,rule_key TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',PRIMARY KEY(owner,run_id,vehicle,rule_key));
CREATE TABLE IF NOT EXISTS fleet_mail_runs(owner TEXT NOT NULL,run_id TEXT NOT NULL,recipient TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(owner,run_id));
CREATE TABLE IF NOT EXISTS fleet_backup_chunks(owner TEXT NOT NULL,run_id TEXT NOT NULL,vehicle TEXT NOT NULL,ordinal INTEGER NOT NULL,object_id TEXT NOT NULL,PRIMARY KEY(owner,run_id,vehicle,ordinal));
CREATE TABLE IF NOT EXISTS fleet_backup_runs(owner TEXT NOT NULL,run_id TEXT NOT NULL,object_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(owner,run_id));
CREATE TABLE IF NOT EXISTS fuel_cache(cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS fuel_cache_expiry ON fuel_cache(expires_at);
CREATE TABLE IF NOT EXISTS fuel_limits(service TEXT PRIMARY KEY,next_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS fleet_backup_requests(owner TEXT NOT NULL,operation TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(owner,operation));
CREATE TRIGGER IF NOT EXISTS fleet_backup_idle BEFORE INSERT ON fleet_backup_requests
WHEN NOT EXISTS(SELECT 1 FROM fleet_backup_requests WHERE owner=NEW.owner AND operation=NEW.operation) AND NOT EXISTS(SELECT 1 FROM fleet_jobs WHERE owner=NEW.owner AND phase='idle')
BEGIN SELECT RAISE(ABORT,'BACKUP_BUSY'); END;
CREATE INDEX IF NOT EXISTS fleet_mail_recent ON fleet_mail_runs(owner,created_at);
