import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  BossLocalModelRuntime,
  localModelRuntime,
  validateLocalEndpoint,
} from './localModelRuntime';
import { localData } from '../storage/localData';

describe('validateLocalEndpoint', () => {
  it('allows loopback addresses on standard and custom ports', () => {
    expect(validateLocalEndpoint('http://127.0.0.1:11434').valid).toBe(true);
    expect(validateLocalEndpoint('http://localhost:8080').valid).toBe(true);
    expect(validateLocalEndpoint('http://[::1]:1234').valid).toBe(true);
    expect(validateLocalEndpoint('https://127.0.0.1:8443').valid).toBe(true);
  });

  it('normalizes trailing slashes', () => {
    const res = validateLocalEndpoint('http://localhost:11434/');
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe('http://localhost:11434');
  });

  it('strictly rejects non-loopback endpoints to prevent cloud fallback and SSRF', () => {
    const cloud1 = validateLocalEndpoint('https://api.openai.com/v1');
    expect(cloud1.valid).toBe(false);
    expect(cloud1.error).toContain('Security boundary violation');

    const cloud2 = validateLocalEndpoint('https://api.anthropic.com');
    expect(cloud2.valid).toBe(false);
    expect(cloud2.error).toContain('Security boundary violation');

    const lan = validateLocalEndpoint('http://192.168.1.50:11434');
    expect(lan.valid).toBe(false);
    expect(lan.error).toContain('Security boundary violation');

    const external = validateLocalEndpoint('http://example.com:8080');
    expect(external.valid).toBe(false);
    expect(external.error).toContain('Security boundary violation');
  });

  it('rejects invalid or empty inputs', () => {
    expect(validateLocalEndpoint('').valid).toBe(false);
    expect(validateLocalEndpoint('   ').valid).toBe(false);
    expect(validateLocalEndpoint('not-a-url').valid).toBe(false);
    expect(validateLocalEndpoint('ftp://127.0.0.1').valid).toBe(false);
  });
});

describe('BossLocalModelRuntime Discovery & Config', () => {
  let runtime: BossLocalModelRuntime;

  beforeEach(() => {
    runtime = new BossLocalModelRuntime();
    vi.restoreAllMocks();
  });

  it('exposes singleton localModelRuntime', () => {
    expect(localModelRuntime).toBeInstanceOf(BossLocalModelRuntime);
  });

  it('reports honest offline state when runtime is unreachable', async () => {
    // Mock fetch to simulate connection refused (ECONNREFUSED)
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch (ECONNREFUSED)'));

    const status = await runtime.discover({
      runtime: 'ollama',
      endpoint: 'http://127.0.0.1:11434',
    });

    expect(status.available).toBe(false);
    expect(status.runtime).toBe('ollama');
    expect(status.models).toEqual([]);
    expect(status.reason).toContain('Connection refused at http://127.0.0.1:11434');
    expect(status.reason).toContain('Verify that ollama is installed and running locally');
  });

  it('never fabricates models or returns fake connected status', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection timed out'));

    const status = await runtime.discover({
      runtime: 'llama.cpp',
      endpoint: 'http://127.0.0.1:8080',
    });

    expect(status.available).toBe(false);
    expect(status.models.length).toBe(0);
  });

  it('discovers real models from Ollama runtime', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          models: [
            { name: 'llama3:latest', size: 4661224676 },
            { name: 'codellama:7b', size: 3825893043 },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const status = await runtime.discover({
      runtime: 'ollama',
      endpoint: 'http://127.0.0.1:11434',
    });

    expect(status.available).toBe(true);
    expect(status.runtime).toBe('ollama');
    expect(status.models).toEqual(['llama3:latest', 'codellama:7b']);
    expect(status.reason).toBeUndefined();
  });

  it('discovers real models from llama.cpp / OpenAI-compatible runtime', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            { id: 'mistral-7b-instruct-v0.2.Q4_K_M.gguf' },
            { id: 'deepseek-coder-6.7b.gguf' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const status = await runtime.discover({
      runtime: 'llama.cpp',
      endpoint: 'http://127.0.0.1:8080',
    });

    expect(status.available).toBe(true);
    expect(status.runtime).toBe('llama.cpp');
    expect(status.models).toEqual([
      'mistral-7b-instruct-v0.2.Q4_K_M.gguf',
      'deepseek-coder-6.7b.gguf',
    ]);
  });

  it('reports HTTP error status from local runtime without fabricating success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' })
    );

    const status = await runtime.discover({
      runtime: 'ollama',
      endpoint: 'http://127.0.0.1:11434',
    });

    expect(status.available).toBe(false);
    expect(status.reason).toContain('HTTP 500');
    expect(status.models).toEqual([]);
  });

  it('persists and loads local AI configuration in SQLite settings', async () => {
    const getSettingSpy = vi.spyOn(localData.settings, 'getSetting').mockImplementation(async (key) => {
      if (key === 'ai.local.runtime') return { key, value: 'llama.cpp', updatedAt: '' };
      if (key === 'ai.local.endpoint') return { key, value: 'http://127.0.0.1:9090', updatedAt: '' };
      if (key === 'ai.local.model') return { key, value: 'my-local-model', updatedAt: '' };
      if (key === 'ai.local.enabled') return { key, value: true, updatedAt: '' };
      return null;
    });

    const setSettingSpy = vi.spyOn(localData.settings, 'setSetting').mockResolvedValue({
      key: '',
      value: '',
      updatedAt: '',
    });

    const loaded = await runtime.loadConfig();
    expect(loaded.runtime).toBe('llama.cpp');
    expect(loaded.endpoint).toBe('http://127.0.0.1:9090');
    expect(loaded.model).toBe('my-local-model');
    expect(loaded.enabled).toBe(true);

    await runtime.saveConfig({
      runtime: 'ollama',
      endpoint: 'http://127.0.0.1:11434',
      model: 'llama3:8b',
      enabled: true,
    });

    expect(setSettingSpy).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'ai.local.runtime', value: 'ollama' })
    );
    expect(setSettingSpy).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'ai.local.model', value: 'llama3:8b' })
    );

    getSettingSpy.mockRestore();
    setSettingSpy.mockRestore();
  });
});
