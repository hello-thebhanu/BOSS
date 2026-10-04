//! Deliberately narrow desktop command boundary. Commands are added only with path validation and permission checks.
mod storage;
mod filesystem;
mod terminal;
mod git;
mod platform;
mod credentials;
use tauri::Manager;
#[tauri::command]
fn app_version() -> &'static str { env!("CARGO_PKG_VERSION") }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default().plugin(tauri_plugin_dialog::init()).setup(|app| {
    let data_dir = app.path().app_data_dir().map_err(|error| Box::<dyn std::error::Error>::from(error))?;
    let state = storage::StorageState::new(storage::initialize(&data_dir).map_err(Box::<dyn std::error::Error>::from)?);
    app.manage(state);
    app.manage(terminal::TerminalState::default());
    app.manage(credentials::CredentialState::default());
    Ok(())
  }).on_window_event(|window, event| {
    if matches!(event, tauri::WindowEvent::Destroyed | tauri::WindowEvent::CloseRequested { .. }) {
      let terminal_state = window.state::<terminal::TerminalState>();
      terminal_state.clean_all();
    }
  }).invoke_handler(tauri::generate_handler![app_version, platform::get_platform_info,
    credentials::credential_store, credentials::credential_get, credentials::credential_has, credentials::credential_delete,
    storage::create_project, storage::get_project, storage::list_projects, storage::update_project, storage::delete_project,
    storage::create_conversation, storage::get_conversation, storage::list_conversations, storage::update_conversation, storage::delete_conversation,
    storage::create_message, storage::get_message, storage::list_messages, storage::delete_message,
    storage::get_setting, storage::set_setting, storage::list_sessions, storage::create_session, storage::finish_session, storage::list_agent_actions, storage::record_agent_action, storage::update_agent_action, storage::list_tool_executions, storage::record_tool_execution, storage::update_tool_execution,
    storage::list_memory_items, storage::list_permission_audit, storage::register_project,
    filesystem::fs_list_directory, filesystem::fs_read_file, filesystem::fs_write_file,
    filesystem::fs_create_directory, filesystem::fs_rename, filesystem::fs_remove,
    terminal::terminal_start_session, terminal::terminal_send_input, terminal::terminal_stop_session, terminal::terminal_poll_output, terminal::terminal_clean_all,
    git::git_status, git::git_branches, git::git_diff, git::git_log, git::git_stage, git::git_unstage, git::git_commit, git::git_checkout
  ]).run(tauri::generate_context!()).expect("error while running BOSS");
}
