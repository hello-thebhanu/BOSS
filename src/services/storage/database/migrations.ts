export type SqlMigration = { version: number; name: string; sql: string };
/** Migrations are append-only. The native runner records version numbers in schema_migrations. */
export const migrations: readonly SqlMigration[] = [{ version: 1, name: 'foundation', sql: `
CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL, stack TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, title TEXT NOT NULL, project_id TEXT REFERENCES projects(id) ON DELETE SET NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')), content TEXT NOT NULL, status TEXT NOT NULL, attachments_json TEXT NOT NULL DEFAULT '[]', tool_calls_json TEXT NOT NULL DEFAULT '[]', metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE SET NULL, started_at TEXT NOT NULL, ended_at TEXT, context_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS agent_actions (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, action TEXT NOT NULL, status TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tool_executions (id TEXT PRIMARY KEY, session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL, tool_name TEXT NOT NULL, status TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS memory_items (id TEXT PRIMARY KEY, category TEXT NOT NULL, content TEXT NOT NULL, source TEXT, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS permissions_audit (id TEXT PRIMARY KEY, action TEXT NOT NULL, capability TEXT NOT NULL, target TEXT, decision TEXT NOT NULL, session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_conversations_project_updated ON conversations(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_actions_session_created ON agent_actions(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_permissions_audit_created ON permissions_audit(created_at DESC);` }, { version: 2, name: 'permission_grants', sql: `
CREATE TABLE IF NOT EXISTS permission_grants (
  capability TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  decision TEXT NOT NULL CHECK(decision IN ('ALLOWED_ALWAYS')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (capability, target)
);` }];

export interface MigrationDriver { executedVersions(): Promise<readonly number[]>; execute(sql: string): Promise<void>; recordVersion(migration: SqlMigration): Promise<void>; }
export async function applyMigrations(driver: MigrationDriver, source = migrations): Promise<readonly number[]> { const done = new Set(await driver.executedVersions()); const applied: number[] = []; for (const migration of source) { if (!done.has(migration.version)) { await driver.execute(migration.sql); await driver.recordVersion(migration); applied.push(migration.version); } } return applied; }
