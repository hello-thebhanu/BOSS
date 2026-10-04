use crate::filesystem::get_project_root;
use crate::storage::{authorize, connection, PermissionDecision, StorageState};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::State;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusEntry {
    pub path: String,
    pub state: String,
    pub staged: bool,
    pub unstaged: bool,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub is_repository: bool,
    pub branch: Option<String>,
    pub entries: Vec<GitStatusEntry>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub id: String,
    pub summary: String,
    pub author: String,
    pub timestamp: String,
}

fn create_git_command(root: &Path, args: &[&str]) -> Command {
    let mut cmd = Command::new("git");
    cmd.current_dir(root);
    cmd.args(args);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

fn run_git_command(root: &Path, args: &[&str]) -> Result<std::process::Output, String> {
    let mut cmd = create_git_command(root, args);
    match cmd.output() {
        Ok(output) => Ok(output),
        Err(err) => {
            if err.kind() == std::io::ErrorKind::NotFound {
                Err("Git executable not found in PATH. Please install Git.".to_string())
            } else {
                Err(format!("Failed to execute git command: {err}"))
            }
        }
    }
}

pub fn is_git_repository(root: &Path) -> bool {
    if !root.join(".git").exists() {
        if let Ok(output) = run_git_command(root, &["rev-parse", "--show-toplevel"]) {
            if output.status.success() {
                let toplevel_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let toplevel_path = PathBuf::from(&toplevel_str);
                if let (Ok(c_toplevel), Ok(c_root)) = (toplevel_path.canonicalize(), root.canonicalize()) {
                    if c_toplevel == c_root {
                        return true;
                    }
                }
                let norm_toplevel = toplevel_str.replace('\\', "/").trim_end_matches('/').to_lowercase();
                let norm_root = root.to_string_lossy().replace('\\', "/").trim_end_matches('/').to_lowercase();
                if norm_toplevel == norm_root {
                    return true;
                }
            }
        }
        return false;
    }

    if let Ok(output) = run_git_command(root, &["rev-parse", "--is-inside-work-tree"]) {
        return output.status.success() && String::from_utf8_lossy(&output.stdout).trim() == "true";
    }
    false
}

fn get_current_branch(root: &Path) -> Option<String> {
    if let Ok(output) = run_git_command(root, &["branch", "--show-current"]) {
        if output.status.success() {
            let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !branch.is_empty() {
                return Some(branch);
            }
        }
    }

    if let Ok(output) = run_git_command(root, &["rev-parse", "--abbrev-ref", "HEAD"]) {
        if output.status.success() {
            let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !branch.is_empty() && branch != "HEAD" {
                return Some(branch);
            }
        }
    }
    None
}

fn parse_git_status_porcelain(output: &str) -> Vec<GitStatusEntry> {
    let mut entries = Vec::new();
    for line in output.lines() {
        if line.len() < 3 {
            continue;
        }
        let index_code = line.chars().nth(0).unwrap_or(' ');
        let worktree_code = line.chars().nth(1).unwrap_or(' ');
        let raw_path = line.get(3..).unwrap_or("").trim();
        let path = if let Some((_old, new_p)) = raw_path.split_once(" -> ") {
            new_p.trim_matches('"').to_string()
        } else {
            raw_path.trim_matches('"').to_string()
        };

        if path.is_empty() {
            continue;
        }

        if index_code == '?' && worktree_code == '?' {
            entries.push(GitStatusEntry {
                path,
                state: "untracked".to_string(),
                staged: false,
                unstaged: true,
            });
            continue;
        }

        if index_code != ' ' && index_code != '?' {
            let state = match index_code {
                'M' => "modified",
                'A' => "added",
                'D' => "deleted",
                'R' => "renamed",
                'C' => "copied",
                'U' => "conflicted",
                _ => "staged",
            };
            entries.push(GitStatusEntry {
                path: path.clone(),
                state: state.to_string(),
                staged: true,
                unstaged: false,
            });
        }

        if worktree_code != ' ' && worktree_code != '?' {
            let state = match worktree_code {
                'M' => "modified",
                'D' => "deleted",
                'U' => "conflicted",
                _ => "modified",
            };
            entries.push(GitStatusEntry {
                path,
                state: state.to_string(),
                staged: false,
                unstaged: true,
            });
        }
    }
    entries
}

fn validate_relative_path(root: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let clean = rel_path.trim().replace('\\', "/");
    if clean.is_empty() {
        return Err("Path cannot be empty".to_string());
    }
    if clean.contains(':') || clean.starts_with('/') || clean.starts_with('\\') {
        return Err("Absolute paths are not permitted".to_string());
    }
    for component in clean.split('/') {
        if component == ".." {
            return Err("Path traversal (..) is not permitted".to_string());
        }
    }
    let target = root.join(&clean);
    if target.exists() {
        crate::storage::enforce_project_boundary(root, &target)?;
    }
    Ok(target)
}

fn validate_branch_name(branch: &str) -> Result<&str, String> {
    let trimmed = branch.trim();
    if trimmed.is_empty() {
        return Err("Branch name cannot be empty".to_string());
    }
    if trimmed.starts_with('-') {
        return Err("Invalid branch name".to_string());
    }
    if trimmed.contains(|c: char| c.is_whitespace() || c == '~' || c == '^' || c == ':' || c == '\\') {
        return Err("Branch name contains invalid characters".to_string());
    }
    Ok(trimmed)
}

pub fn git_status_impl(
    storage: &StorageState,
    project_id: &str,
    decision: PermissionDecision,
) -> Result<GitStatus, String> {
    let root = get_project_root(storage, project_id)?;
    let target = root.to_string_lossy().to_string();

    let db = connection(storage)?;
    authorize(storage, &db, "GIT_STATUS", "GIT_READ", &target, decision)?;

    if !is_git_repository(&root) {
        return Ok(GitStatus {
            is_repository: false,
            branch: None,
            entries: vec![],
        });
    }

    let branch = get_current_branch(&root);
    let output = run_git_command(&root, &["status", "--porcelain=v1", "-uall"])?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if err_msg.is_empty() {
            "Git status command failed".to_string()
        } else {
            err_msg
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let entries = parse_git_status_porcelain(&stdout);

    Ok(GitStatus {
        is_repository: true,
        branch,
        entries,
    })
}

pub fn git_branches_impl(
    storage: &StorageState,
    project_id: &str,
    decision: PermissionDecision,
) -> Result<Vec<String>, String> {
    let root = get_project_root(storage, project_id)?;
    let target = root.to_string_lossy().to_string();

    let db = connection(storage)?;
    authorize(storage, &db, "GIT_BRANCHES", "GIT_READ", &target, decision)?;

    if !is_git_repository(&root) {
        return Ok(vec![]);
    }

    let output = run_git_command(&root, &["for-each-ref", "--format=%(refname:short)", "refs/heads/"])?;
    if !output.status.success() {
        return Ok(get_current_branch(&root).into_iter().collect());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut branches: Vec<String> = stdout
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    if branches.is_empty() {
        if let Some(cur) = get_current_branch(&root) {
            branches.push(cur);
        }
    }

    Ok(branches)
}

pub fn git_diff_impl(
    storage: &StorageState,
    project_id: &str,
    path: Option<&str>,
    staged: Option<bool>,
    decision: PermissionDecision,
) -> Result<String, String> {
    let root = get_project_root(storage, project_id)?;
    let target = root.to_string_lossy().to_string();

    let db = connection(storage)?;
    authorize(storage, &db, "GIT_DIFF", "GIT_READ", &target, decision)?;

    if !is_git_repository(&root) {
        return Err("Project is not a Git repository".to_string());
    }

    let mut args = vec!["diff"];
    let is_staged = staged.unwrap_or(false);
    if is_staged {
        args.push("--cached");
    }

    let validated_rel: Option<String>;
    if let Some(p) = path {
        let trimmed = p.trim();
        if !trimmed.is_empty() {
            let _ = validate_relative_path(&root, trimmed)?;
            validated_rel = Some(trimmed.replace('\\', "/"));
        } else {
            validated_rel = None;
        }
    } else {
        validated_rel = None;
    }

    if let Some(ref rel) = validated_rel {
        args.push("--");
        args.push(rel.as_str());
    }

    let output = run_git_command(&root, &args)?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if err_msg.is_empty() {
            "Git diff command failed".to_string()
        } else {
            err_msg
        });
    }

    let diff_text = String::from_utf8_lossy(&output.stdout).to_string();

    if diff_text.is_empty() && !is_staged {
        if let Some(ref rel) = validated_rel {
            let file_path = root.join(rel);
            if file_path.is_file() {
                if let Ok(content) = std::fs::read_to_string(&file_path) {
                    let mut synthetic = format!("--- /dev/null\n+++ b/{rel}\n@@ -0,0 +1,{} @@\n", content.lines().count());
                    for line in content.lines() {
                        synthetic.push('+');
                        synthetic.push_str(line);
                        synthetic.push('\n');
                    }
                    return Ok(synthetic);
                }
            }
        }
    }

    Ok(diff_text)
}

pub fn git_log_impl(
    storage: &StorageState,
    project_id: &str,
    limit: Option<u32>,
    decision: PermissionDecision,
) -> Result<Vec<GitCommit>, String> {
    let root = get_project_root(storage, project_id)?;
    let target = root.to_string_lossy().to_string();

    let db = connection(storage)?;
    authorize(storage, &db, "GIT_LOG", "GIT_READ", &target, decision)?;

    if !is_git_repository(&root) {
        return Ok(vec![]);
    }

    let max_count = limit.unwrap_or(50).to_string();
    let limit_arg = format!("-n{max_count}");
    let output = run_git_command(
        &root,
        &["log", &limit_arg, "--pretty=format:%H%x1f%s%x1f%an%x1f%cI"],
    )?;

    if !output.status.success() {
        return Ok(vec![]);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut commits = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\x1f').collect();
        if parts.len() >= 4 {
            commits.push(GitCommit {
                id: parts[0].to_string(),
                summary: parts[1].to_string(),
                author: parts[2].to_string(),
                timestamp: parts[3].to_string(),
            });
        }
    }

    Ok(commits)
}

pub fn git_stage_impl(
    storage: &StorageState,
    project_id: &str,
    paths: &[String],
    decision: PermissionDecision,
) -> Result<(), String> {
    let root = get_project_root(storage, project_id)?;
    let target = root.to_string_lossy().to_string();

    let db = connection(storage)?;
    authorize(storage, &db, "GIT_STAGE", "GIT_WRITE", &target, decision)?;

    if !is_git_repository(&root) {
        return Err("Project is not a Git repository".to_string());
    }

    if paths.is_empty() {
        return Ok(());
    }

    let mut valid_paths = Vec::new();
    for p in paths {
        let _ = validate_relative_path(&root, p)?;
        valid_paths.push(p.replace('\\', "/"));
    }

    let mut args = vec!["add", "-A", "--"];
    for p in &valid_paths {
        args.push(p.as_str());
    }

    let output = run_git_command(&root, &args)?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if err_msg.is_empty() {
            "Git add command failed".to_string()
        } else {
            err_msg
        });
    }

    Ok(())
}

