const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function privacyRank(value) {
  switch (value) {
    case "public":
      return 0;
    case "internal":
      return 1;
    case "private":
      return 2;
    case "secret":
      return 3;
    case "do_not_prompt":
      return 4;
    default:
      return 1;
  }
}

function allowedPrivacy(maxPrivacy) {
  const max = privacyRank(maxPrivacy || "internal");
  return ["public", "internal", "private"].filter((level) => privacyRank(level) <= max);
}

function openDatabase(payload) {
  if (!payload.dbPath) {
    throw new Error("dbPath is required");
  }
  const dbPath = String(payload.dbPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath, { open: true, readOnly: false });
  if (payload.schema) {
    const schema = typeof payload.schema === "object" && payload.schema.value ? payload.schema.value : payload.schema;
    db.exec(String(schema));
    db.prepare("INSERT OR IGNORE INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)").run(1, "initial_schema", new Date().toISOString());
  }
  return db;
}

function insertMemory(db, record) {
  db.prepare(`
    INSERT INTO memory_records (
      id, schema_version, project_id, kind, title, content, privacy,
      confidence, importance, source_agent, tags_json, related_files_json,
      metadata_json, content_hash, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.schemaVersion,
    record.projectID,
    record.kind,
    record.title,
    record.content,
    record.privacy,
    record.confidence,
    record.importance,
    record.sourceAgent,
    JSON.stringify(record.tags || []),
    JSON.stringify(record.relatedFiles || []),
    JSON.stringify(record.metadata || {}),
    record.contentHash,
    record.createdAt,
    record.updatedAt
  );
}

function searchMemory(db, payload) {
  const levels = allowedPrivacy(payload.privacyMax);
  const query = `%${String(payload.query || "").toLowerCase()}%`;
  const placeholders = levels.map(() => "?").join(", ");
  const sql = `
    SELECT id, schema_version, project_id, kind, title, content, privacy,
      confidence, importance, source_agent, tags_json, related_files_json,
      metadata_json, content_hash, created_at, updated_at
    FROM memory_records
    WHERE privacy IN (${placeholders})
      AND privacy NOT IN ('secret', 'do_not_prompt')
      AND (lower(title) LIKE ? OR lower(content) LIKE ? OR lower(tags_json) LIKE ?)
    ORDER BY importance DESC, updated_at DESC
    LIMIT ?
  `;
  const rows = db.prepare(sql).all(...levels, query, query, query, payload.limit || 8);
  return rows.map((row) => ({
    id: row.id,
    schemaVersion: row.schema_version,
    projectID: row.project_id,
    kind: row.kind,
    title: row.title,
    content: row.content,
    privacy: row.privacy,
    confidence: row.confidence,
    importance: row.importance,
    sourceAgent: row.source_agent,
    tags: JSON.parse(row.tags_json || "[]"),
    relatedFiles: JSON.parse(row.related_files_json || "[]"),
    metadata: JSON.parse(row.metadata_json || "{}"),
    contentHash: row.content_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function stats(db) {
  const total = db.prepare("SELECT count(*) AS count FROM memory_records").get().count;
  const byPrivacy = db.prepare("SELECT privacy, count(*) AS count FROM memory_records GROUP BY privacy ORDER BY privacy").all();
  const migrations = db.prepare("SELECT version, name, applied_at FROM schema_migrations ORDER BY version").all();
  return { totalMemoryRecords: total, byPrivacy, migrations };
}

async function main() {
  const payload = JSON.parse(await readStdin());
  const db = openDatabase(payload);
  if (payload.op === "migrate") {
    return respond(db, { ok: true });
  }
  if (payload.op === "insertMemory") {
    insertMemory(db, payload.record);
    return respond(db, { ok: true, id: payload.record.id });
  }
  if (payload.op === "searchMemory") {
    return respond(db, { ok: true, records: searchMemory(db, payload) });
  }
  if (payload.op === "stats") {
    return respond(db, { ok: true, stats: stats(db) });
  }
  db.close();
  throw new Error(`unsupported op: ${payload.op}`);
}

function respond(db, payload) {
  db.close();
  console.log(JSON.stringify(payload));
  process.exit(0);
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
