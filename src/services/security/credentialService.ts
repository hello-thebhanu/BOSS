import { invoke } from '@tauri-apps/api/core';

export type SupportedCloudService = 'openai' | 'gemini';

// In-memory fallback for test/browser environments (NEVER written to localStorage)
const memoryVault = new Map<string, string>();

/**
 * Stores a cloud provider API key securely in the native desktop credential vault.
 * Credentials are encrypted on disk and NEVER persisted in plain SQLite or localStorage.
 */
export async function storeCredential(service: SupportedCloudService, secret: string): Promise<void> {
  const trimmed = secret.trim();
  if (!trimmed) {
    throw new Error('Credential cannot be empty');
  }

  try {
    await invoke('credential_store', { service, secret: trimmed });
  } catch (err: unknown) {
    // If not running in Tauri desktop runtime, fallback to in-memory vault
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('not found') || msg.includes('window.__TAURI_INTERNALS__') || typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
      memoryVault.set(service, trimmed);
      return;
    }
    throw new Error(`Failed to store credential: ${msg}`);
  }
}

/**
 * Checks whether a credential is registered for the specified service.
 * Does NOT return the secret, preventing unnecessary exposure in UI state.
 */
export async function hasCredential(service: SupportedCloudService): Promise<boolean> {
  try {
    return await invoke<boolean>('credential_has', { service });
  } catch {
    return memoryVault.has(service);
  }
}

/**
 * Retrieves the secret for the specified service for use in outbound HTTP requests.
 * MUST NOT be logged or surfaced in user interface state.
 */
export async function getCredential(service: SupportedCloudService): Promise<string | null> {
  try {
    const res = await invoke<string | null>('credential_get', { service });
    return res ?? null;
  } catch {
    return memoryVault.get(service) ?? null;
  }
}

/**
 * Permanently deletes the credential from the native vault and memory.
 */
export async function deleteCredential(service: SupportedCloudService): Promise<void> {
  memoryVault.delete(service);
  try {
    await invoke('credential_delete', { service });
  } catch {
    // Non-Tauri fallback already handled
  }
}

/**
 * Helper to mask a credential for safe visual representation.
 */
export function maskCredential(hasKey: boolean): string {
  return hasKey ? '••••••••••••••••' : '';
}

export const credentialService = {
  storeCredential,
  hasCredential,
  getCredential,
  deleteCredential,
  maskCredential,
};
