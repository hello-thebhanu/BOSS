import { describe, it, expect, beforeEach, vi } from 'vitest';
import { credentialService } from './credentialService';

describe('credentialService', () => {
  beforeEach(async () => {
    // In test environment without Tauri IPC, in-memory vault is used
    await credentialService.deleteCredential('openai');
    await credentialService.deleteCredential('gemini');
  });

  it('should store, check, get, and delete credentials in fallback mode', async () => {
    expect(await credentialService.hasCredential('openai')).toBe(false);
    expect(await credentialService.getCredential('openai')).toBeNull();

    await credentialService.storeCredential('openai', 'sk-proj-1234567890abcdef');
    expect(await credentialService.hasCredential('openai')).toBe(true);
    expect(await credentialService.getCredential('openai')).toBe('sk-proj-1234567890abcdef');

    await credentialService.deleteCredential('openai');
    expect(await credentialService.hasCredential('openai')).toBe(false);
    expect(await credentialService.getCredential('openai')).toBeNull();
  });

  it('should safely mask credentials', () => {
    expect(credentialService.maskCredential(false)).toBe('');
    expect(credentialService.maskCredential(true)).toBe('••••••••••••••••');
  });
});
