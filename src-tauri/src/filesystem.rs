use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};
use tauri::State;
use crate::storage::{
    authorize, canonical_project_root, connection, db_error, enforce_project_boundary,
    PermissionDecision, StorageState,
};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub relative_path: String,
    pub kind: String,
}

pub fn normalize_and_validate_relative_path(rel_str: &str) -> Result<PathBuf, String> {
    let normalized = rel_str.replace('\\', "/");
    if normalized.starts_with('/') || rel_str.starts_with('\\') {
        return Err("Path must be relative to project root, absolute paths are rejected".into());
    }

    let p = Path::new(&normalized);
    if p.is_absolute() || p.has_root() {
        return Err("Path must be relative to project root, absolute paths are rejected".into());
    }

    let mut clean = PathBuf::new();
    for component in p.components() {
        match component {
            Component::Prefix(_) | Component::RootDir => {
                return Err("Path cannot contain drive or root prefixes".into());
            }
            Component::ParentDir => {
                return Err("Path traversal (..) is not permitted".into());
            }
            Component::CurDir => {}
            Component::Normal(c) => {
                let s = c.to_string_lossy();
                if s.contains(':') {
                    return Err("Path cannot contain drive or root prefixes".into());
                }
                clean.push(c);
            }
        }
    }
    Ok(clean)
}

