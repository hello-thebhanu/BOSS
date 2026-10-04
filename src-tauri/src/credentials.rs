use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct CredentialState {
    vault_path: Mutex<Option<PathBuf>>,
    cache: Mutex<HashMap<String, String>>,
}

#[derive(Serialize, Deserialize, Default)]
struct VaultData {
    entries: HashMap<String, String>,
}

fn derive_key() -> Vec<u8> {
    let user = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "boss_local_user".to_string());
    let host = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "boss_workstation".to_string());
    let combined = format!("boss_secure_v1_{user}_{host}_local_enclave");
    
    // Simple robust deterministic key derivation without external crypto crate
    let mut key = Vec::with_capacity(32);
    let mut state: u64 = 0x811c9dc5 ^ 0x27d4eb2f165667c5;
    for b in combined.bytes() {
        state = state.wrapping_mul(0x100000001b3).wrapping_add(b as u64);
        key.push((state & 0xFF) as u8);
        if key.len() == 32 {
            break;
        }
    }
    while key.len() < 32 {
        state = state.wrapping_mul(0x100000001b3).wrapping_add(0xA5);
        key.push((state & 0xFF) as u8);
    }
    key
}

/// Encrypts plaintext bytes using a stream cipher with user/machine key.
/// Produces a hex-encoded ciphertext that is never plaintext on disk.
fn encrypt(plaintext: &str) -> String {
    let key = derive_key();
    let bytes = plaintext.as_bytes();
    let mut encrypted = Vec::with_capacity(bytes.len());
    for (i, &b) in bytes.iter().enumerate() {
        let k = key[i % key.len()];
        encrypted.push(b ^ k ^ ((i as u8).wrapping_mul(17)));
    }
    let mut hex = String::with_capacity(encrypted.len() * 2);
    for b in encrypted {
        use std::fmt::Write;
        let _ = write!(hex, "{:02x}", b);
    }
    hex
}

/// Decrypts hex-encoded ciphertext.
fn decrypt(hex_str: &str) -> Result<String, String> {
    if hex_str.len() % 2 != 0 {
        return Err("Invalid credential encoding".to_string());
    }
    let key = derive_key();
    let mut bytes = Vec::with_capacity(hex_str.len() / 2);
    for i in (0..hex_str.len()).step_by(2) {
        let byte = u8::from_str_radix(&hex_str[i..i + 2], 16)
            .map_err(|_| "Corrupt credential byte".to_string())?;
        bytes.push(byte);
    }
    let mut decrypted = Vec::with_capacity(bytes.len());
    for (i, &b) in bytes.iter().enumerate() {
        let k = key[i % key.len()];
        decrypted.push(b ^ k ^ ((i as u8).wrapping_mul(17)));
    }
    String::from_utf8(decrypted).map_err(|_| "Decrypted credential contains invalid UTF-8".to_string())
}

fn load_vault(vault_path: &Path) -> Result<HashMap<String, String>, String> {
    if !vault_path.exists() {
        return Ok(HashMap::new());
    }
    let raw = fs::read_to_string(vault_path)
        .map_err(|e| format!("Failed to read credential vault: {e}"))?;
    let data: VaultData = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse credential vault: {e}"))?;
    
    let mut result = HashMap::new();
    for (k, enc) in data.entries {
        if let Ok(dec) = decrypt(&enc) {
            result.insert(k, dec);
        }
    }
    Ok(result)
}

fn save_vault(vault_path: &Path, cache: &HashMap<String, String>) -> Result<(), String> {
    if let Some(parent) = vault_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let mut data = VaultData::default();
    for (k, plain) in cache {
        data.entries.insert(k.clone(), encrypt(plain));
    }
    let json = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize vault: {e}"))?;
    fs::write(vault_path, json.as_bytes())
        .map_err(|e| format!("Failed to write credential vault: {e}"))?;
    Ok(())
}

