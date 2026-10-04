# BOSS — CROSS-PLATFORM BUILD MATRIX & RELEASE READINESS

This document outlines the cross-platform build matrix, target architectures, compilation requirements, and validation status for the BOSS desktop application.

---

## 1. TARGET ARCHITECTURE MATRIX

| Target Platform | Architecture | Target Triple | Host Requirement | Status | Validation Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Windows 11 ARM64** | ARM64 (`aarch64`) | `aarch64-pc-windows-msvc` | Windows 11 ARM64 | **`SUPPORTED`** | **Locally Validated**: Full compilation, Tauri build, 35 Rust tests passing, 126 Vitest tests passing, release binary executed and verified. |
| **Windows 11 / 10 x64** | x86_64 (`x64`) | `x86_64-pc-windows-msvc` | Windows (x64 / ARM64) | **`BUILD-READY`** | **Architecture Ready**: All Rust and TypeScript code is 64-bit architecture neutral. Requires `rustup target add x86_64-pc-windows-msvc` and x64 MSVC build tools. |
| **Linux x64** | x86_64 (`x64`) | `x86_64-unknown-linux-gnu` | Linux x64 (Ubuntu 22.04+) | **`BLOCKED BY HOST ENVIRONMENT`** | **Source Compatible**: Conditional compilation (`#[cfg(not(windows))]`, `$SHELL`, `/bin/sh`) implemented. Host lacks Linux toolchain and `webkit2gtk-4.1` libraries. |
| **Linux ARM64** | ARM64 (`aarch64`) | `aarch64-unknown-linux-gnu` | Linux ARM64 (Ubuntu 22.04+) | **`BLOCKED BY HOST ENVIRONMENT`** | **Source Compatible**: Shell and path logic abstracted. Host lacks Linux ARM64 sysroot and libraries. |
| **macOS Apple Silicon** | ARM64 (`aarch64`) | `aarch64-apple-darwin` | macOS 12+ (Apple Silicon) | **`BLOCKED BY HOST ENVIRONMENT`** | **Source Compatible**: Keyboard shortcuts (`⌘`), Unix shell, and path canonicalization ready. Host lacks macOS SDK and Apple Darwin toolchain. |
| **macOS Intel** | x86_64 (`x64`) | `x86_64-apple-darwin` | macOS 11+ (Intel / Rosetta) | **`BLOCKED BY HOST ENVIRONMENT`** | **Source Compatible**: Shortcuts and Unix abstractions ready. Host lacks macOS SDK. |

---

## 2. PREREQUISITES BY TARGET

### Windows (ARM64 / x64)
- **Node.js**: >= 20.x (Current: Node v24.17.0)
- **Rust Toolchain**: `stable-aarch64-pc-windows-msvc` or `stable-x86_64-pc-windows-msvc`
- **Build Tools**: Visual Studio 2022 C++ Build Tools (with ARM64 / x64 MSVC v143 toolsets)
- **Webview2**: Microsoft Edge WebView2 Runtime (pre-installed on Windows 11)
- **Git**: Git for Windows in `PATH`

### Linux (x64 / ARM64)
- **Node.js**: >= 20.x
- **Rust Toolchain**: `stable-x86_64-unknown-linux-gnu` or `stable-aarch64-unknown-linux-gnu`
- **System Packages** (Debian/Ubuntu):
  ```bash
  sudo apt-get update && sudo apt-get install -y \
    libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libxdo-dev \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
  ```
- **Git**: System Git in `PATH`

### macOS (Apple Silicon / Intel)
- **Node.js**: >= 20.x
- **Rust Toolchain**: `stable-aarch64-apple-darwin` or `stable-x86_64-apple-darwin`
- **Xcode**: Command Line Tools (`xcode-select --install`)
- **WKWebView**: Included with macOS 10.13+
- **Git**: System or Homebrew Git in `PATH`

---

## 3. BUILD COMMANDS

### Local Development / Validation (Current Windows Host)
```powershell
# Run frontend test suite
npm test -- --run

# Run native Rust test suite
cargo test --manifest-path src-tauri/Cargo.toml

# Build frontend production bundle
npm run build

# Compile Tauri binary (without bundling installer)
npx tauri build --no-bundle
```

### Cross-Compilation Workflow (CI / CD Reference)
When running on GitHub Actions or a dedicated multi-runner CI environment:

#### Windows Matrix Runner (`windows-latest`):
```powershell
# Windows ARM64
rustup target add aarch64-pc-windows-msvc
npm run build
npx tauri build --target aarch64-pc-windows-msvc --no-bundle

# Windows x64
rustup target add x86_64-pc-windows-msvc
npm run build
npx tauri build --target x86_64-pc-windows-msvc --no-bundle
```

#### Linux Matrix Runner (`ubuntu-22.04`):
```bash
sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev
npm run build
npx tauri build --no-bundle
```

#### macOS Matrix Runner (`macos-latest` for ARM64, `macos-13` for Intel):
```bash
npm run build
npx tauri build --no-bundle
```

---

## 4. CROSS-PLATFORM ARCHITECTURAL HIGHLIGHTS

1. **Native Platform Abstraction**:
   - `get_platform_info` Tauri command exposes `{ os, arch, family }` directly from Rust standard library constants (`std::env::consts`).
   - `platformService.ts` provides typed platform queries and fallbacks for browser/test environments.
2. **Path Normalization & Scoping**:
   - `normalize_and_validate_relative_path` normalizes separators to forward slashes across all platforms while rejecting drive prefixes (`C:`), root prefixes (`/`, `\\`), and directory traversal (`..`).
   - `canonical_project_root` uses `path.canonicalize()` and verifies directory access without hardcoded platform paths.
3. **Terminal / Shell Provider Boundary**:
   - Windows: Spawns `cmd.exe /Q` with `CREATE_NO_WINDOW` flag.
   - Linux/macOS: Spawns `$SHELL` (falling back to `/bin/sh`) without Windows-only creation flags.
   - Line endings are platform-aware (`\r\n` on Windows, `\n` on Unix).
4. **Git Process Execution**:
   - Arguments passed as structured string slices (`&[&str]`), preventing shell injection on all platforms.
   - Repository root comparison uses canonicalized path matching with separator normalization.
   - Error messages are generic and not Windows-specific.
5. **Keyboard / Input Compatibility**:
   - `formatShortcut` formats shortcuts based on platform (`⌘S`, `⌘K` on macOS; `Ctrl+S`, `Ctrl K` on Windows/Linux).
   - Event listeners accept either `ctrlKey` or `metaKey` interchangeably.
6. **Window Controls**:
   - Preserves custom monochrome window controls (minimize, maximize, close) across all platforms without introducing OS-specific traffic lights or mismatched window chrome.