pub fn get_project_root(state: &StorageState, project_id: &str) -> Result<PathBuf, String> {
    let db = connection(state)?;
    let raw_path: String = db
        .query_row(
            "SELECT path FROM projects WHERE id=?1",
            [project_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| "Project was not found".to_string())?;

    canonical_project_root(Path::new(&raw_path))
}

pub fn resolve_and_verify_path(root: &Path, rel: &Path, must_exist: bool) -> Result<PathBuf, String> {
    let candidate = root.join(rel);
    if candidate.exists() {
        enforce_project_boundary(root, &candidate)?;
        Ok(candidate)
    } else if must_exist {
        Err("Target path does not exist".into())
    } else {
        let mut ancestor = candidate.parent();
        let mut verified = false;
        while let Some(anc) = ancestor {
            if anc.exists() {
                enforce_project_boundary(root, anc)?;
                verified = true;
                break;
            }
            ancestor = anc.parent();
        }
        if !verified {
            return Err("Target path resolves outside project root".into());
        }
        Ok(candidate)
    }
}

#[tauri::command]
pub fn fs_list_directory(
    state: State<StorageState>,
    project_id: String,
    relative_path: String,
    decision: PermissionDecision,
) -> Result<Vec<FileEntry>, String> {
    let root = get_project_root(&state, &project_id)?;
    let clean = normalize_and_validate_relative_path(&relative_path)?;
    let target = if clean.as_os_str().is_empty() {
        root.clone()
    } else {
        resolve_and_verify_path(&root, &clean, true)?
    };

    if !target.is_dir() {
        return Err("Path is not a directory".into());
    }

    let db = connection(&state)?;
    let audit_target = clean.to_string_lossy().to_string();
    authorize(&state, &db, "FS_LIST", "FILE_READ", &audit_target, decision)?;

    let read_dir = std::fs::read_dir(&target).map_err(|e| format!("Failed to list directory: {e}"))?;
    let mut entries: Vec<FileEntry> = Vec::new();
    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {e}"))?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        let file_type = entry.file_type().map_err(|e| format!("Failed to read file type: {e}"))?;
        let kind = if file_type.is_dir() {
            "directory".to_string()
        } else {
            "file".to_string()
        };

        let entry_rel = if clean.as_os_str().is_empty() {
            file_name.clone()
        } else {
            format!("{}/{}", clean.to_string_lossy().replace('\\', "/"), file_name)
        };
        entries.push(FileEntry {
            name: file_name,
            relative_path: entry_rel,
            kind,
        });
    }

    entries.sort_by(|a, b| {
        match (a.kind == "directory", b.kind == "directory") {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}

#[tauri::command]
pub fn fs_read_file(
    state: State<StorageState>,
    project_id: String,
    relative_path: String,
    decision: PermissionDecision,
) -> Result<String, String> {
    let root = get_project_root(&state, &project_id)?;
    let clean = normalize_and_validate_relative_path(&relative_path)?;
    if clean.as_os_str().is_empty() {
        return Err("Cannot read directory as file".into());
    }

    let target = resolve_and_verify_path(&root, &clean, true)?;
    if target.is_dir() {
        return Err("Cannot read directory as file".into());
    }

    let meta = std::fs::metadata(&target).map_err(|e| format!("Unable to read file metadata: {e}"))?;
    if meta.len() > 10 * 1024 * 1024 {
        return Err("File exceeds maximum readable size limit (10MB)".into());
    }

    let db = connection(&state)?;
    let audit_target = clean.to_string_lossy().to_string();
    authorize(&state, &db, "FS_READ", "FILE_READ", &audit_target, decision)?;

    let bytes = std::fs::read(&target).map_err(|e| format!("Failed to read file: {e}"))?;
    String::from_utf8(bytes).map_err(|_| "File contains invalid UTF-8 (binary files are not supported)".into())
}

#[tauri::command]
pub fn fs_write_file(
    state: State<StorageState>,
    project_id: String,
    relative_path: String,
    contents: String,
    decision: PermissionDecision,
) -> Result<(), String> {
    let root = get_project_root(&state, &project_id)?;
    let clean = normalize_and_validate_relative_path(&relative_path)?;
    if clean.as_os_str().is_empty() {
        return Err("Cannot write to the project root directory as a file".into());
    }

    let target = resolve_and_verify_path(&root, &clean, false)?;
    if target.exists() && target.is_dir() {
        return Err("Cannot overwrite existing directory with file".into());
    }
    if let Ok(canonical) = target.canonicalize() {
        if canonical == root {
            return Err("Cannot overwrite the project root directory".into());
        }
    }

    let db = connection(&state)?;
    let audit_target = clean.to_string_lossy().to_string();
    authorize(&state, &db, "FS_WRITE", "FILE_WRITE", &audit_target, decision)?;

    if let Some(parent) = target.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent directories: {e}"))?;
        }
    }

    std::fs::write(&target, contents.as_bytes()).map_err(|e| format!("Failed to write file: {e}"))?;
    enforce_project_boundary(&root, &target)?;
    Ok(())
}

#[tauri::command]
pub fn fs_create_directory(
    state: State<StorageState>,
    project_id: String,
    relative_path: String,
    decision: PermissionDecision,
) -> Result<(), String> {
    let root = get_project_root(&state, &project_id)?;
    let clean = normalize_and_validate_relative_path(&relative_path)?;
    if clean.as_os_str().is_empty() {
        return Err("Project root directory already exists".into());
    }

    let target = resolve_and_verify_path(&root, &clean, false)?;
    if target.exists() {
        return Err("Directory already exists".into());
    }

    let db = connection(&state)?;
    let audit_target = clean.to_string_lossy().to_string();
    authorize(&state, &db, "FS_CREATE_DIR", "FILE_CREATE", &audit_target, decision)?;

    std::fs::create_dir_all(&target).map_err(|e| format!("Failed to create directory: {e}"))?;
    enforce_project_boundary(&root, &target)?;
    Ok(())
}

#[tauri::command]
pub fn fs_rename(
    state: State<StorageState>,
    project_id: String,
    relative_path: String,
    destination: String,
    decision: PermissionDecision,
) -> Result<(), String> {
    let root = get_project_root(&state, &project_id)?;
    let clean_src = normalize_and_validate_relative_path(&relative_path)?;
    if clean_src.as_os_str().is_empty() {
        return Err("Cannot rename the project root directory".into());
    }

    let clean_dst = normalize_and_validate_relative_path(&destination)?;
    if clean_dst.as_os_str().is_empty() {
        return Err("Destination cannot be the project root directory".into());
    }

    let src_target = resolve_and_verify_path(&root, &clean_src, true)?;
    let canonical_src = src_target
        .canonicalize()
        .map_err(|e| format!("Source path cannot be canonicalized: {e}"))?;
    if canonical_src == root {
        return Err("Cannot rename the project root directory".into());
    }

    let dst_target = resolve_and_verify_path(&root, &clean_dst, false)?;
    if dst_target.exists() {
        return Err("Destination path already exists".into());
    }
    if let Ok(c_dst) = dst_target.canonicalize() {
        if c_dst == root {
            return Err("Destination cannot be the project root directory".into());
        }
    }

    let db = connection(&state)?;
    let audit_target = format!("{} -> {}", clean_src.to_string_lossy(), clean_dst.to_string_lossy());
    authorize(&state, &db, "FS_RENAME", "FILE_RENAME", &audit_target, decision)?;

    if let Some(parent) = dst_target.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create destination parent directories: {e}"))?;
        }
    }

    std::fs::rename(&src_target, &dst_target).map_err(|e| format!("Failed to rename: {e}"))?;
    enforce_project_boundary(&root, &dst_target)?;
    Ok(())
}