pub fn git_unstage_impl(
    storage: &StorageState,
    project_id: &str,
    paths: &[String],
    decision: PermissionDecision,
) -> Result<(), String> {
    let root = get_project_root(storage, project_id)?;
    let target = root.to_string_lossy().to_string();

    let db = connection(storage)?;
    authorize(storage, &db, "GIT_UNSTAGE", "GIT_WRITE", &target, decision)?;

    if !is_git_repository(&root) {
        return Err("Project is not a Git repository".to_string());
    }

    if paths.is_empty() {
        return Ok(());
    }

    let mut valid_paths = Vec::new();
    for p in paths {
        let _ = validate_relative_path(&root, p)?;
        valid_paths.push(p.replace('\\', "/"));
    }

    let mut restore_args = vec!["restore", "--staged", "--"];
    for p in &valid_paths {
        restore_args.push(p.as_str());
    }

    let output = run_git_command(&root, &restore_args)?;
    if output.status.success() {
        return Ok(());
    }

    let mut reset_args = vec!["reset", "HEAD", "--"];
    for p in &valid_paths {
        reset_args.push(p.as_str());
    }
    let reset_output = run_git_command(&root, &reset_args)?;
    if reset_output.status.success() {
        return Ok(());
    }

    let mut rm_args = vec!["rm", "--cached", "-r", "--"];
    for p in &valid_paths {
        rm_args.push(p.as_str());
    }
    let rm_output = run_git_command(&root, &rm_args)?;
    if rm_output.status.success() {
        return Ok(());
    }

    let err_msg = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if err_msg.is_empty() {
        "Failed to unstage files".to_string()
    } else {
        err_msg
    })
}

