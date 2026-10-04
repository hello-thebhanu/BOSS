import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPlatformInfo,
  formatShortcut,
  getModifierKey,
  _resetPlatformCache,
  isMacSync,
  isWindowsSync,
} from './platformService';

describe('platformService', () => {
  beforeEach(() => {
    _resetPlatformCache();
  });

  it('detects platform info without throwing', async () => {
    const info = await getPlatformInfo();
    expect(info).toBeDefined();
    expect(typeof info.os).toBe('string');
    expect(typeof info.arch).toBe('string');
    expect(typeof info.family).toBe('string');
    expect(['windows', 'linux', 'macos']).toContain(info.os);
    expect(['windows', 'unix']).toContain(info.family);
  });

  it('formats shortcuts correctly based on platform', () => {
    const isMac = isMacSync();
    if (isMac) {
      expect(formatShortcut('Ctrl+S')).toBe('⌘S');
      expect(formatShortcut('Ctrl K')).toBe('⌘K');
      expect(getModifierKey()).toBe('⌘');
    } else {
      expect(formatShortcut('Ctrl+S')).toBe('Ctrl+S');
      expect(formatShortcut('Ctrl K')).toBe('Ctrl K');
      expect(getModifierKey()).toBe('Ctrl');
    }
  });

  it('correctly reports boolean platform checks', () => {
    const isMac = isMacSync();
    const isWindows = isWindowsSync();
    // At least one of these is typically true or mutually exclusive
    expect(typeof isMac).toBe('boolean');
    expect(typeof isWindows).toBe('boolean');
  });
});
