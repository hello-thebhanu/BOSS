import type { AIProvider, AIProviderId, AIProviderStatusResult } from './aiProviderTypes';
import type { ModelProvider } from './modelProvider';
import { ollamaProvider } from './providers/ollamaProvider';
import { openAiProvider } from './providers/openAiProvider';
import { geminiProvider } from './providers/geminiProvider';
import { localData } from '../storage/localData';

export class BossAIProviderService {
  private readonly providers: Record<AIProviderId, AIProvider> = {
    ollama: ollamaProvider,
    openai: openAiProvider,
    gemini: geminiProvider,
  };

  private readonly listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {}
    }
  }

  getAllProviders(): readonly AIProvider[] {
    return [this.providers.ollama, this.providers.openai, this.providers.gemini];
  }

  getProvider(id: AIProviderId): AIProvider {
    const provider = this.providers[id];
    if (!provider) {
      throw new Error(`Unknown AI provider '${id}'`);
    }
    return provider;
  }

  async getActiveProviderId(): Promise<AIProviderId> {
    try {
      const setting = await localData.settings.getSetting('ai.provider.active');
      const val = setting?.value;
      if (val === 'openai' || val === 'gemini' || val === 'ollama') {
        return val;
      }
    } catch {
      // Fallback
    }
    return 'ollama';
  }

  async setActiveProviderId(id: AIProviderId): Promise<void> {
    if (id !== 'ollama' && id !== 'openai' && id !== 'gemini') {
      throw new Error(`Invalid provider id '${id}'`);
    }
    await localData.settings.setSetting({
      key: 'ai.provider.active',
      value: id,
      updatedAt: new Date().toISOString(),
    });
    this.notify();
  }

  async getActiveProvider(): Promise<AIProvider> {
    const activeId = await this.getActiveProviderId();
    return this.getProvider(activeId);
  }

  async getActiveStatus(): Promise<AIProviderStatusResult> {
    const provider = await this.getActiveProvider();
    return provider.getStatus();
  }

  async getActiveModelProvider(modelOverride?: string): Promise<ModelProvider> {
    const provider = await this.getActiveProvider();
    return provider.getModelProvider(modelOverride);
  }

  async getProviderModel(id: AIProviderId): Promise<string> {
    try {
      const setting = await localData.settings.getSetting(`ai.provider.${id}.model`);
      if (typeof setting?.value === 'string' && setting.value) {
        return setting.value;
      }
    } catch {
      // Fallback
    }
    return this.getProvider(id).metadata.defaultModel;
  }

  async setProviderModel(id: AIProviderId, model: string): Promise<void> {
    const now = new Date().toISOString();
    await Promise.all([
      localData.settings.setSetting({
        key: `ai.provider.${id}.model`,
        value: model,
        updatedAt: now,
      }),
      localData.settings.setSetting({
        key: 'ai.provider.model',
        value: model,
        updatedAt: now,
      }),
    ]);
    this.notify();
  }
}

export const aiProviderService = new BossAIProviderService();
