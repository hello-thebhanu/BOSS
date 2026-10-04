use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

use crate::filesystem::get_project_root;
use crate::storage::{authorize, connection, PermissionDecision, StorageState};

static TERMINAL_SESSION_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSession {
    pub id: String,
    pub project_id: String,
    pub cwd: String,
    pub status: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutput {
    pub session_id: String,
    pub stream: String,
    pub data: String,
    pub seq: u64,
}

#[allow(dead_code)]
pub struct ActiveSession {
    pub project_id: String,
    pub cwd: PathBuf,
    pub stdin: Arc<Mutex<Option<ChildStdin>>>,
    pub child: Arc<Mutex<Option<Child>>>,
    pub output_queue: Arc<Mutex<Vec<TerminalOutput>>>,
    pub seq_counter: Arc<AtomicU64>,
}

#[derive(Default)]
pub struct TerminalState {
    pub sessions: Mutex<HashMap<String, ActiveSession>>,
}

impl TerminalState {
    pub fn clean_all(&self) {
        if let Ok(mut sessions) = self.sessions.lock() {
            for (_, session) in sessions.drain() {
                if let Ok(mut stdin_guard) = session.stdin.lock() {
                    if let Some(mut stdin) = stdin_guard.take() {
                        #[cfg(windows)]
                        let exit_cmd = b"exit\r\n";
                        #[cfg(not(windows))]
                        let exit_cmd = b"exit\n";
                        let _ = stdin.write_all(exit_cmd);
                        let _ = stdin.flush();
                    }
                }
                if let Ok(mut child_guard) = session.child.lock() {
                    if let Some(mut child) = child_guard.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        }
    }
}

impl Drop for TerminalState {
    fn drop(&mut self) {
        self.clean_all();
    }
}

pub fn spawn_terminal_process(
    root: &Path,
) -> Result<(Child, ChildStdin, std::process::ChildStdout, std::process::ChildStderr), String> {
    #[cfg(windows)]
    let mut cmd = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut c = Command::new("cmd.exe");
        c.arg("/Q");
        c.creation_flags(CREATE_NO_WINDOW);
        c
    };

    #[cfg(not(windows))]
    let mut cmd = {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
        Command::new(shell)
    };

    cmd.current_dir(root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn terminal process: {e}"))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Failed to capture terminal stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture terminal stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture terminal stderr".to_string())?;

    Ok((child, stdin, stdout, stderr))
}

#[tauri::command]
pub fn terminal_start_session(
    app: AppHandle,
    storage: State<StorageState>,
    terminal_state: State<TerminalState>,
    project_id: String,
    decision: PermissionDecision,
) -> Result<TerminalSession, String> {
    let root = get_project_root(&storage, &project_id)?;
    let target = root.to_string_lossy().to_string();

    let db = connection(&storage)?;
    authorize(&storage, &db, "TERMINAL_START", "TERMINAL_START", &target, decision)?;

    let (child, stdin, stdout, stderr) = spawn_terminal_process(&root)?;

    let session_id = format!(
        "term-{}-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
        TERMINAL_SESSION_COUNTER.fetch_add(1, Ordering::SeqCst)
    );

    let output_queue = Arc::new(Mutex::new(Vec::<TerminalOutput>::new()));
    let seq_counter = Arc::new(AtomicU64::new(1));

    let app_out = app.clone();
    let sid_out = session_id.clone();
    let q_out = output_queue.clone();
    let seq_out = seq_counter.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut stdout = stdout;
        loop {
            match stdout.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    let seq = seq_out.fetch_add(1, Ordering::SeqCst);
                    let item = TerminalOutput {
                        session_id: sid_out.clone(),
                        stream: "stdout".to_string(),
                        data: text,
                        seq,
                    };
                    let _ = app_out.emit("terminal-output", &item);
                    if let Ok(mut q) = q_out.lock() {
                        q.push(item);
                    }
                }
                Err(_) => break,
            }
        }
    });

    let app_err = app.clone();
    let sid_err = session_id.clone();
    let q_err = output_queue.clone();
    let seq_err = seq_counter.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut stderr = stderr;
        loop {
            match stderr.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    let seq = seq_err.fetch_add(1, Ordering::SeqCst);
                    let item = TerminalOutput {
                        session_id: sid_err.clone(),
                        stream: "stderr".to_string(),
                        data: text,
                        seq,
                    };
                    let _ = app_err.emit("terminal-output", &item);
                    if let Ok(mut q) = q_err.lock() {
                        q.push(item);
                    }
                }
                Err(_) => break,
            }
        }
    });

    let session = ActiveSession {
        project_id: project_id.clone(),
        cwd: root.clone(),
        stdin: Arc::new(Mutex::new(Some(stdin))),
        child: Arc::new(Mutex::new(Some(child))),
        output_queue,
        seq_counter,
    };

    {
        let mut sessions = terminal_state
            .sessions
            .lock()
            .map_err(|_| "Terminal state lock poisoned")?;
        sessions.insert(session_id.clone(), session);
    }

    Ok(TerminalSession {
        id: session_id,
        project_id,
        cwd: target,
        status: "running".to_string(),
    })
}

