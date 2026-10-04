import type { AIProvider, AIProviderMetadata, AIProviderStatusResult } from '../aiProviderTypes';
import type { ModelProvider } from '../modelProvider';
import { localModelRuntime } from '../localModelRuntime';
import { localData } from '../../storage/localData';

export const OLLAMA_METADATA: AIProviderMetadata = {
  id: 'ollama',
  name: 'Ollama',
  type: 'local',
  tagline: 'Local · Private',
  description:
    'Runs open-weights AI models locally on your machine. Does not require a cloud API key. Zero data leaves your computer.',
  defaultModel: 'llama3.2',
  supportedModels: [
    'llama3.2',
    'llama3.1',
    'deepseek-r1',
    'mistral',
    'qwen2.5-coder',
    'codellama',
    'phi3',
    'gemma2',
  ],
  requiresApiKey: false,
  pricingNotice:
    'Ollama is free and open-source. Runs on your computer hardware (CPU/RAM/GPU). No cloud API charges.',
  privacyNotice:
    'Private & Air-Gapped. No prompts, code, files, or project data are ever sent over the internet.',
  websiteUrl: 'https://ollama.com',
  pricingUrl: 'https://ollama.com',
  docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/api.md',
};

export class OllamaProvider implements AIProvider {
  readonly id = 'ollama' as const;
  readonly metadata = OLLAMA_METADATA;

  async getStatus(): Promise<AIProviderStatusResult> {
    const config = await localModelRuntime.loadConfig();
    const discovery = await localModelRuntime.discover({ runtime: 'ollama' });
    const savedModel = (await localData.settings.getSetting('ai.provider.ollama.model'))?.value;
    const activeModel = typeof savedModel === 'string' && savedModel
      ? savedModel
      : config.model || (discovery.models[0] ?? this.metadata.defaultModel);

    if (discovery.available) {
      if (discovery.models.length === 0) {
        return {
          providerId: 'ollama',
          status: 'configured',
          reason:
            'Ollama service is running, but no models are installed. Run `ollama pull <model>` in your local shell to download one.',
          models: [],
          activeModel,
        };
      }
      return {
        providerId: 'ollama',
        status: 'connected',
        models: discovery.models,
        activeModel,
      };
    }

    const isConnectionRefused =
      discovery.reason?.includes('Connection refused') ||
      discovery.reason?.includes('ECONNREFUSED') ||
      discovery.reason?.includes('Failed to fetch');

    return {
      providerId: 'ollama',
      status: isConnectionRefused ? 'not_installed' : 'unavailable',
      reason: isConnectionRefused
        ? 'Ollama is not running on port 11434. Start or install Ollama to run models locally.'
        : discovery.reason ?? 'Local AI service is unreachable.',
      models: [],
      activeModel,
    };
  }

  async testConnection(): Promise<{ success: boolean; error?: string; models?: readonly string[] }> {
    const discovery = await localModelRuntime.discover({ runtime: 'ollama' });
    if (!discovery.available) {
      return {
        success: false,
        error: discovery.reason ?? 'Failed to connect to local Ollama service on http://127.0.0.1:11434',
        models: [],
      };
    }
    return {
      success: true,
      models: discovery.models,
    };
  }

  async discoverModels(): Promise<readonly string[]> {
    const discovery = await localModelRuntime.discover({ runtime: 'ollama' });
    return discovery.models;
  }

  async getModelProvider(modelId?: string): Promise<ModelProvider> {
    const config = await localModelRuntime.loadConfig();
    const targetModel = modelId || config.model || this.metadata.defaultModel;
    return localModelRuntime.provider(targetModel, { runtime: 'ollama' });
  }
}

export const ollamaProvider = new OllamaProvider();
