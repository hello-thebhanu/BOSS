import type { ModelProvider, ModelStatus } from './modelProvider';
import { LocalModelProvider } from './modelProvider';
import { localData } from '../storage/localData';

export type LocalRuntimeType = 'ollama' | 'llama.cpp';

export type LocalRuntimeConfig = {
  runtime: LocalRuntimeType;
  endpoint: string;
  model?: string;
  enabled?: boolean;
};

export type LocalRuntimeStatus = {
  available: boolean;
  runtime?: LocalRuntimeType;
  reason?: string;
  models: readonly string[];
};

export const DEFAULT_CONFIGS: Record<LocalRuntimeType, LocalRuntimeConfig> = {
  ollama: {
    runtime: 'ollama',
    endpoint: 'http://127.0.0.1:11434',
    model: '',
    enabled: true,
  },
  'llama.cpp': {
    runtime: 'llama.cpp',
    endpoint: 'http://127.0.0.1:8080',
    model: '',
    enabled: true,
  },
};

/**
 * Validates that an endpoint points strictly to a local loopback interface.
 * Cloud URLs, WAN/LAN IPs, and non-loopback domains are strictly rejected
 * to guarantee local-first execution and prevent cloud fallback / SSRF.
 */
export function validateLocalEndpoint(url: string): { valid: boolean; normalized?: string; error?: string } {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return { valid: false, error: 'Endpoint URL cannot be empty' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { valid: false, error: 'Malformed URL format' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: `Invalid protocol: ${parsed.protocol}. Only http: and https: are supported.` };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLoopback =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname === '127.0.0.1.';

  if (!isLoopback) {
    return {
      valid: false,
      error: `Security boundary violation: Host '${hostname}' is not a local loopback address. Only localhost, 127.0.0.1, or ::1 are permitted. Cloud fallbacks and remote endpoints are forbidden.`,
    };
  }

  const normalized = parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, ''));
  return { valid: true, normalized };
}

/** A real provider is constructed only after native discovery reports a supported local runtime. */
export interface LocalModelRuntime {
  discover(customConfig?: Partial<LocalRuntimeConfig>): Promise<LocalRuntimeStatus>;
  provider(modelId: string, customConfig?: Partial<LocalRuntimeConfig>): Promise<ModelProvider>;
  status(): Promise<ModelStatus>;
  loadConfig(): Promise<LocalRuntimeConfig>;
  saveConfig(config: LocalRuntimeConfig): Promise<void>;
}

export class BossLocalModelRuntime implements LocalModelRuntime {
  private activeProvider: ModelProvider | null = null;

  async loadConfig(): Promise<LocalRuntimeConfig> {
    try {
      const [runtimeSetting, endpointSetting, modelSetting, enabledSetting] = await Promise.all([
        localData.settings.getSetting('ai.local.runtime'),
        localData.settings.getSetting('ai.local.endpoint'),
        localData.settings.getSetting('ai.local.model'),
        localData.settings.getSetting('ai.local.enabled'),
      ]);

      const runtime = (runtimeSetting?.value === 'llama.cpp' ? 'llama.cpp' : 'ollama') as LocalRuntimeType;
      const defaultEndpoint = DEFAULT_CONFIGS[runtime].endpoint;
      const endpoint = typeof endpointSetting?.value === 'string' && endpointSetting.value ? endpointSetting.value : defaultEndpoint;
      const model = typeof modelSetting?.value === 'string' ? modelSetting.value : '';
      const enabled = typeof enabledSetting?.value === 'boolean' ? enabledSetting.value : true;

      return { runtime, endpoint, model, enabled };
    } catch {
      return { ...DEFAULT_CONFIGS.ollama };
    }
  }

  async saveConfig(config: LocalRuntimeConfig): Promise<void> {
    const now = new Date().toISOString();
    await Promise.all([
      localData.settings.setSetting({ key: 'ai.local.runtime', value: config.runtime, updatedAt: now }),
      localData.settings.setSetting({ key: 'ai.local.endpoint', value: config.endpoint, updatedAt: now }),
      localData.settings.setSetting({ key: 'ai.local.model', value: config.model ?? '', updatedAt: now }),
      localData.settings.setSetting({ key: 'ai.local.enabled', value: config.enabled ?? true, updatedAt: now }),
    ]);
  }

  async discover(customConfig?: Partial<LocalRuntimeConfig>): Promise<LocalRuntimeStatus> {
    const current = await this.loadConfig();
    const runtime = customConfig?.runtime ?? current.runtime;
    const rawEndpoint = customConfig?.endpoint ?? current.endpoint;

    const validation = validateLocalEndpoint(rawEndpoint);
    if (!validation.valid || !validation.normalized) {
      return {
        available: false,
        runtime,
        reason: validation.error ?? 'Invalid endpoint',
        models: [],
      };
    }

    const endpoint = validation.normalized;

    try {
      if (runtime === 'ollama') {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        try {
          const res = await fetch(`${endpoint}/api/tags`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });

          if (!res.ok) {
            return {
              available: false,
              runtime: 'ollama',
              reason: `Ollama service returned HTTP ${res.status}: ${res.statusText}`,
              models: [],
            };
          }

          const data = (await res.json()) as { models?: Array<{ name: string }> };
          const models = (data.models ?? []).map((m) => m.name).filter(Boolean);
          return {
            available: true,
            runtime: 'ollama',
            models,
            reason: models.length === 0 ? 'Ollama is reachable, but no local models were found. Run `ollama pull <model>` in your local shell to install one.' : undefined,
          };
        } finally {
          clearTimeout(timeoutId);
        }
      } else {
        // llama.cpp or OpenAI-compatible local HTTP
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        try {
          const res = await fetch(`${endpoint}/v1/models`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });

          if (!res.ok) {
            return {
              available: false,
              runtime: 'llama.cpp',
              reason: `llama.cpp service returned HTTP ${res.status}: ${res.statusText}`,
              models: [],
            };
          }

          const data = (await res.json()) as { data?: Array<{ id: string }> };
          const models = (data.data ?? []).map((m) => m.id).filter(Boolean);
          return {
            available: true,
            runtime: 'llama.cpp',
            models,
            reason: models.length === 0 ? 'llama.cpp is reachable, but no models are loaded.' : undefined,
          };
        } finally {
          clearTimeout(timeoutId);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        available: false,
        runtime,
        reason: `Connection refused at ${endpoint} (${message}). Verify that ${runtime} is installed and running locally.`,
        models: [],
      };
    }
  }

  async provider(modelId: string, customConfig?: Partial<LocalRuntimeConfig>): Promise<ModelProvider> {
    const config = await this.loadConfig();
    const effectiveRuntime = customConfig?.runtime ?? config.runtime;
    const effectiveEndpoint = customConfig?.endpoint ?? config.endpoint;

    const providerInstance = new LocalModelProvider(modelId, effectiveRuntime, effectiveEndpoint);
    await providerInstance.load();
    this.activeProvider = providerInstance;
    return providerInstance;
  }

  async status(): Promise<ModelStatus> {
    if (!this.activeProvider) return 'unloaded';
    return this.activeProvider.getStatus();
  }
}

export const localModelRuntime = new BossLocalModelRuntime();
