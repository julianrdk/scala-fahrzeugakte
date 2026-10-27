CREATE TABLE IF NOT EXISTS record_accounts (
  owner TEXT PRIMARY KEY, email TEXT NOT NULL, generation TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0, disabled INTEGER NOT NULL DEFAULT 0,
  next_run INTEGER NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0,
  last_run INTEGER, last_backup TEXT, last_error TEXT
);
CREATE TABLE IF NOT EXISTS record_entities (
  owner TEXT NOT NULL, generation TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL,
  payload TEXT NOT NULL, PRIMARY KEY(owner,generation,kind,id)
);
CREATE TABLE IF NOT EXISTS record_guards (
  nonce TEXT PRIMARY KEY, owner TEXT NOT NULL, expected INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS record_revision_guard BEFORE INSERT ON record_guards
WHEN NOT EXISTS(SELECT 1 FROM record_accounts WHERE owner=NEW.owner AND revision=NEW.expected AND disabled=0)
BEGIN SELECT RAISE(ABORT,'RECORD_CONFLICT'); END;
CREATE TABLE IF NOT EXISTS record_restores (
  owner TEXT NOT NULL, id TEXT NOT NULL, generation TEXT NOT NULL, source_hash TEXT NOT NULL,
  created_at TEXT NOT NULL, PRIMARY KEY(owner,id), UNIQUE(owner,source_hash)
);
CREATE TABLE IF NOT EXISTS record_usage (scope TEXT PRIMARY KEY, bytes INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO record_usage(scope,bytes) VALUES('global',0);
CREATE TABLE IF NOT EXISTS record_objects (
  owner TEXT NOT NULL, id TEXT NOT NULL, object_key TEXT NOT NULL,
  sha256 TEXT NOT NULL, size INTEGER NOT NULL, mime TEXT NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('original','thumbnail','snapshot')),
  status TEXT NOT NULL CHECK(status IN ('reserved','ready')), created_at TEXT NOT NULL,
  PRIMARY KEY(owner,id)
);
CREATE TRIGGER IF NOT EXISTS record_quota_check BEFORE INSERT ON record_objects
BEGIN
  SELECT CASE WHEN NEW.size<1 OR NEW.size>30000000 THEN RAISE(ABORT,'FILE_SIZE') END;
  SELECT CASE WHEN COALESCE((SELECT bytes FROM record_usage WHERE scope=NEW.owner),0)+NEW.size>1000000000
    OR COALESCE((SELECT bytes FROM record_usage WHERE scope='global'),0)+NEW.size>8000000000
    THEN RAISE(ABORT,'STORAGE_QUOTA') END;
END;
CREATE TRIGGER IF NOT EXISTS record_quota_add AFTER INSERT ON record_objects
BEGIN
  INSERT INTO record_usage(scope,bytes) VALUES(NEW.owner,NEW.size)
    ON CONFLICT(scope) DO UPDATE SET bytes=bytes+NEW.size;
  UPDATE record_usage SET bytes=bytes+NEW.size WHERE scope='global';
END;
CREATE TRIGGER IF NOT EXISTS record_quota_remove AFTER DELETE ON record_objects
BEGIN
  UPDATE record_usage SET bytes=bytes-OLD.size WHERE scope IN (OLD.owner,'global');
END;
CREATE INDEX IF NOT EXISTS record_daily_due ON record_accounts(disabled,next_run,lease_until);
