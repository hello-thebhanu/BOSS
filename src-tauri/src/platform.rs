use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    pub os: &'static str,
    pub arch: &'static str,
    pub family: &'static str,
}

#[tauri::command]
pub fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        family: std::env::consts::FAMILY,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_platform_info_returns_valid_constants() {
        let info = get_platform_info();
        assert!(!info.os.is_empty());
        assert!(!info.arch.is_empty());
        assert!(!info.family.is_empty());

        #[cfg(target_os = "windows")]
        {
            assert_eq!(info.os, "windows");
            assert_eq!(info.family, "windows");
        }

        #[cfg(target_os = "linux")]
        {
            assert_eq!(info.os, "linux");
            assert_eq!(info.family, "unix");
        }

        #[cfg(target_os = "macos")]
        {
            assert_eq!(info.os, "macos");
            assert_eq!(info.family, "unix");
        }
    }
}