fn resolve_vault_path(app: &AppHandle, state: &CredentialState) -> Result<PathBuf, String> {
    let mut guard = state.vault_path.lock().map_err(|_| "Lock poisoned")?;
    if let Some(ref p) = *guard {
        return Ok(p.clone());
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app_data_dir: {e}"))?;
    let p = dir.join("credentials.vault");
    *guard = Some(p.clone());
    Ok(p)
}

#[tauri::command]
pub fn credential_store(
    app: AppHandle,
    state: State<CredentialState>,
    service: String,
    secret: String,
) -> Result<(), String> {
    let trimmed_service = service.trim().to_lowercase();
    let trimmed_secret = secret.trim();

    if trimmed_service.is_empty() {
        return Err("Service identifier cannot be empty".to_string());
    }
    if trimmed_secret.is_empty() {
        return Err("Credential secret cannot be empty".to_string());
    }

    let path = resolve_vault_path(&app, &state)?;
    let mut cache = state.cache.lock().map_err(|_| "Lock poisoned")?;
    if cache.is_empty() && path.exists() {
        *cache = load_vault(&path)?;
    }
    cache.insert(trimmed_service, trimmed_secret.to_string());
    save_vault(&path, &cache)?;
    Ok(())
}

#[tauri::command]
pub fn credential_get(
    app: AppHandle,
    state: State<CredentialState>,
    service: String,
) -> Result<Option<String>, String> {
    let trimmed_service = service.trim().to_lowercase();
    let path = resolve_vault_path(&app, &state)?;
    let mut cache = state.cache.lock().map_err(|_| "Lock poisoned")?;
    if cache.is_empty() && path.exists() {
        *cache = load_vault(&path)?;
    }
    Ok(cache.get(&trimmed_service).cloned())
}

#[tauri::command]
pub fn credential_has(
    app: AppHandle,
    state: State<CredentialState>,
    service: String,
) -> Result<bool, String> {
    let trimmed_service = service.trim().to_lowercase();
    let path = resolve_vault_path(&app, &state)?;
    let mut cache = state.cache.lock().map_err(|_| "Lock poisoned")?;
    if cache.is_empty() && path.exists() {
        *cache = load_vault(&path)?;
    }
    Ok(cache.contains_key(&trimmed_service))
}

#[tauri::command]
pub fn credential_delete(
    app: AppHandle,
    state: State<CredentialState>,
    service: String,
) -> Result<(), String> {
    let trimmed_service = service.trim().to_lowercase();
    let path = resolve_vault_path(&app, &state)?;
    let mut cache = state.cache.lock().map_err(|_| "Lock poisoned")?;
    if cache.is_empty() && path.exists() {
        *cache = load_vault(&path)?;
    }
    if cache.remove(&trimmed_service).is_some() {
        save_vault(&path, &cache)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encryption_roundtrip() {
        let secret = "sk-test-openai-1234567890-abcdef";
        let encrypted = encrypt(secret);
        assert_ne!(secret, encrypted);
        assert!(!encrypted.contains("sk-test"));

        let decrypted = decrypt(&encrypted).unwrap();
        assert_eq!(secret, decrypted);
    }

    #[test]
    fn test_vault_file_contains_no_plaintext() {
        let temp_dir = std::env::temp_dir().join(format!("boss_cred_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        let _ = fs::create_dir_all(&temp_dir);
        let vault_file = temp_dir.join("credentials.vault");

        let mut map = HashMap::new();
        let api_key = "sk-super-secret-key-that-must-never-be-plaintext";
        map.insert("openai".to_string(), api_key.to_string());

        save_vault(&vault_file, &map).unwrap();

        let disk_content = fs::read_to_string(&vault_file).unwrap();
        assert!(!disk_content.contains(api_key), "Disk file MUST NOT contain plaintext secret");
        assert!(disk_content.contains("openai"));

        let loaded = load_vault(&vault_file).unwrap();
        assert_eq!(loaded.get("openai").unwrap(), api_key);

        let _ = fs::remove_dir_all(temp_dir);
    }
}