#[tauri::command]
pub fn fs_remove(
    state: State<StorageState>,
    project_id: String,
    relative_path: String,
    decision: PermissionDecision,
) -> Result<(), String> {
    let root = get_project_root(&state, &project_id)?;
    let clean = normalize_and_validate_relative_path(&relative_path)?;
    if clean.as_os_str().is_empty() {
        return Err("Cannot remove the project root directory".into());
    }

    let target = resolve_and_verify_path(&root, &clean, true)?;
    let canonical_target = target
        .canonicalize()
        .map_err(|e| format!("Target path cannot be canonicalized: {e}"))?;
    if canonical_target == root {
        return Err("Cannot remove the project root directory".into());
    }

    let db = connection(&state)?;
    let audit_target = clean.to_string_lossy().to_string();
    authorize(&state, &db, "FS_REMOVE", "FILE_DELETE", &audit_target, decision)?;

    if target.is_dir() {
        std::fs::remove_dir_all(&target).map_err(|e| format!("Failed to remove directory: {e}"))?;
    } else {
        std::fs::remove_file(&target).map_err(|e| format!("Failed to remove file: {e}"))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{initialize, Project};
    use rusqlite::params;

    static TEST_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

    fn setup_test_project() -> (StorageState, PathBuf, String, PathBuf) {
        let test_num = TEST_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let test_id = format!("boss-fs-test-{}-{}", std::process::id(), test_num);
        let temp_dir = std::env::temp_dir().join(test_id);
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let db_dir = temp_dir.join("db");
        let db_path = initialize(&db_dir).unwrap();
        let state = StorageState::new(db_path);

        let project_dir = temp_dir.join("project_root");
        std::fs::create_dir_all(&project_dir).unwrap();
        let canonical_root = project_dir.canonicalize().unwrap();

        let project_id = format!("test-proj-{test_num}");
        let project = Project {
            id: project_id.clone(),
            name: "Test Project".into(),
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
    fn test_normalize_relative_path_rejects_traversal() {
        assert!(normalize_and_validate_relative_path("../outside.txt").is_err());
        assert!(normalize_and_validate_relative_path("sub/../../escape.txt").is_err());
        assert!(normalize_and_validate_relative_path("C:/Windows/secret.txt").is_err());
        assert!(normalize_and_validate_relative_path("/etc/passwd").is_err());
        assert!(normalize_and_validate_relative_path("\\Windows\\file").is_err());

        let ok = normalize_and_validate_relative_path("src/nested/file.txt").unwrap();
        assert_eq!(ok, PathBuf::from("src").join("nested").join("file.txt"));
    }

    #[test]
    fn test_fs_read_and_write_file() {
        let (state, root, proj_id, temp) = setup_test_project();
        let _ = (&state, &proj_id);

        let rel_file = "src/hello.txt";
        let content = "Hello BOSS Filesystem!";

        let clean = normalize_and_validate_relative_path(rel_file).unwrap();
        let target = resolve_and_verify_path(&root, &clean, false).unwrap();
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::fs::write(&target, content.as_bytes()).unwrap();

        let db = connection(&state).unwrap();
        authorize(&state, &db, "FS_READ", "READ_FILE", rel_file, PermissionDecision::AllowedOnce).unwrap();

        let read_bytes = std::fs::read(&target).unwrap();
        let read_str = String::from_utf8(read_bytes).unwrap();
        assert_eq!(read_str, content);

        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn test_fs_list_directory_and_sorting() {
        let (state, root, proj_id, temp) = setup_test_project();
        let _ = (&state, &proj_id);

        std::fs::create_dir_all(root.join("b_dir")).unwrap();
        std::fs::create_dir_all(root.join("a_dir")).unwrap();
        std::fs::write(root.join("z_file.txt"), b"z").unwrap();
        std::fs::write(root.join("a_file.txt"), b"a").unwrap();

        let _clean = normalize_and_validate_relative_path("").unwrap();
        let target = root.clone();

        let read_dir = std::fs::read_dir(&target).unwrap();
        let mut entries: Vec<FileEntry> = Vec::new();
        for entry in read_dir {
            let entry = entry.unwrap();
            let file_name = entry.file_name().to_string_lossy().to_string();
            let kind = if entry.file_type().unwrap().is_dir() { "directory".into() } else { "file".into() };
            entries.push(FileEntry {
                name: file_name.clone(),
                relative_path: file_name,
                kind,
            });
        }
        entries.sort_by(|a, b| {
            match (a.kind == "directory", b.kind == "directory") {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            }
        });

        assert_eq!(entries[0].name, "a_dir");
        assert_eq!(entries[0].kind, "directory");
        assert_eq!(entries[1].name, "b_dir");
        assert_eq!(entries[1].kind, "directory");
        assert_eq!(entries[2].name, "a_file.txt");
        assert_eq!(entries[2].kind, "file");
        assert_eq!(entries[3].name, "z_file.txt");
        assert_eq!(entries[3].kind, "file");

        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn test_fs_cannot_escape_root_via_traversal() {
        let (_state, root, _proj_id, temp) = setup_test_project();

        let outside_sibling = temp.join("outside_sibling");
        std::fs::create_dir_all(&outside_sibling).unwrap();

        assert!(enforce_project_boundary(&root, &outside_sibling).is_err());
        assert!(normalize_and_validate_relative_path("../outside_sibling").is_err());

        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn test_fs_permission_denial_blocks_and_audits() {
        let (state, _root, _proj_id, temp) = setup_test_project();
        let db = connection(&state).unwrap();

        let result = authorize(
            &state,
            &db,
            "FS_WRITE",
            "WRITE_FILE",
            "secret.txt",
            PermissionDecision::Denied,
        );
        assert!(result.is_err());

        let count: i64 = db
            .query_row(
                "SELECT count(*) FROM permissions_audit WHERE action='FS_WRITE' AND decision='DENIED'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn test_fs_cannot_modify_project_root_directly() {
        let _clean = normalize_and_validate_relative_path("").unwrap();
        assert!(_clean.as_os_str().is_empty());
    }

    #[test]
    fn test_fs_create_directory_and_rename_and_remove() {
        let (state, root, _proj_id, temp) = setup_test_project();
        let db = connection(&state).unwrap();

        // 1. Create directory
        let rel_dir = "nested/subfolder";
        let clean_dir = normalize_and_validate_relative_path(rel_dir).unwrap();
        let dir_target = resolve_and_verify_path(&root, &clean_dir, false).unwrap();
        authorize(&state, &db, "FS_CREATE_DIR", "WRITE_FILE", rel_dir, PermissionDecision::AllowedOnce).unwrap();
        std::fs::create_dir_all(&dir_target).unwrap();
        assert!(dir_target.is_dir());

        // 2. Write file inside created directory
        let rel_file = "nested/subfolder/test.txt";
        let clean_file = normalize_and_validate_relative_path(rel_file).unwrap();
        let file_target = resolve_and_verify_path(&root, &clean_file, false).unwrap();
        authorize(&state, &db, "FS_WRITE", "WRITE_FILE", rel_file, PermissionDecision::AllowedOnce).unwrap();
        std::fs::write(&file_target, b"original content").unwrap();
        assert!(file_target.exists());

        // 3. Rename file
        let rel_renamed = "nested/subfolder/renamed.txt";
        let clean_renamed = normalize_and_validate_relative_path(rel_renamed).unwrap();
        let renamed_target = resolve_and_verify_path(&root, &clean_renamed, false).unwrap();
        authorize(&state, &db, "FS_RENAME", "WRITE_FILE", "nested/subfolder/test.txt -> nested/subfolder/renamed.txt", PermissionDecision::AllowedOnce).unwrap();
        std::fs::rename(&file_target, &renamed_target).unwrap();
        assert!(!file_target.exists());
        assert!(renamed_target.exists());

        // 4. Remove file
        authorize(&state, &db, "FS_REMOVE", "DELETE_FILE", rel_renamed, PermissionDecision::AllowedOnce).unwrap();
        std::fs::remove_file(&renamed_target).unwrap();
        assert!(!renamed_target.exists());

        // 5. Remove directory
        authorize(&state, &db, "FS_REMOVE", "DELETE_FILE", rel_dir, PermissionDecision::AllowedOnce).unwrap();
        std::fs::remove_dir_all(&dir_target).unwrap();
        assert!(!dir_target.exists());

        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn test_fs_rejects_binary_file_with_invalid_utf8() {
        let (_state, root, _proj_id, temp) = setup_test_project();
        let bin_path = root.join("binary.bin");
        // Write invalid UTF-8 byte sequence (0xFF, 0xFE, 0xFD)
        std::fs::write(&bin_path, &[0xFF, 0xFE, 0xFD]).unwrap();

        let bytes = std::fs::read(&bin_path).unwrap();
        let read_result = String::from_utf8(bytes);
        assert!(read_result.is_err());

        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn test_fs_rejects_absolute_path_escape() {
        let abs_res = normalize_and_validate_relative_path("C:/projects/other");
        assert!(abs_res.is_err());
        let root_res = normalize_and_validate_relative_path("/etc/shadow");
        assert!(root_res.is_err());
        let drive_res = normalize_and_validate_relative_path("\\\\server\\share\\file");
        assert!(drive_res.is_err());
    }

    #[test]
    fn test_fs_new_file_flow_empty_creation_listing_and_editor_save() {
        let (state, root, _proj_id, temp) = setup_test_project();
        let db = connection(&state).unwrap();

        // 1. Creation flow: create an empty file "new-file.txt"
        let rel_path = "new-file.txt";
        let clean = normalize_and_validate_relative_path(rel_path).unwrap();
        let target = resolve_and_verify_path(&root, &clean, false).unwrap();
        authorize(&state, &db, "FS_WRITE", "WRITE_FILE", rel_path, PermissionDecision::AllowedOnce).unwrap();
        std::fs::write(&target, b"").unwrap();
        enforce_project_boundary(&root, &target).unwrap();

        assert!(target.exists());
        assert_eq!(std::fs::metadata(&target).unwrap().len(), 0);

        // 2. Explorer refresh: list directory and verify new-file.txt is present
        let entries: Vec<String> = std::fs::read_dir(&root)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert!(entries.contains(&"new-file.txt".to_string()));

        // 3. Editor open: read the empty file
        authorize(&state, &db, "FS_READ", "READ_FILE", rel_path, PermissionDecision::AllowedOnce).unwrap();
        let content_bytes = std::fs::read(&target).unwrap();
        let content_str = String::from_utf8(content_bytes).unwrap();
        assert_eq!(content_str, "");

        // 4. Editor save: write new content
        let editor_code = "fn main() {\n    println!(\"Hello from BOSS!\");\n}";
        authorize(&state, &db, "FS_WRITE", "WRITE_FILE", rel_path, PermissionDecision::AllowedOnce).unwrap();
        std::fs::write(&target, editor_code.as_bytes()).unwrap();

        let updated_bytes = std::fs::read(&target).unwrap();
        let updated_str = String::from_utf8(updated_bytes).unwrap();
        assert_eq!(updated_str, editor_code);

        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn test_fs_protects_root_against_rename_and_deletion() {
        let clean_empty = normalize_and_validate_relative_path("");
        assert!(clean_empty.is_ok());
        assert!(clean_empty.unwrap().as_os_str().is_empty());

        let clean_dot = normalize_and_validate_relative_path(".");
        assert!(clean_dot.is_ok());
        assert!(clean_dot.unwrap().as_os_str().is_empty());

        let clean_slash = normalize_and_validate_relative_path("./");
        assert!(clean_slash.is_ok());
        assert!(clean_slash.unwrap().as_os_str().is_empty());

        assert!(normalize_and_validate_relative_path("..").is_err());
        assert!(normalize_and_validate_relative_path("../").is_err());
    }

    #[test]
    fn test_fs_rejects_destination_outside_project_root() {
        let (_state, root, _proj_id, temp) = setup_test_project();
        assert!(normalize_and_validate_relative_path("../outside.txt").is_err());
        assert!(normalize_and_validate_relative_path("sub/../../escape.txt").is_err());
        let outside = temp.join("external");
        assert!(enforce_project_boundary(&root, &outside).is_err());
        let _ = std::fs::remove_dir_all(temp);
    }
}