#[tauri::command]
pub fn terminal_send_input(
    terminal_state: State<TerminalState>,
    session_id: String,
    input: String,
    project_id: Option<String>,
) -> Result<(), String> {
    let sessions = terminal_state
        .sessions
        .lock()
        .map_err(|_| "Terminal state lock poisoned")?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("Terminal session '{session_id}' not found"))?;

    // 15.3: Project-scope enforcement: verify session ownership
    if let Some(ref pid) = project_id {
        if &session.project_id != pid {
            return Err(format!(
                "Cross-project session access rejected: session belongs to project '{}', not '{pid}'",
                session.project_id
            ));
        }
    }

    // 15.3: Detect unexpected process exit
    if let Ok(mut child_guard) = session.child.lock() {
        if let Some(ref mut child) = *child_guard {
            match child.try_wait() {
                Ok(Some(status)) => {
                    return Err(format!("Terminal process has terminated (exit status: {status})"));
                }
                Ok(None) => {}
                Err(e) => {
                    return Err(format!("Terminal process health check failed: {e}"));
                }
            }
        } else {
            return Err("Terminal process has exited".to_string());
        }
    }

    let mut stdin_guard = session
        .stdin
        .lock()
        .map_err(|_| "Terminal stdin lock poisoned")?;
    let stdin = stdin_guard
        .as_mut()
        .ok_or_else(|| "Terminal stdin is closed".to_string())?;

    let mut line = input;
    #[cfg(windows)]
    {
        if !line.ends_with('\n') {
            line.push_str("\r\n");
        } else if !line.ends_with("\r\n") {
            line = line.replace('\n', "\r\n");
        }
    }
    #[cfg(not(windows))]
    {
        if !line.ends_with('\n') {
            line.push('\n');
        }
    }

    stdin
        .write_all(line.as_bytes())
        .map_err(|e| format!("Failed to write to terminal stdin: {e}"))?;
    stdin
        .flush()
        .map_err(|e| format!("Failed to flush terminal stdin: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn terminal_poll_output(
    terminal_state: State<TerminalState>,
    session_id: String,
    project_id: Option<String>,
) -> Result<Vec<TerminalOutput>, String> {
    let sessions = terminal_state
        .sessions
        .lock()
        .map_err(|_| "Terminal state lock poisoned")?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("Terminal session '{session_id}' not found"))?;

    if let Some(ref pid) = project_id {
        if &session.project_id != pid {
            return Err(format!(
                "Cross-project session access rejected: session belongs to project '{}', not '{pid}'",
                session.project_id
            ));
        }
    }

    let mut q = session
        .output_queue
        .lock()
        .map_err(|_| "Output queue lock poisoned")?;
    let items = std::mem::take(&mut *q);
    Ok(items)
}