pub fn git_commit_impl(
    storage: &StorageState,
    project_id: &str,
    message: &str,
    decision: PermissionDecision,
) -> Result<String, String> {
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Err("Commit message cannot be empty or whitespace-only.".to_string());
    }

    let root = get_project_root(storage, project_id)?;
    let target = root.to_string_lossy().to_string();

    let db = connection(storage)?;
    authorize(storage, &db, "GIT_COMMIT", "GIT_WRITE", &target, decision)?;

    if !is_git_repository(&root) {
        return Err("Project is not a Git repository".to_string());
    }

    let output = run_git_command(&root, &["commit", "-m", trimmed])?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let out_msg = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Err(if !err_msg.is_empty() {
            err_msg
        } else if !out_msg.is_empty() {
            out_msg
        } else {
            "Git commit failed".to_string()
        });
    }

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(result)
}

pub fn git_checkout_impl(
    storage: &StorageState,
    project_id: &str,
    branch: &str,
    decision: PermissionDecision,
) -> Result<(), String> {
    let valid_branch = validate_branch_name(branch)?;

    let root = get_project_root(storage, project_id)?;
    let target = root.to_string_lossy().to_string();

    let db = connection(storage)?;
    authorize(storage, &db, "GIT_CHECKOUT", "GIT_WRITE", &target, decision)?;

    if !is_git_repository(&root) {
        return Err("Project is not a Git repository".to_string());
    }

    let output = run_git_command(&root, &["checkout", valid_branch])?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if err_msg.is_empty() {
            format!("Failed to checkout branch '{valid_branch}'")
        } else {
            err_msg
        });
    }

    Ok(())
}

