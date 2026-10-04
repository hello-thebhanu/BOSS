# BOSS — Release Manifest & Build Information

## Product Metadata
* **Product Name**: BOSS — Bhanu Open Source System
* **Application Identifier**: `org.boss.desktop`
* **Version**: `0.1.0` (Release Candidate)
* **Target Architecture**: `aarch64-pc-windows-msvc` (Windows ARM64)
* **Publisher**: Bhanu
* **License**: MIT
* **Copyright**: Copyright © 2026 Bhanu. All rights reserved.

---

## Release Artifacts

| Artifact Name | Format | Size | SHA-256 Checksum | Validation Status |
| :--- | :--- | :--- | :--- | :--- |
| `BOSS_0.1.0_arm64-setup.exe` | NSIS Installer | 2,013,212 bytes (~2.01 MB) | `A4567B17D3FF2F631451CEEC27C8B1BE2839135F4CF879AE18DA6DDCD894A123` | **BUILT & VALIDATED** |
| `BOSS_0.1.0_arm64_en-US.msi` | WiX MSI Package | 3,846,144 bytes (~3.85 MB) | `563DC244745E1FF80E580E9B7C0A8B42F1571B026A939D1FDEEA59CEFF0DE6C8` | **BUILT & VALIDATED** |
| `boss-desktop.exe` | Standalone Executable | 5,867,008 bytes (~5.87 MB) | `139CB4074911DDDB9AC22C33E3EE997CDD7F5DC4AAC4993F9A3C147BC8A73FE0` | **BUILT & VALIDATED** |

---

## Installation & Data Architecture
* **Installation Directory (currentUser)**: `%LOCALAPPDATA%\Programs\BOSS\`
* **User Application Data**: `%APPDATA%\org.boss.desktop\`
  * SQLite Database: `boss.db` (WAL mode enabled, migrations preserved)
  * Credential Vault: `credentials.vault` (Machine/user-bound encrypted secrets at rest)
* **Upgrade Safety**: Application upgrades replace binaries in `%LOCALAPPDATA%\Programs\BOSS\` while preserving `%APPDATA%\org.boss.desktop\`. Existing projects, chats, sessions, and encrypted credentials survive cleanly.
* **Uninstall Policy**: Binaries and shortcuts are removed. User application data is preserved by default to protect projects and configurations.

---

## Production Security Audit
* **API Keys & Credentials**: None embedded in binary, installer, or frontend package.
* **Network & Loopback**: Strict loopback for local AI (`127.0.0.1`); HTTPS with header-based auth for BYOK cloud providers (`api.openai.com`, `generativelanguage.googleapis.com`).
* **Code Signing**: Not configured / Deferred to production deployment (Phase 19).
