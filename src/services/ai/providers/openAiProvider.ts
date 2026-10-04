import type { AIProvider, AIProviderMetadata, AIProviderStatusResult } from '../aiProviderTypes';
import type { ModelProvider, ModelStatus, GenerationRequest, StreamEvent } from '../modelProvider';
import type { Message } from '../../../core/types/conversation';
import { credentialService } from '../../security/credentialService';
import { localData } from '../../storage/localData';

export const OPENAI_METADATA: AIProviderMetadata = {
  id: 'openai',
  name: 'OpenAI',
  type: 'cloud',
  tagline: 'Cloud AI · BYOK',
  description:
    'Connects to OpenAI API using your own API key. Prompts and context are sent to OpenAI servers.',
  defaultModel: 'gpt-4o-mini',
  supportedModels: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
    'o1-mini',
    'o3-mini',
  ],
  requiresApiKey: true,
  pricingNotice:
    'OpenAI charges for API token usage based on your OpenAI account billing. BOSS does not provide cloud AI or control OpenAI pricing.',
  privacyNotice:
    'When OpenAI is selected, prompt text and context are sent to OpenAI servers. OpenAI data usage and privacy policies apply.',
  websiteUrl: 'https://openai.com',
  pricingUrl: 'https://openai.com/api/pricing/',
  docsUrl: 'https://platform.openai.com/docs/',
  apiKeyUrl: 'https://platform.openai.com/api-keys',
};

async function* readLines(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        yield line;
      }
    }
    if (buffer.trim()) {
      yield buffer;
    }
  } finally {
    reader.releaseLock();
  }
}

export class OpenAIModelProvider implements ModelProvider {
  private status: ModelStatus = 'unloaded';
  private activeAbortController: AbortController | null = null;

  constructor(public readonly id: string) {}

  async load(): Promise<void> {
    this.status = 'ready';
  }

  async unload(): Promise<void> {
    await this.cancel();
    this.status = 'unloaded';
  }

  async getStatus(): Promise<ModelStatus> {
    return this.status;
  }

  async cancel(): Promise<void> {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    if (this.status === 'loading') {
      this.status = 'ready';
    }
  }

  async generate(request: GenerationRequest): Promise<Message> {
    const apiKey = await credentialService.getCredential('openai');
    if (!apiKey) {
      throw new Error('OpenAI API key is missing. Please configure your API key in Settings > Models & AI Engine.');
    }

    this.status = 'loading';
    const abortCtrl = new AbortController();
    this.activeAbortController = abortCtrl;
    if (request.signal) {
      request.signal.addEventListener('abort', () => abortCtrl.abort());
    }

    try {
      const messages = request.conversation.messages
        .filter((m) => m.content && m.content.trim())
        .map((m) => ({
          role: m.role === 'tool' ? 'assistant' : m.role,
          content: m.content,
        }));

      if (messages.length === 0) {
        throw new Error('Cannot generate response: conversation history contains no messages.');
      }

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.id,
          messages,
          stream: false,
        }),
        signal: abortCtrl.signal,
      });

      if (!res.ok) {
        let errMessage = `OpenAI API error (${res.status})`;
        try {
          const errJson = (await res.json()) as { error?: { message?: string } };
          if (errJson.error?.message) {
            errMessage = `OpenAI error: ${errJson.error.message}`;
          }
        } catch {
          // ignore json parse error
        }
        throw new Error(errMessage);
      }

      const data = (await res.json()) as {
        id?: string;
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data.choices?.[0]?.message?.content ?? '';
      if (!content.trim()) {
        throw new Error(`OpenAI model '${this.id}' returned an empty completion.`);
      }

      this.status = 'ready';
      return {
        id: crypto.randomUUID(),
        role: 'assistant',
        content,
        timestamp: new Date().toISOString(),
        status: 'complete',
        attachments: [],
        toolCalls: [],
        metadata: {
          model: this.id,
          provider: 'openai',
        },
      };
    } catch (err: unknown) {
      this.status = 'error';
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`OpenAI generation failed: ${msg}`);
    } finally {
      this.activeAbortController = null;
    }
  }

  async *stream(request: GenerationRequest): AsyncIterable<StreamEvent> {
    const apiKey = await credentialService.getCredential('openai');
    if (!apiKey) {
      throw new Error('OpenAI API key is missing. Please configure your API key in Settings > Models & AI Engine.');
    }

    this.status = 'loading';
    const abortCtrl = new AbortController();
    this.activeAbortController = abortCtrl;
    if (request.signal) {
      request.signal.addEventListener('abort', () => abortCtrl.abort());
    }

    let accumulated = '';

    try {
      const messages = request.conversation.messages
        .filter((m) => m.content && m.content.trim())
        .map((m) => ({
          role: m.role === 'tool' ? 'assistant' : m.role,
          content: m.content,
        }));

      if (messages.length === 0) {
        throw new Error('Cannot stream response: conversation history contains no messages.');
      }

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.id,
          messages,
          stream: true,
        }),
        signal: abortCtrl.signal,
      });

      if (!res.ok) {
        let errMessage = `OpenAI API error (${res.status})`;
        try {
          const errJson = (await res.json()) as { error?: { message?: string } };
          if (errJson.error?.message) {
            errMessage = `OpenAI error: ${errJson.error.message}`;
          }
        } catch {
          // ignore
        }
        throw new Error(errMessage);
      }

      if (!res.body) {
        throw new Error('OpenAI streaming response body is null');
      }

      for await (const line of readLines(res.body)) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const payload = trimmed.replace(/^data:\s*/, '').trim();
        if (payload === '[DONE]') break;

        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            accumulated += delta;
            yield { type: 'token', value: delta };
          }
        } catch {
          // Ignore malformed chunks
        }
      }

      this.status = 'ready';
      yield {
        type: 'complete',
        message: {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: accumulated,
          timestamp: new Date().toISOString(),
          status: 'complete',
          attachments: [],
          toolCalls: [],
          metadata: {
            model: this.id,
            provider: 'openai',
          },
        },
      };
    } catch (err: unknown) {
      this.status = 'error';
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`OpenAI stream failed: ${msg}`);
    } finally {
      this.activeAbortController = null;
    }
  }
}

