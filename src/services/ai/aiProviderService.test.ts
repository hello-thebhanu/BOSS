import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aiProviderService } from './aiProviderService';
import { localData } from '../storage/localData';

const mockSettings = new Map<string, any>();

describe('aiProviderService', () => {
  beforeEach(() => {
    mockSettings.clear();
    mockSettings.set('ai.provider.active', 'ollama');

    vi.spyOn(localData.settings, 'getSetting').mockImplementation(async (key: string) => {
      if (mockSettings.has(key)) {
        return { key, value: mockSettings.get(key), updatedAt: new Date().toISOString() };
      }
      return null;
    });

    vi.spyOn(localData.settings, 'setSetting').mockImplementation(async (setting: any) => {
      mockSettings.set(setting.key, setting.value);
      return setting;
    });
  });

  it('should return all three providers: ollama, openai, gemini', () => {
    const providers = aiProviderService.getAllProviders();
    expect(providers).toHaveLength(3);
    const ids = providers.map((p) => p.id);
    expect(ids).toContain('ollama');
    expect(ids).toContain('openai');
    expect(ids).toContain('gemini');
  });

  it('should get a provider by id', () => {
    const ollama = aiProviderService.getProvider('ollama');
    expect(ollama.id).toBe('ollama');
    expect(ollama.metadata.type).toBe('local');

    const openai = aiProviderService.getProvider('openai');
    expect(openai.id).toBe('openai');
    expect(openai.metadata.type).toBe('cloud');

    const gemini = aiProviderService.getProvider('gemini');
    expect(gemini.id).toBe('gemini');
    expect(gemini.metadata.type).toBe('cloud');
  });

  it('should throw an error for unknown provider id', () => {
    expect(() => aiProviderService.getProvider('unknown' as any)).toThrow(
      "Unknown AI provider 'unknown'"
    );
  });

  it('should return default active provider id as ollama', async () => {
    const activeId = await aiProviderService.getActiveProviderId();
    expect(activeId).toBe('ollama');
  });

  it('should change active provider and notify listeners', async () => {
    const listener = vi.fn();
    const unsub = aiProviderService.subscribe(listener);

    await aiProviderService.setActiveProviderId('openai');
    const activeId = await aiProviderService.getActiveProviderId();
    expect(activeId).toBe('openai');
    expect(listener).toHaveBeenCalled();

    const activeProvider = await aiProviderService.getActiveProvider();
    expect(activeProvider.id).toBe('openai');

    unsub();
  });

  it('should throw error when setting invalid provider id', async () => {
    await expect(aiProviderService.setActiveProviderId('invalid' as any)).rejects.toThrow(
      "Invalid provider id 'invalid'"
    );
  });

  it('should set and get model per provider', async () => {
    await aiProviderService.setProviderModel('openai', 'gpt-4o');
    const model = await aiProviderService.getProviderModel('openai');
    expect(model).toBe('gpt-4o');

    // Default model if not set
    const geminiDefault = await aiProviderService.getProviderModel('gemini');
    expect(geminiDefault).toBe('gemini-2.0-flash');
  });
});
