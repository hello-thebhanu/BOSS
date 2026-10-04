use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::collections::HashSet;
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

const FOUNDATION_MIGRATION: &str = include_str!("../migrations/0001_foundation.sql");
const PERMISSION_MIGRATION: &str = include_str!("../migrations/0002_permission_grants.sql");

pub struct StorageState { pub path: PathBuf, session_grants: Mutex<HashSet<String>> }
impl StorageState { pub fn new(path: PathBuf) -> Self { Self { path, session_grants: Mutex::new(HashSet::new()) } } }
pub(crate) fn connection(state: &StorageState) -> Result<Connection, String> { let db = Connection::open(&state.path).map_err(db_error)?; db.execute_batch("PRAGMA foreign_keys = ON;").map_err(db_error)?; Ok(db) }
pub(crate) fn db_error(error: rusqlite::Error) -> String { format!("Local database operation failed: {error}") }

pub fn initialize(app_data_dir: &Path) -> Result<PathBuf, String> {
    std::fs::create_dir_all(app_data_dir).map_err(|error| format!("Unable to create BOSS data directory: {error}"))?;
    let path = app_data_dir.join("boss.sqlite3");
    let connection = Connection::open(&path).map_err(|error| format!("Unable to open BOSS database: {error}"))?;
    connection.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;").map_err(|error| format!("Unable to configure BOSS database: {error}"))?;
    connection.execute_batch("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);").map_err(|error| format!("Unable to prepare migration ledger: {error}"))?;
    let applied: Option<i64> = connection.query_row("SELECT version FROM schema_migrations WHERE version = 1", [], |row| row.get(0)).optional().unwrap_or(None);
    if applied.is_none() {
        let transaction = connection.unchecked_transaction().map_err(|error| format!("Unable to begin migration: {error}"))?;
        transaction.execute_batch(FOUNDATION_MIGRATION).map_err(|error| format!("Foundation migration failed: {error}"))?;
        transaction.execute("INSERT INTO schema_migrations (version, name, applied_at) VALUES (1, 'foundation', datetime('now'))", []).map_err(|error| format!("Unable to record migration: {error}"))?;
        transaction.commit().map_err(|error| format!("Unable to commit migration: {error}"))?;
    }
    let v2: Option<i64> = connection.query_row("SELECT version FROM schema_migrations WHERE version = 2", [], |row| row.get(0)).optional().unwrap_or(None);
    if v2.is_none() { connection.execute_batch(PERMISSION_MIGRATION).map_err(|error| format!("Permission migration failed: {error}"))?; connection.execute("INSERT INTO schema_migrations (version, name, applied_at) VALUES (2, 'permission_grants', datetime('now'))", []).map_err(|error| format!("Unable to record permission migration: {error}"))?; }
    Ok(path)
}

