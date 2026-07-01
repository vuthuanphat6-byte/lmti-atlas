CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_records (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  privacy TEXT NOT NULL,
  confidence REAL NOT NULL,
  importance REAL NOT NULL,
  source_agent TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  related_files_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lesson_records (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  privacy TEXT NOT NULL,
  confidence REAL NOT NULL,
  importance REAL NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  project_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  privacy TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS retrieval_index (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  score REAL NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS policy_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  decision_on_failure TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS publish_targets (
  id TEXT PRIMARY KEY,
  public_repo TEXT NOT NULL,
  target_branch TEXT NOT NULL,
  allowed_publish_branches_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  project_id TEXT NOT NULL,
  action TEXT NOT NULL,
  decision TEXT NOT NULL,
  privacy TEXT NOT NULL,
  summary TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  hash TEXT NOT NULL
);