export class OpenAIProvider implements AIProvider {
  readonly id = 'openai' as const;
  readonly metadata = OPENAI_METADATA;

  async getStatus(): Promise<AIProviderStatusResult> {
    const hasKey = await credentialService.hasCredential('openai');
    const savedModel = (await localData.settings.getSetting('ai.provider.openai.model'))?.value;
    const activeModel = typeof savedModel === 'string' && savedModel ? savedModel : this.metadata.defaultModel;

    if (!hasKey) {
      return {
        providerId: 'openai',
        status: 'not_connected',
        reason: 'OpenAI API key not configured. Enter a valid API key to connect.',
        models: this.metadata.supportedModels,
        activeModel,
        hasCredential: false,
      };
    }

    return {
      providerId: 'openai',
      status: 'configured',
      models: this.metadata.supportedModels,
      activeModel,
      hasCredential: true,
    };
  }

  async testConnection(apiKeyOverride?: string): Promise<{ success: boolean; error?: string; models?: readonly string[] }> {
    const key = apiKeyOverride || (await credentialService.getCredential('openai'));
    if (!key) {
      return {
        success: false,
        error: 'No OpenAI API key provided. Enter an API key before testing connection.',
      };
    }

    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          return {
            success: false,
            error: 'Authentication failed: Invalid OpenAI API key.',
          };
        }
        return {
          success: false,
          error: `OpenAI returned HTTP ${res.status}: ${res.statusText}`,
        };
      }

      const data = (await res.json()) as { data?: Array<{ id: string }> };
      const rawModels = (data.data ?? []).map((m) => m.id);
      const filtered = rawModels
        .filter((m) => m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('o3'))
        .sort();

      const models = filtered.length > 0 ? filtered : this.metadata.supportedModels;
      return {
        success: true,
        models,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Network error connecting to OpenAI: ${msg}. Check your internet connection.`,
      };
    }
  }

  async discoverModels(): Promise<readonly string[]> {
    const test = await this.testConnection();
    return test.models && test.models.length > 0 ? test.models : this.metadata.supportedModels;
  }

  async getModelProvider(modelId?: string): Promise<ModelProvider> {
    const savedModel = (await localData.settings.getSetting('ai.provider.openai.model'))?.value;
    const targetModel = modelId || (typeof savedModel === 'string' && savedModel ? savedModel : this.metadata.defaultModel);
    return new OpenAIModelProvider(targetModel);
  }
}

export const openAiProvider = new OpenAIProvider();