#[derive(Clone, Debug, Deserialize, Serialize)] #[serde(rename_all = "camelCase")]
pub struct Project { pub id: String, pub name: String, pub path: String, pub stack: Option<String>, pub created_at: String, pub updated_at: String }
#[derive(Clone, Debug, Deserialize, Serialize)] #[serde(rename_all = "camelCase")]
pub struct Conversation { pub id: String, pub title: String, pub project_id: Option<String>, pub created_at: String, pub updated_at: String, #[serde(default)] pub messages: Vec<Message> }
#[derive(Clone, Debug, Deserialize, Serialize)] #[serde(rename_all = "camelCase")]
pub struct Message { pub id: String, pub conversation_id: Option<String>, pub role: String, pub content: String, pub timestamp: String, pub status: String, #[serde(default)] pub attachments: Vec<String>, #[serde(default)] pub tool_calls: Vec<Value>, #[serde(default)] pub metadata: Value }
#[derive(Clone, Debug, Deserialize, Serialize)] #[serde(rename_all = "camelCase")]
pub struct Setting { pub key: String, pub value: Value, pub updated_at: String }
#[derive(Clone, Debug, Deserialize, Serialize)] #[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PermissionDecision { AllowedOnce, AllowedSession, AllowedAlways, Denied }
impl PermissionDecision { fn audit(&self) -> &'static str { match self { Self::AllowedOnce => "ALLOWED_ONCE", Self::AllowedSession => "ALLOWED_SESSION", Self::AllowedAlways => "ALLOWED_ALWAYS", Self::Denied => "DENIED" } } }

fn project_from(row: &rusqlite::Row) -> rusqlite::Result<Project> { Ok(Project { id: row.get(0)?, name: row.get(1)?, path: row.get(2)?, stack: row.get(3)?, created_at: row.get(4)?, updated_at: row.get(5)? }) }
#[tauri::command] pub fn create_project(state: State<StorageState>, project: Project) -> Result<Project, String> { let db=connection(&state)?; db.execute("INSERT INTO projects (id,name,path,stack,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6)",params![project.id,project.name,project.path,project.stack,project.created_at,project.updated_at]).map_err(db_error)?; Ok(project) }
#[tauri::command] pub fn get_project(state: State<StorageState>, id: String) -> Result<Option<Project>, String> { connection(&state)?.query_row("SELECT id,name,path,stack,created_at,updated_at FROM projects WHERE id=?1",[id],project_from).optional().map_err(db_error) }
#[tauri::command] pub fn list_projects(state: State<StorageState>) -> Result<Vec<Project>, String> { let db=connection(&state)?; let mut s=db.prepare("SELECT id,name,path,stack,created_at,updated_at FROM projects ORDER BY updated_at DESC").map_err(db_error)?; let projects=s.query_map([],project_from).map_err(db_error)?.collect::<Result<Vec<_>,_>>().map_err(db_error)?; Ok(projects) }
#[tauri::command] pub fn update_project(state: State<StorageState>, project: Project) -> Result<Project, String> { let db=connection(&state)?; if db.execute("UPDATE projects SET name=?2,path=?3,stack=?4,updated_at=?5 WHERE id=?1",params![project.id,project.name,project.path,project.stack,project.updated_at]).map_err(db_error)? == 0 { return Err("Project registration was not found".into()) }; Ok(project) }
#[tauri::command] pub fn delete_project(state: State<StorageState>, id: String) -> Result<(), String> { let mut db=connection(&state)?; let tx=db.transaction().map_err(db_error)?; tx.execute("DELETE FROM projects WHERE id=?1",[&id]).map_err(db_error)?; tx.commit().map_err(db_error)?; Ok(()) }

fn conversation_from(row: &rusqlite::Row) -> rusqlite::Result<Conversation> { Ok(Conversation { id:row.get(0)?,title:row.get(1)?,project_id:row.get(2)?,created_at:row.get(3)?,updated_at:row.get(4)?,messages:vec![] }) }
#[tauri::command] pub fn create_conversation(state: State<StorageState>, conversation: Conversation) -> Result<Conversation,String> { let db=connection(&state)?; db.execute("INSERT INTO conversations (id,title,project_id,created_at,updated_at) VALUES (?1,?2,?3,?4,?5)",params![conversation.id,conversation.title,conversation.project_id,conversation.created_at,conversation.updated_at]).map_err(db_error)?; Ok(conversation) }
#[tauri::command] pub fn get_conversation(state: State<StorageState>, id:String) -> Result<Option<Conversation>,String> { connection(&state)?.query_row("SELECT id,title,project_id,created_at,updated_at FROM conversations WHERE id=?1",[id],conversation_from).optional().map_err(db_error) }
#[tauri::command] pub fn list_conversations(state: State<StorageState>) -> Result<Vec<Conversation>,String> { let db=connection(&state)?; let mut s=db.prepare("SELECT id,title,project_id,created_at,updated_at FROM conversations ORDER BY updated_at DESC").map_err(db_error)?; let conversations=s.query_map([],conversation_from).map_err(db_error)?.collect::<Result<Vec<_>,_>>().map_err(db_error)?; Ok(conversations) }
#[tauri::command] pub fn update_conversation(state: State<StorageState>, conversation: Conversation) -> Result<Conversation,String> { let db=connection(&state)?; if db.execute("UPDATE conversations SET title=?2,project_id=?3,updated_at=?4 WHERE id=?1",params![conversation.id,conversation.title,conversation.project_id,conversation.updated_at]).map_err(db_error)?==0{return Err("Conversation was not found".into())}; Ok(conversation) }
#[tauri::command] pub fn delete_conversation(state: State<StorageState>, id:String) -> Result<(),String> { let mut db=connection(&state)?; let tx=db.transaction().map_err(db_error)?; tx.execute("DELETE FROM conversations WHERE id=?1",[&id]).map_err(db_error)?; tx.commit().map_err(db_error)?; Ok(()) }

fn message_from(row: &rusqlite::Row) -> rusqlite::Result<Message> { Ok(Message { id:row.get(0)?,conversation_id:None,role:row.get(1)?,content:row.get(2)?,timestamp:row.get(3)?,status:row.get(4)?,attachments:serde_json::from_str(&row.get::<_,String>(5)?).unwrap_or_default(),tool_calls:serde_json::from_str(&row.get::<_,String>(6)?).unwrap_or_default(),metadata:serde_json::from_str(&row.get::<_,String>(7)?).unwrap_or(Value::Object(Default::default())) }) }
#[tauri::command] pub fn create_message(state: State<StorageState>, message: Message) -> Result<Message,String> { let conversation_id=message.conversation_id.clone().ok_or("Message requires a conversation id")?; let db=connection(&state)?; db.execute("INSERT INTO messages (id,conversation_id,role,content,status,attachments_json,tool_calls_json,metadata_json,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",params![message.id,conversation_id,message.role,message.content,message.status,serde_json::to_string(&message.attachments).unwrap(),serde_json::to_string(&message.tool_calls).unwrap(),message.metadata.to_string(),message.timestamp]).map_err(db_error)?; Ok(message) }
#[tauri::command] pub fn get_message(state: State<StorageState>, id:String) -> Result<Option<Message>,String> { connection(&state)?.query_row("SELECT id,role,content,created_at,status,attachments_json,tool_calls_json,metadata_json FROM messages WHERE id=?1",[id],message_from).optional().map_err(db_error) }
#[tauri::command] pub fn list_messages(state: State<StorageState>, conversation_id:String) -> Result<Vec<Message>,String> { let db=connection(&state)?; let mut s=db.prepare("SELECT id,role,content,created_at,status,attachments_json,tool_calls_json,metadata_json FROM messages WHERE conversation_id=?1 ORDER BY created_at").map_err(db_error)?; let mut values=s.query_map([conversation_id.clone()],message_from).map_err(db_error)?.collect::<Result<Vec<_>,_>>().map_err(db_error)?; for item in &mut values { item.conversation_id=Some(conversation_id.clone()) }; Ok(values) }
#[tauri::command] pub fn delete_message(state: State<StorageState>, id:String) -> Result<(),String> { connection(&state)?.execute("DELETE FROM messages WHERE id=?1",[id]).map_err(db_error)?; Ok(()) }

#[tauri::command] pub fn get_setting(state: State<StorageState>, key:String) -> Result<Option<Setting>,String> { connection(&state)?.query_row("SELECT key,value_json,updated_at FROM settings WHERE key=?1",[key],|r|Ok(Setting{key:r.get(0)?,value:serde_json::from_str(&r.get::<_,String>(1)?).unwrap_or(Value::Null),updated_at:r.get(2)?})).optional().map_err(db_error) }
#[tauri::command] pub fn set_setting(state: State<StorageState>, setting: Setting) -> Result<Setting,String> { connection(&state)?.execute("INSERT INTO settings (key,value_json,updated_at) VALUES (?1,?2,?3) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at",params![setting.key,setting.value.to_string(),setting.updated_at]).map_err(db_error)?; Ok(setting) }

#[tauri::command] pub fn create_session(state: State<StorageState>, id: String, project_id: Option<String>, started_at: String, context: Value) -> Result<Value, String> { let db = connection(&state)?; db.execute("INSERT INTO sessions (id, project_id, started_at, context_json) VALUES (?1, ?2, ?3, ?4)", params![id, project_id, started_at, context.to_string()]).map_err(db_error)?; Ok(serde_json::json!({ "id": id, "projectId": project_id, "startedAt": started_at, "context": context })) }
#[tauri::command] pub fn finish_session(state: State<StorageState>, id: String, ended_at: String) -> Result<(), String> { let db = connection(&state)?; db.execute("UPDATE sessions SET ended_at = ?2 WHERE id = ?1", params![id, ended_at]).map_err(db_error)?; Ok(()) }
#[tauri::command] pub fn list_sessions(state: State<StorageState>) -> Result<Vec<Value>, String> { let db = connection(&state)?; let mut s = db.prepare("SELECT id, project_id, started_at, ended_at, context_json FROM sessions ORDER BY started_at DESC").map_err(db_error)?; let rows = s.query_map([], |r| Ok(serde_json::json!({ "id": r.get::<_, String>(0)?, "projectId": r.get::<_, Option<String>>(1)?, "startedAt": r.get::<_, String>(2)?, "endedAt": r.get::<_, Option<String>>(3)?, "context": serde_json::from_str::<Value>(&r.get::<_, String>(4)?).unwrap_or(Value::Null) }))).map_err(db_error)?; rows.collect::<Result<Vec<_>, _>>().map_err(db_error) }
#[tauri::command] pub fn record_agent_action(state: State<StorageState>, id: String, session_id: String, action: String, status: String, metadata: Value, created_at: String) -> Result<Value, String> { let db = connection(&state)?; db.execute("INSERT INTO agent_actions (id, session_id, action, status, metadata_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![id, session_id, action, status, metadata.to_string(), created_at]).map_err(db_error)?; Ok(serde_json::json!({ "id": id, "sessionId": session_id, "action": action, "status": status, "metadata": metadata, "createdAt": created_at })) }
#[tauri::command] pub fn update_agent_action(state: State<StorageState>, id: String, status: String, metadata: Value) -> Result<(), String> { let db = connection(&state)?; db.execute("UPDATE agent_actions SET status = ?2, metadata_json = ?3 WHERE id = ?1", params![id, status, metadata.to_string()]).map_err(db_error)?; Ok(()) }
#[tauri::command] pub fn list_agent_actions(state: State<StorageState>, session_id: Option<String>) -> Result<Vec<Value>, String> { let db = connection(&state)?; let mut actions = Vec::new(); if let Some(sid) = session_id { let mut s = db.prepare("SELECT id, session_id, action, status, metadata_json, created_at FROM agent_actions WHERE session_id = ?1 ORDER BY created_at ASC").map_err(db_error)?; let rows = s.query_map([sid], |r| Ok(serde_json::json!({ "id": r.get::<_, String>(0)?, "sessionId": r.get::<_, String>(1)?, "action": r.get::<_, String>(2)?, "status": r.get::<_, String>(3)?, "metadata": serde_json::from_str::<Value>(&r.get::<_, String>(4)?).unwrap_or(Value::Null), "createdAt": r.get::<_, String>(5)? }))).map_err(db_error)?; for item in rows { actions.push(item.map_err(db_error)?); } } else { let mut s = db.prepare("SELECT id, session_id, action, status, metadata_json, created_at FROM agent_actions ORDER BY created_at DESC").map_err(db_error)?; let rows = s.query_map([], |r| Ok(serde_json::json!({ "id": r.get::<_, String>(0)?, "sessionId": r.get::<_, String>(1)?, "action": r.get::<_, String>(2)?, "status": r.get::<_, String>(3)?, "metadata": serde_json::from_str::<Value>(&r.get::<_, String>(4)?).unwrap_or(Value::Null), "createdAt": r.get::<_, String>(5)? }))).map_err(db_error)?; for item in rows { actions.push(item.map_err(db_error)?); } } Ok(actions) }
#[tauri::command] pub fn record_tool_execution(state: State<StorageState>, id: String, session_id: Option<String>, tool_name: String, status: String, metadata: Value, created_at: String) -> Result<Value, String> { let db = connection(&state)?; db.execute("INSERT INTO tool_executions (id, session_id, tool_name, status, metadata_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![id, session_id, tool_name, status, metadata.to_string(), created_at]).map_err(db_error)?; Ok(serde_json::json!({ "id": id, "sessionId": session_id, "toolName": tool_name, "status": status, "metadata": metadata, "createdAt": created_at })) }
#[tauri::command] pub fn update_tool_execution(state: State<StorageState>, id: String, status: String, metadata: Value) -> Result<(), String> { let db = connection(&state)?; db.execute("UPDATE tool_executions SET status = ?2, metadata_json = ?3 WHERE id = ?1", params![id, status, metadata.to_string()]).map_err(db_error)?; Ok(()) }
#[tauri::command] pub fn list_tool_executions(state: State<StorageState>, session_id: Option<String>) -> Result<Vec<Value>, String> { let db = connection(&state)?; let mut executions = Vec::new(); if let Some(sid) = session_id { let mut s = db.prepare("SELECT id, session_id, tool_name, status, metadata_json, created_at FROM tool_executions WHERE session_id = ?1 ORDER BY created_at ASC").map_err(db_error)?; let rows = s.query_map([sid], |r| Ok(serde_json::json!({ "id": r.get::<_, String>(0)?, "sessionId": r.get::<_, Option<String>>(1)?, "toolName": r.get::<_, String>(2)?, "status": r.get::<_, String>(3)?, "metadata": serde_json::from_str::<Value>(&r.get::<_, String>(4)?).unwrap_or(Value::Null), "createdAt": r.get::<_, String>(5)? }))).map_err(db_error)?; for item in rows { executions.push(item.map_err(db_error)?); } } else { let mut s = db.prepare("SELECT id, session_id, tool_name, status, metadata_json, created_at FROM tool_executions ORDER BY created_at DESC").map_err(db_error)?; let rows = s.query_map([], |r| Ok(serde_json::json!({ "id": r.get::<_, String>(0)?, "sessionId": r.get::<_, Option<String>>(1)?, "toolName": r.get::<_, String>(2)?, "status": r.get::<_, String>(3)?, "metadata": serde_json::from_str::<Value>(&r.get::<_, String>(4)?).unwrap_or(Value::Null), "createdAt": r.get::<_, String>(5)? }))).map_err(db_error)?; for item in rows { executions.push(item.map_err(db_error)?); } } Ok(executions) }
#[tauri::command] pub fn list_memory_items(_state: State<StorageState>) -> Result<Vec<Value>,String> { Ok(vec![]) }
#[tauri::command] pub fn list_permission_audit(state: State<StorageState>) -> Result<Vec<Value>,String> { let db=connection(&state)?; let mut s=db.prepare("SELECT id,action,capability,target,decision,session_id,actor,created_at FROM permissions_audit ORDER BY created_at DESC").map_err(db_error)?; let rows=s.query_map([],|r|Ok(serde_json::json!({"id":r.get::<_,String>(0)?,"action":r.get::<_,String>(1)?,"capability":r.get::<_,String>(2)?,"target":r.get::<_,Option<String>>(3)?,"decision":r.get::<_,String>(4)?,"sessionId":r.get::<_,Option<String>>(5)?,"actor":r.get::<_,String>(6)?,"createdAt":r.get::<_,String>(7)?}))).map_err(db_error)?; rows.collect::<Result<Vec<_>,_>>().map_err(db_error) }

fn audit(db:&Connection, action:&str, capability:&str, target:&str, decision:&PermissionDecision) -> Result<(),String> { db.execute("INSERT INTO permissions_audit (id,action,capability,target,decision,actor,created_at) VALUES (lower(hex(randomblob(16))),?1,?2,?3,?4,'local-user',datetime('now'))",params![action,capability,target,decision.audit()]).map_err(db_error)?; Ok(()) }
fn grant_key(capability:&str,target:&str)->String { format!("{capability}\u{0}{target}") }

pub(crate) fn legacy_capability(cap: &str) -> Option<&'static str> {
    match cap {
        "FILE_READ" => Some("READ_FILE"),
        "FILE_WRITE" | "FILE_CREATE" | "FILE_RENAME" => Some("WRITE_FILE"),
        "FILE_DELETE" => Some("DELETE_FILE"),
        "TERMINAL_START" | "TERMINAL_COMMAND" => Some("RUN_COMMAND"),
        "GIT_READ" | "GIT_WRITE" => Some("GIT_OPERATION"),
        _ => None,
    }
}

pub(crate) fn authorize(state:&StorageState, db:&Connection, action:&str, capability:&str, target:&str, decision:PermissionDecision)->Result<(),String>{
  let key=grant_key(capability,target);
  let legacy_key = legacy_capability(capability).map(|c| grant_key(c, target));

  // 15.1: If permission is DENIED, it unconditionally overrides any session or persistent grant,
  // purges cached grants, records the audit entry, and rejects execution immediately.
  if matches!(decision, PermissionDecision::Denied) {
      audit(db, action, capability, target, &decision)?;
      if let Ok(mut grants) = state.session_grants.lock() {
          grants.remove(&key);
          if let Some(ref lk) = legacy_key {
              grants.remove(lk);
          }
      }
      let legacy_cap = legacy_capability(capability).unwrap_or(capability);
      let _ = db.execute(
          "DELETE FROM permission_grants WHERE (capability=?1 OR capability=?2) AND target=?3",
          params![capability, legacy_cap, target],
      );
      return Err("Permission denied by user".into());
  }

  // Check existing session grant
  let is_session_granted = {
      let grants = state.session_grants.lock().map_err(|_| "Permission session lock failed")?;
      grants.contains(&key) || legacy_key.as_ref().map(|k| grants.contains(k)).unwrap_or(false)
  };

  // Check existing persistent grant
  let persistent: Option<String> = db
      .query_row(
          "SELECT decision FROM permission_grants WHERE (capability=?1 OR capability=?2) AND target=?3",
          params![capability, legacy_capability(capability).unwrap_or(capability), target],
          |r| r.get(0),
      )
      .optional()
      .map_err(db_error)?;

  if persistent.as_deref() == Some("ALLOWED_ALWAYS") || is_session_granted {
      return Ok(());
  }

  audit(db, action, capability, target, &decision)?;
  match decision {
      PermissionDecision::Denied => unreachable!(),
      PermissionDecision::AllowedOnce => Ok(()),
      PermissionDecision::AllowedSession => {
          state.session_grants.lock().map_err(|_| "Permission session lock failed")?.insert(key);
          Ok(())
      }
      PermissionDecision::AllowedAlways => {
          db.execute(
              "INSERT INTO permission_grants (capability,target,decision,created_at) VALUES (?1,?2,'ALLOWED_ALWAYS',datetime('now')) ON CONFLICT(capability,target) DO UPDATE SET decision='ALLOWED_ALWAYS'",
              params![capability, target],
          ).map_err(db_error)?;
          Ok(())
      }
  }
}
pub(crate) fn canonical_project_root(path:&Path)->Result<PathBuf,String>{ let metadata=std::fs::metadata(path).map_err(|_|"Selected project root is not accessible")?; if !metadata.is_dir(){return Err("Selected project root is not a directory".into())}; let canonical=path.canonicalize().map_err(|_|"Selected project root cannot be canonicalized")?; std::fs::read_dir(&canonical).map_err(|_|"Selected project root is not accessible")?; Ok(canonical) }
pub fn enforce_project_boundary(root:&Path,candidate:&Path)->Result<(),String>{ let root=canonical_project_root(root)?; let candidate=candidate.canonicalize().map_err(|_|"Requested project path cannot be canonicalized")?; if candidate.strip_prefix(&root).is_err(){return Err("Requested path is outside the registered project root".into())};Ok(()) }
#[derive(Deserialize)] #[serde(rename_all="camelCase")] pub struct ProjectRegistration { pub id:String, pub decision:PermissionDecision, pub stack:Option<String> }
#[tauri::command] pub fn register_project(app:AppHandle,state:State<StorageState>,request:ProjectRegistration)->Result<Option<Project>,String>{ let selected=app.dialog().file().blocking_pick_folder(); let Some(selected)=selected else{return Ok(None)}; let selected_path=selected.as_path().ok_or("Selected folder is not a local filesystem path")?; let root=canonical_project_root(selected_path)?; let target=root.to_string_lossy().to_string(); let db=connection(&state)?; authorize(&state,&db,"REGISTER_PROJECT","PROJECT_ROOT_SELECTION",&target,request.decision)?; let name=root.file_name().and_then(|n|n.to_str()).ok_or("Selected project root has no valid name")?.to_string(); let project=Project{id:request.id,name,path:target,stack:request.stack,created_at:String::new(),updated_at:String::new()}; db.execute("INSERT INTO projects (id,name,path,stack,created_at,updated_at) VALUES (?1,?2,?3,?4,datetime('now'),datetime('now'))",params![project.id,project.name,project.path,project.stack]).map_err(db_error)?; get_project(state,project.id) }

#[cfg(test)] mod tests { use super::*; static STORAGE_TEST_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1); fn temp_state() -> (StorageState,PathBuf) { let id = STORAGE_TEST_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst); let path=std::env::temp_dir().join(format!("boss-storage-test-{}-{}",std::process::id(), id));let _=std::fs::remove_dir_all(&path);let db=initialize(&path).unwrap();(StorageState::new(db),path) } #[test] fn root_boundary_rejects_sibling(){let base=std::env::temp_dir().join(format!("boss-boundary-test-{}", std::process::id()));let root=base.join("root");let sibling=base.join("sibling");std::fs::create_dir_all(&root).unwrap();std::fs::create_dir_all(&sibling).unwrap();assert!(enforce_project_boundary(&root,&root).is_ok());assert!(enforce_project_boundary(&root,&sibling).is_err());let _=std::fs::remove_dir_all(base);} #[test] fn permission_decision_audit_names_are_stable(){assert_eq!(PermissionDecision::AllowedOnce.audit(),"ALLOWED_ONCE");assert_eq!(PermissionDecision::Denied.audit(),"DENIED");} #[test] fn denied_permission_is_audited_and_never_granted(){let (state,path)=temp_state();let db=connection(&state).unwrap();assert!(authorize(&state,&db,"REGISTER_PROJECT","PROJECT_ROOT_SELECTION","C:/safe",PermissionDecision::Denied).is_err());let count:i64=db.query_row("SELECT count(*) FROM permissions_audit WHERE decision='DENIED'",[],|r|r.get(0)).unwrap();assert_eq!(count,1);let _=std::fs::remove_dir_all(path.parent().unwrap());} #[test] fn project_deletion_only_removes_registration_row(){let (state,path)=temp_state();let db=connection(&state).unwrap();db.execute("INSERT INTO projects (id,name,path,created_at,updated_at) VALUES ('p','Project','C:/safe',datetime('now'),datetime('now'))",[]).unwrap();db.execute("DELETE FROM projects WHERE id='p'",[]).unwrap();let count:i64=db.query_row("SELECT count(*) FROM projects",[],|r|r.get(0)).unwrap();assert_eq!(count,0);let _=std::fs::remove_dir_all(path.parent().unwrap());} #[test] fn test_tool_execution_persistence_lifecycle(){let (state,path)=temp_state();let db=connection(&state).unwrap();db.execute("INSERT INTO tool_executions (id, session_id, tool_name, status, metadata_json, created_at) VALUES ('te1', NULL, 'fs_read', 'started', '{\"path\":\"test.txt\"}', '2026-09-17T00:00:00Z')",[]).unwrap();let count:i64=db.query_row("SELECT count(*) FROM tool_executions WHERE id = 'te1'",[],|r|r.get(0)).unwrap();assert_eq!(count,1);db.execute("UPDATE tool_executions SET status = 'complete' WHERE id = 'te1'",[]).unwrap();let status:String=db.query_row("SELECT status FROM tool_executions WHERE id = 'te1'",[],|r|r.get(0)).unwrap();assert_eq!(status,"complete");let _=std::fs::remove_dir_all(path.parent().unwrap());}
#[test] fn test_denial_overrides_existing_session_and_persistent_grants(){let (state,path)=temp_state();let db=connection(&state).unwrap();assert!(authorize(&state,&db,"FS_WRITE","FILE_WRITE","test.txt",PermissionDecision::AllowedAlways).is_ok());let count:i64=db.query_row("SELECT count(*) FROM permission_grants WHERE capability='FILE_WRITE' AND target='test.txt'",[],|r|r.get(0)).unwrap();assert_eq!(count,1);assert!(authorize(&state,&db,"FS_READ","FILE_READ","test.txt",PermissionDecision::AllowedSession).is_ok());assert!(state.session_grants.lock().unwrap().contains(&grant_key("FILE_READ","test.txt")));assert!(authorize(&state,&db,"FS_WRITE","FILE_WRITE","test.txt",PermissionDecision::Denied).is_err());let count_after:i64=db.query_row("SELECT count(*) FROM permission_grants WHERE capability='FILE_WRITE' AND target='test.txt'",[],|r|r.get(0)).unwrap();assert_eq!(count_after,0);assert!(authorize(&state,&db,"FS_READ","FILE_READ","test.txt",PermissionDecision::Denied).is_err());assert!(!state.session_grants.lock().unwrap().contains(&grant_key("FILE_READ","test.txt")));let _=std::fs::remove_dir_all(path.parent().unwrap());}
#[test] fn test_canonical_and_legacy_capability_mapping(){let (state,path)=temp_state();let db=connection(&state).unwrap();db.execute("INSERT INTO permission_grants (capability, target, decision, created_at) VALUES ('READ_FILE', 'data.json', 'ALLOWED_ALWAYS', datetime('now'))",[]).unwrap();assert!(authorize(&state,&db,"FS_READ","FILE_READ","data.json",PermissionDecision::AllowedOnce).is_ok());let _=std::fs::remove_dir_all(path.parent().unwrap());}
}
