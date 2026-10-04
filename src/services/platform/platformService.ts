import { invoke } from '@tauri-apps/api/core';

export interface PlatformInfo {
  os: string;
  arch: string;
  family: string;
}

let cachedPlatformInfo: PlatformInfo | null = null;

/**
 * Detects the runtime platform through Tauri's native `get_platform_info` command,
 * falling back to browser navigator detection in web or test environments.
 */
export async function getPlatformInfo(): Promise<PlatformInfo> {
  if (cachedPlatformInfo) {
    return cachedPlatformInfo;
  }

  try {
    const info = await invoke<PlatformInfo>('get_platform_info');
    if (info && info.os) {
      cachedPlatformInfo = info;
      return cachedPlatformInfo;
    }
  } catch {
    // Not running inside Tauri desktop runtime or Tauri mock
  }

  // Fallback to browser/test environment detection
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const platform = typeof navigator !== 'undefined' ? (navigator as { platform?: string }).platform || '' : '';

  let os = 'windows';
  let family = 'windows';

  if (/macintosh|mac os x/i.test(userAgent) || /mac/i.test(platform)) {
    os = 'macos';
    family = 'unix';
  } else if (/linux/i.test(userAgent) || /linux/i.test(platform)) {
    os = 'linux';
    family = 'unix';
  }

  let arch = 'unknown';
  if (/arm64|aarch64/i.test(userAgent) || /arm/i.test(platform)) {
    arch = 'aarch64';
  } else if (/x86_64|win64|x64|wow64/i.test(userAgent)) {
    arch = 'x86_64';
  }

  cachedPlatformInfo = { os, arch, family };
  return cachedPlatformInfo;
}

/**
 * Synchronous check whether current platform is macOS.
 */
export function isMacSync(): boolean {
  if (cachedPlatformInfo) {
    return cachedPlatformInfo.os === 'macos';
  }
  if (typeof navigator !== 'undefined') {
    const userAgent = navigator.userAgent || '';
    const platform = (navigator as { platform?: string }).platform || '';
    return /macintosh|mac os x/i.test(userAgent) || /mac/i.test(platform);
  }
  return false;
}

/**
 * Synchronous check whether current platform is Windows.
 */
export function isWindowsSync(): boolean {
  if (cachedPlatformInfo) {
    return cachedPlatformInfo.os === 'windows';
  }
  if (typeof navigator !== 'undefined') {
    const userAgent = navigator.userAgent || '';
    const platform = (navigator as { platform?: string }).platform || '';
    return /windows|win32|win64/i.test(userAgent) || /win/i.test(platform);
  }
  return true;
}

/**
 * Formats a keyboard shortcut string for display based on the platform.
 * e.g., 'Ctrl+S' -> '⌘S' on macOS, 'Ctrl+S' on Windows/Linux.
 * e.g., 'Ctrl K' -> '⌘K' on macOS, 'Ctrl K' on Windows/Linux.
 */
export function formatShortcut(shortcut: string): string {
  if (isMacSync()) {
    return shortcut
      .replace(/^Ctrl\+/i, '⌘')
      .replace(/^Ctrl\s*/i, '⌘')
      .replace(/\+([a-zA-Z0-9])/g, '$1');
  }
  return shortcut;
}

/**
 * Returns the primary modifier key name ('⌘' on macOS, 'Ctrl' on Windows/Linux).
 */
export function getModifierKey(): string {
  return isMacSync() ? '⌘' : 'Ctrl';
}

/**
 * Reset cached platform for testing purposes.
 */
export function _resetPlatformCache(): void {
  cachedPlatformInfo = null;
}

export const platformService = {
  getPlatformInfo,
  isMac: isMacSync,
  isWindows: isWindowsSync,
  formatShortcut,
  getModifierKey,
  _resetPlatformCache,
};