#[tauri::command]
pub fn git_status(
    storage: State<StorageState>,
    project_id: String,
    decision: PermissionDecision,
) -> Result<GitStatus, String> {
    git_status_impl(&storage, &project_id, decision)
}

#[tauri::command]
pub fn git_branches(
    storage: State<StorageState>,
    project_id: String,
    decision: PermissionDecision,
) -> Result<Vec<String>, String> {
    git_branches_impl(&storage, &project_id, decision)
}

#[tauri::command]
pub fn git_diff(
    storage: State<StorageState>,
    project_id: String,
    path: Option<String>,
    staged: Option<bool>,
    decision: PermissionDecision,
) -> Result<String, String> {
    git_diff_impl(&storage, &project_id, path.as_deref(), staged, decision)
}

#[tauri::command]
pub fn git_log(
    storage: State<StorageState>,
    project_id: String,
    limit: Option<u32>,
    decision: PermissionDecision,
) -> Result<Vec<GitCommit>, String> {
    git_log_impl(&storage, &project_id, limit, decision)
}

#[tauri::command]
pub fn git_stage(
    storage: State<StorageState>,
    project_id: String,
    paths: Vec<String>,
    decision: PermissionDecision,
) -> Result<(), String> {
    git_stage_impl(&storage, &project_id, &paths, decision)
}