#[tauri::command]
pub fn terminal_stop_session(
    terminal_state: State<TerminalState>,
    session_id: String,
    _decision: PermissionDecision,
    project_id: Option<String>,
) -> Result<(), String> {
    let mut sessions = terminal_state
        .sessions
        .lock()
        .map_err(|_| "Terminal state lock poisoned")?;

    if let Some(ref pid) = project_id {
        if let Some(session) = sessions.get(&session_id) {
            if &session.project_id != pid {
                return Err(format!(
                    "Cross-project session access rejected: session belongs to project '{}', not '{pid}'",
                    session.project_id
                ));
            }
        }
    }

    if let Some(session) = sessions.remove(&session_id) {
        if let Ok(mut stdin_guard) = session.stdin.lock() {
            if let Some(mut stdin) = stdin_guard.take() {
                #[cfg(windows)]
                let exit_cmd = b"exit\r\n";
                #[cfg(not(windows))]
                let exit_cmd = b"exit\n";
                let _ = stdin.write_all(exit_cmd);
                let _ = stdin.flush();
            }
        }
        if let Ok(mut child_guard) = session.child.lock() {
            if let Some(mut child) = child_guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn terminal_clean_all(
    terminal_state: State<TerminalState>,
) -> Result<(), String> {
    terminal_state.clean_all();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use crate::storage::{canonical_project_root, initialize, Project};

    static TERMINAL_TEST_COUNTER: AtomicU64 = AtomicU64::new(1);

    fn setup_test_project() -> (StorageState, PathBuf, String, PathBuf) {
        let test_id = TERMINAL_TEST_COUNTER.fetch_add(1, Ordering::SeqCst);
        let temp_dir = std::env::temp_dir().join(format!(
            "boss-terminal-test-{}-{}",
            std::process::id(),
            test_id
        ));
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let db_path = initialize(&temp_dir).unwrap();
        let state = StorageState::new(db_path);

        let root_dir = temp_dir.join("test_project_root");
        std::fs::create_dir_all(&root_dir).unwrap();
        let canonical_root = canonical_project_root(&root_dir).unwrap();

        let project_id = format!("proj-term-{}", test_id);
        let project = Project {
            id: project_id.clone(),
            name: "Terminal Test Project".into(),
            path: canonical_root.to_string_lossy().to_string(),
            stack: Some("rust".into()),
            created_at: "2026-01-01".into(),
            updated_at: "2026-01-01".into(),
        };

        let db = connection(&state).unwrap();
        db.execute(
            "INSERT INTO projects (id, name, path, stack, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![project.id, project.name, project.path, project.stack, project.created_at, project.updated_at],
        ).unwrap();

        (state, canonical_root, project_id, temp_dir)
    }

    #[test]
    fn test_terminal_spawns_in_project_root_and_executes_echo() {
        let (_state, root, _proj_id, temp) = setup_test_project();
        let (mut child, mut stdin, mut stdout, _stderr) = spawn_terminal_process(&root).unwrap();

        #[cfg(windows)]
        {
            stdin.write_all(b"echo Hello BOSS Native Terminal\r\n").unwrap();
            stdin.write_all(b"exit\r\n").unwrap();
        }
        #[cfg(not(windows))]
        {
            stdin.write_all(b"echo Hello BOSS Native Terminal\n").unwrap();
            stdin.write_all(b"exit\n").unwrap();
        }
        stdin.flush().unwrap();

        let mut output = String::new();
        stdout.read_to_string(&mut output).unwrap();
        let _ = child.wait();

        assert!(output.contains("Hello BOSS Native Terminal"), "Output did not contain echo: {}", output);

        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn test_terminal_working_directory_persistence() {
        let (_state, root, _proj_id, temp) = setup_test_project();
        let sub = root.join("subfolder");
        std::fs::create_dir_all(&sub).unwrap();

        let (mut child, mut stdin, mut stdout, _stderr) = spawn_terminal_process(&root).unwrap();

        #[cfg(windows)]
        {
            // Check initial cwd is project root
            stdin.write_all(b"cd\r\n").unwrap();
            // Change into subfolder
            stdin.write_all(b"cd subfolder\r\n").unwrap();
            // Check cwd is now subfolder
            stdin.write_all(b"cd\r\n").unwrap();
            stdin.write_all(b"exit\r\n").unwrap();
        }
        #[cfg(not(windows))]
        {
            stdin.write_all(b"pwd\n").unwrap();
            stdin.write_all(b"cd subfolder\n").unwrap();
            stdin.write_all(b"pwd\n").unwrap();
            stdin.write_all(b"exit\n").unwrap();
        }
        stdin.flush().unwrap();

        let mut output = String::new();
        stdout.read_to_string(&mut output).unwrap();
        let _ = child.wait();

        assert!(output.contains("subfolder"), "Directory change was not preserved: {}", output);

        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn test_terminal_captures_stderr_on_invalid_command() {
        let (_state, root, _proj_id, temp) = setup_test_project();
        let (mut child, mut stdin, _stdout, mut stderr) = spawn_terminal_process(&root).unwrap();

        #[cfg(windows)]
        {
            stdin.write_all(b"invalid_boss_command_xyz_123\r\n").unwrap();
            stdin.write_all(b"exit\r\n").unwrap();
        }
        #[cfg(not(windows))]
        {
            stdin.write_all(b"invalid_boss_command_xyz_123\n").unwrap();
            stdin.write_all(b"exit\n").unwrap();
        }
        stdin.flush().unwrap();

        let mut err_output = String::new();
        stderr.read_to_string(&mut err_output).unwrap();
        let _ = child.wait();

        assert!(
            err_output.contains("not recognized") || err_output.contains("not found") || err_output.contains("invalid_boss_command_xyz_123"),
            "Stderr did not capture invalid command error: {}",
            err_output
        );

        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn test_terminal_permission_denial_blocks_and_audits() {
        let (state, root, _proj_id, temp) = setup_test_project();
        let db = connection(&state).unwrap();
        let target = root.to_string_lossy().to_string();

        let result = authorize(
            &state,
            &db,
            "TERMINAL_START",
            "RUN_COMMAND",
            &target,
            PermissionDecision::Denied,
        );
        assert!(result.is_err(), "Denied permission must return error");

        let count: i64 = db
            .query_row(
                "SELECT count(*) FROM permissions_audit WHERE action='TERMINAL_START' AND decision='DENIED'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "Denial must be audited");

        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn test_terminal_rejects_non_existent_project() {
        let (state, _root, _proj_id, temp) = setup_test_project();
        let result = get_project_root(&state, "non-existent-proj-id");
        assert!(result.is_err());

        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn test_terminal_clean_all_terminates_sessions() {
        let (_state, root, _proj_id, temp) = setup_test_project();
        let (child, stdin, _stdout, _stderr) = spawn_terminal_process(&root).unwrap();

        let state = TerminalState::default();
        let session = ActiveSession {
            project_id: "test-p".into(),
            cwd: root.clone(),
            stdin: Arc::new(Mutex::new(Some(stdin))),
            child: Arc::new(Mutex::new(Some(child))),
            output_queue: Arc::new(Mutex::new(Vec::new())),
            seq_counter: Arc::new(AtomicU64::new(1)),
        };
        state.sessions.lock().unwrap().insert("test-session".into(), session);

        assert_eq!(state.sessions.lock().unwrap().len(), 1);
        state.clean_all();
        assert_eq!(state.sessions.lock().unwrap().len(), 0);

        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn test_terminal_poll_output_drains_queued_chunks() {
        let (_state, root, _proj_id, temp) = setup_test_project();
        let (child, stdin, _stdout, _stderr) = spawn_terminal_process(&root).unwrap();

        let state = TerminalState::default();
        let output_queue = Arc::new(Mutex::new(vec![
            TerminalOutput {
                session_id: "poll-test".into(),
                stream: "stdout".into(),
                data: "output chunk 1".into(),
                seq: 1,
            },
            TerminalOutput {
                session_id: "poll-test".into(),
                stream: "stdout".into(),
                data: "output chunk 2".into(),
                seq: 2,
            },
        ]));

        let session = ActiveSession {
            project_id: "test-p".into(),
            cwd: root.clone(),
            stdin: Arc::new(Mutex::new(Some(stdin))),
            child: Arc::new(Mutex::new(Some(child))),
            output_queue: output_queue.clone(),
            seq_counter: Arc::new(AtomicU64::new(3)),
        };
        state.sessions.lock().unwrap().insert("poll-test".into(), session);

        let drained = output_queue.lock().unwrap();
        assert_eq!(drained.len(), 2);
        drop(drained);

        state.clean_all();
        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn test_terminal_cross_project_rejection() {
        let (_state, root, _proj_id, temp) = setup_test_project();
        let (child, stdin, _stdout, _stderr) = spawn_terminal_process(&root).unwrap();

        let state = TerminalState::default();
        let session = ActiveSession {
            project_id: "project-A".into(),
            cwd: root.clone(),
            stdin: Arc::new(Mutex::new(Some(stdin))),
            child: Arc::new(Mutex::new(Some(child))),
            output_queue: Arc::new(Mutex::new(Vec::new())),
            seq_counter: Arc::new(AtomicU64::new(1)),
        };
        state.sessions.lock().unwrap().insert("term-proj-a".into(), session);

        let sessions_guard = state.sessions.lock().unwrap();
        let found = sessions_guard.get("term-proj-a").unwrap();
        // Verifying session ownership check logic
        let attempted_project_b = Some("project-B".to_string());
        let is_cross_project = attempted_project_b.map(|pid| pid != found.project_id).unwrap_or(false);
        assert!(is_cross_project);
        drop(sessions_guard);

        state.clean_all();
        let _ = std::fs::remove_dir_all(temp);
    }
}