#[tauri::command]
pub fn git_unstage(
    storage: State<StorageState>,
    project_id: String,
    paths: Vec<String>,
    decision: PermissionDecision,
) -> Result<(), String> {
    git_unstage_impl(&storage, &project_id, &paths, decision)
}

#[tauri::command]
pub fn git_commit(
    storage: State<StorageState>,
    project_id: String,
    message: String,
    decision: PermissionDecision,
) -> Result<String, String> {
    git_commit_impl(&storage, &project_id, &message, decision)
}

#[tauri::command]
pub fn git_checkout(
    storage: State<StorageState>,
    project_id: String,
    branch: String,
    decision: PermissionDecision,
) -> Result<(), String> {
    git_checkout_impl(&storage, &project_id, &branch, decision)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::initialize;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_COUNTER: AtomicU64 = AtomicU64::new(100);

    fn setup_test_env() -> (StorageState, PathBuf) {
        let count = TEST_COUNTER.fetch_add(1, Ordering::SeqCst);
        let temp_dir = std::env::temp_dir().join(format!("boss_git_test_{count}"));
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let db_conn = initialize(&temp_dir).unwrap();
        let state = StorageState::new(db_conn);
        (state, temp_dir)
    }

    fn init_test_git_repo(path: &Path) {
        let _ = run_git_command(path, &["init"]);
        let _ = run_git_command(path, &["config", "user.name", "BOSS Tester"]);
        let _ = run_git_command(path, &["config", "user.email", "tester@boss.local"]);
    }

    #[test]
    fn test_git_detects_non_repository() {
        let (state, temp_dir) = setup_test_env();
        let proj_dir = temp_dir.join("non_git_proj");
        std::fs::create_dir_all(&proj_dir).unwrap();

        let proj_id = {
            let db = connection(&state).unwrap();
            let id = format!("p-{}", TEST_COUNTER.fetch_add(1, Ordering::SeqCst));
            db.execute(
                "INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?1, 'NonGit', ?2, datetime('now'), datetime('now'))",
                rusqlite::params![id, proj_dir.to_string_lossy().to_string()],
            ).unwrap();
            id
        };

        let status = git_status_impl(
            &state,
            &proj_id,
            PermissionDecision::AllowedSession,
        ).unwrap();

        assert!(!status.is_repository);
        assert!(status.branch.is_none());
        assert!(status.entries.is_empty());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_git_detects_repository_and_status() {
        let (state, temp_dir) = setup_test_env();
        let proj_dir = temp_dir.join("git_proj");
        std::fs::create_dir_all(&proj_dir).unwrap();
        init_test_git_repo(&proj_dir);

        let proj_id = {
            let db = connection(&state).unwrap();
            let id = format!("p-{}", TEST_COUNTER.fetch_add(1, Ordering::SeqCst));
            db.execute(
                "INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?1, 'GitProj', ?2, datetime('now'), datetime('now'))",
                rusqlite::params![id, proj_dir.to_string_lossy().to_string()],
            ).unwrap();
            id
        };

        // Create an initial commit so branch has a name
        let init_file = proj_dir.join("README.md");
        std::fs::write(&init_file, "# Test Repo\n").unwrap();
        let _ = run_git_command(&proj_dir, &["add", "README.md"]);
        let _ = run_git_command(&proj_dir, &["commit", "-m", "Initial commit"]);

        // Create an untracked file and a modified file
        std::fs::write(proj_dir.join("untracked.txt"), "hello untracked\n").unwrap();
        std::fs::write(&init_file, "# Test Repo Modified\n").unwrap();

        let status = git_status_impl(
            &state,
            &proj_id,
            PermissionDecision::AllowedSession,
        ).unwrap();

        assert!(status.is_repository);
        assert!(status.branch.is_some());
        assert_eq!(status.entries.len(), 2);

        let paths: Vec<String> = status.entries.iter().map(|e| e.path.clone()).collect();
        assert!(paths.contains(&"untracked.txt".to_string()));
        assert!(paths.contains(&"README.md".to_string()));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_git_stage_unstage_commit_flow() {
        let (state, temp_dir) = setup_test_env();
        let proj_dir = temp_dir.join("git_flow_proj");
        std::fs::create_dir_all(&proj_dir).unwrap();
        init_test_git_repo(&proj_dir);

        let proj_id = {
            let db = connection(&state).unwrap();
            let id = format!("p-{}", TEST_COUNTER.fetch_add(1, Ordering::SeqCst));
            db.execute(
                "INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?1, 'FlowProj', ?2, datetime('now'), datetime('now'))",
                rusqlite::params![id, proj_dir.to_string_lossy().to_string()],
            ).unwrap();
            id
        };

        // Create a new file
        std::fs::write(proj_dir.join("file1.txt"), "content 1\n").unwrap();

        // Stage file1.txt
        git_stage_impl(
            &state,
            &proj_id,
            &["file1.txt".to_string()],
            PermissionDecision::AllowedSession,
        ).unwrap();

        let status1 = git_status_impl(
            &state,
            &proj_id,
            PermissionDecision::AllowedSession,
        ).unwrap();
        let staged_entry = status1.entries.iter().find(|e| e.path == "file1.txt").unwrap();
        assert!(staged_entry.staged);

        // Unstage file1.txt
        git_unstage_impl(
            &state,
            &proj_id,
            &["file1.txt".to_string()],
            PermissionDecision::AllowedSession,
        ).unwrap();

        let status2 = git_status_impl(
            &state,
            &proj_id,
            PermissionDecision::AllowedSession,
        ).unwrap();
        let unstaged_entry = status2.entries.iter().find(|e| e.path == "file1.txt").unwrap();
        assert!(!unstaged_entry.staged);

        // Stage again and commit
        git_stage_impl(
            &state,
            &proj_id,
            &["file1.txt".to_string()],
            PermissionDecision::AllowedSession,
        ).unwrap();

        let commit_res = git_commit_impl(
            &state,
            &proj_id,
            "Phase 12.7 test commit",
            PermissionDecision::AllowedSession,
        ).unwrap();
        assert!(!commit_res.is_empty());

        // Verify status is clean
        let status3 = git_status_impl(
            &state,
            &proj_id,
            PermissionDecision::AllowedSession,
        ).unwrap();
        assert!(status3.entries.is_empty());

        // Verify log contains the commit
        let log = git_log_impl(
            &state,
            &proj_id,
            Some(10),
            PermissionDecision::AllowedSession,
        ).unwrap();
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].summary, "Phase 12.7 test commit");

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_git_commit_validation_rejects_empty_message() {
        let (state, temp_dir) = setup_test_env();
        let proj_dir = temp_dir.join("git_empty_commit_proj");
        std::fs::create_dir_all(&proj_dir).unwrap();
        init_test_git_repo(&proj_dir);

        let proj_id = {
            let db = connection(&state).unwrap();
            let id = format!("p-{}", TEST_COUNTER.fetch_add(1, Ordering::SeqCst));
            db.execute(
                "INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?1, 'EmptyCommit', ?2, datetime('now'), datetime('now'))",
                rusqlite::params![id, proj_dir.to_string_lossy().to_string()],
            ).unwrap();
            id
        };

        let res = git_commit_impl(
            &state,
            &proj_id,
            "   \n  \t  ",
            PermissionDecision::AllowedSession,
        );
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("empty or whitespace-only"));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_git_branches_and_checkout() {
        let (state, temp_dir) = setup_test_env();
        let proj_dir = temp_dir.join("git_branch_proj");
        std::fs::create_dir_all(&proj_dir).unwrap();
        init_test_git_repo(&proj_dir);

        let proj_id = {
            let db = connection(&state).unwrap();
            let id = format!("p-{}", TEST_COUNTER.fetch_add(1, Ordering::SeqCst));
            db.execute(
                "INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?1, 'BranchProj', ?2, datetime('now'), datetime('now'))",
                rusqlite::params![id, proj_dir.to_string_lossy().to_string()],
            ).unwrap();
            id
        };

        std::fs::write(proj_dir.join("init.txt"), "hello\n").unwrap();
        let _ = run_git_command(&proj_dir, &["add", "init.txt"]);
        let _ = run_git_command(&proj_dir, &["commit", "-m", "First commit"]);

        // Create feature branch
        let _ = run_git_command(&proj_dir, &["branch", "feature-test"]);

        let branches = git_branches_impl(
            &state,
            &proj_id,
            PermissionDecision::AllowedSession,
        ).unwrap();
        assert!(branches.contains(&"feature-test".to_string()));

        // Checkout feature-test
        git_checkout_impl(
            &state,
            &proj_id,
            "feature-test",
            PermissionDecision::AllowedSession,
        ).unwrap();

        let status = git_status_impl(
            &state,
            &proj_id,
            PermissionDecision::AllowedSession,
        ).unwrap();
        assert_eq!(status.branch.as_deref(), Some("feature-test"));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_git_permission_denial_is_blocked_and_audited() {
        let (state, temp_dir) = setup_test_env();
        let proj_dir = temp_dir.join("git_perm_proj");
        std::fs::create_dir_all(&proj_dir).unwrap();
        init_test_git_repo(&proj_dir);

        let proj_id = {
            let db = connection(&state).unwrap();
            let id = format!("p-{}", TEST_COUNTER.fetch_add(1, Ordering::SeqCst));
            db.execute(
                "INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?1, 'PermProj', ?2, datetime('now'), datetime('now'))",
                rusqlite::params![id, proj_dir.to_string_lossy().to_string()],
            ).unwrap();
            id
        };

        let err = git_status_impl(
            &state,
            &proj_id,
            PermissionDecision::Denied,
        ).unwrap_err();

        assert!(err.contains("Permission denied"));

        let count: i64 = {
            let db = connection(&state).unwrap();
            db.query_row(
                "SELECT count(*) FROM permissions_audit WHERE action='GIT_STATUS' AND decision='DENIED'",
                [],
                |r| r.get(0),
            ).unwrap()
        };
        assert_eq!(count, 1);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_git_project_isolation() {
        let (state, temp_dir) = setup_test_env();
        let proj_a_dir = temp_dir.join("proj_a");
        let proj_b_dir = temp_dir.join("proj_b");
        std::fs::create_dir_all(&proj_a_dir).unwrap();
        std::fs::create_dir_all(&proj_b_dir).unwrap();

        init_test_git_repo(&proj_a_dir);
        // proj_b is NOT a git repo

        let (proj_a_id, proj_b_id) = {
            let db = connection(&state).unwrap();
            let a_id = format!("p-{}", TEST_COUNTER.fetch_add(1, Ordering::SeqCst));
            let b_id = format!("p-{}", TEST_COUNTER.fetch_add(1, Ordering::SeqCst));
            db.execute(
                "INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?1, 'ProjA', ?2, datetime('now'), datetime('now'))",
                rusqlite::params![a_id, proj_a_dir.to_string_lossy().to_string()],
            ).unwrap();
            db.execute(
                "INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?1, 'ProjB', ?2, datetime('now'), datetime('now'))",
                rusqlite::params![b_id, proj_b_dir.to_string_lossy().to_string()],
            ).unwrap();
            (a_id, b_id)
        };

        let status_a = git_status_impl(
            &state,
            &proj_a_id,
            PermissionDecision::AllowedSession,
        ).unwrap();
        assert!(status_a.is_repository);

        let status_b = git_status_impl(
            &state,
            &proj_b_id,
            PermissionDecision::AllowedSession,
        ).unwrap();
        assert!(!status_b.is_repository);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
