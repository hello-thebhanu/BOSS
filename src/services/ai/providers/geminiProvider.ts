import type { AIProvider, AIProviderMetadata, AIProviderStatusResult } from '../aiProviderTypes';
import type { ModelProvider, ModelStatus, GenerationRequest, StreamEvent } from '../modelProvider';
import type { Message } from '../../../core/types/conversation';
import { credentialService } from '../../security/credentialService';
import { localData } from '../../storage/localData';

export const GEMINI_METADATA: AIProviderMetadata = {
  id: 'gemini',
  name: 'Google Gemini',
  type: 'cloud',
  tagline: 'Cloud AI · Google AI Studio',
  description:
    'Connects to Google Gemini API using your Google AI Studio API key. Prompts and context are sent to Google cloud endpoints.',
  defaultModel: 'gemini-2.0-flash',
  supportedModels: [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ],
  requiresApiKey: true,
  pricingNotice:
    'Google Gemini API usage is subject to Google AI Studio pricing and quotas. BOSS does not provide cloud AI or control Google pricing.',
  privacyNotice:
    'When Google Gemini is selected, prompt text and context are sent to Google servers. Google API terms of service and privacy policies apply.',
  websiteUrl: 'https://ai.google.dev',
  pricingUrl: 'https://ai.google.dev/pricing',
  docsUrl: 'https://ai.google.dev/docs',
  apiKeyUrl: 'https://aistudio.google.com/app/apikey',
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

export class GeminiModelProvider implements ModelProvider {
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

  private formatPayload(conversationMessages: readonly Message[]) {
    let systemInstruction: { parts: Array<{ text: string }> } | undefined;
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    for (const m of conversationMessages) {
      if (!m.content || !m.content.trim()) continue;

      if (m.role === 'system' && !systemInstruction) {
        systemInstruction = { parts: [{ text: m.content }] };
      } else {
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        });
      }
    }

    if (contents.length === 0) {
      throw new Error('Cannot generate response: conversation history contains no messages.');
    }

    return { systemInstruction, contents };
  }

  async generate(request: GenerationRequest): Promise<Message> {
    const apiKey = await credentialService.getCredential('gemini');
    if (!apiKey) {
      throw new Error('Google Gemini API key is missing. Please configure your API key in Settings > Models & AI Engine.');
    }

    this.status = 'loading';
    const abortCtrl = new AbortController();
    this.activeAbortController = abortCtrl;
    if (request.signal) {
      request.signal.addEventListener('abort', () => abortCtrl.abort());
    }

    try {
      const { systemInstruction, contents } = this.formatPayload(request.conversation.messages);

      // Header x-goog-api-key avoids placing credentials in URLs
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.id}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents,
            systemInstruction,
          }),
          signal: abortCtrl.signal,
        }
      );

      if (!res.ok) {
        let errMessage = `Gemini API error (${res.status})`;
        try {
          const errJson = (await res.json()) as { error?: { message?: string } };
          if (errJson.error?.message) {
            errMessage = `Gemini error: ${errJson.error.message}`;
          }
        } catch {
          // ignore
        }
        throw new Error(errMessage);
      }

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      if (!content.trim()) {
        throw new Error(`Gemini model '${this.id}' returned an empty completion.`);
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
          provider: 'gemini',
        },
      };
    } catch (err: unknown) {
      this.status = 'error';
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Gemini generation failed: ${msg}`);
    } finally {
      this.activeAbortController = null;
    }
  }

  async *stream(request: GenerationRequest): AsyncIterable<StreamEvent> {
    const apiKey = await credentialService.getCredential('gemini');
    if (!apiKey) {
      throw new Error('Google Gemini API key is missing. Please configure your API key in Settings > Models & AI Engine.');
    }

    this.status = 'loading';
    const abortCtrl = new AbortController();
    this.activeAbortController = abortCtrl;
    if (request.signal) {
      request.signal.addEventListener('abort', () => abortCtrl.abort());
    }

    let accumulated = '';

    try {
      const { systemInstruction, contents } = this.formatPayload(request.conversation.messages);

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.id}:streamGenerateContent?alt=sse`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents,
            systemInstruction,
          }),
          signal: abortCtrl.signal,
        }
      );

      if (!res.ok) {
        let errMessage = `Gemini API error (${res.status})`;
        try {
          const errJson = (await res.json()) as { error?: { message?: string } };
          if (errJson.error?.message) {
            errMessage = `Gemini error: ${errJson.error.message}`;
          }
        } catch {
          // ignore
        }
        throw new Error(errMessage);
      }

      if (!res.body) {
        throw new Error('Gemini streaming response body is null');
      }

      for await (const line of readLines(res.body)) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const payload = trimmed.replace(/^data:\s*/, '').trim();

        try {
          const parsed = JSON.parse(payload) as {
            candidates?: Array<{
              content?: { parts?: Array<{ text?: string }> };
            }>;
          };
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            accumulated += text;
            yield { type: 'token', value: text };
          }
        } catch {
          // Ignore parse errors on ping/keepalive
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
            provider: 'gemini',
          },
        },
      };
    } catch (err: unknown) {
      this.status = 'error';
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Gemini stream failed: ${msg}`);
    } finally {
      this.activeAbortController = null;
    }
  }
}

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const;
  readonly metadata = GEMINI_METADATA;

  async getStatus(): Promise<AIProviderStatusResult> {
    const hasKey = await credentialService.hasCredential('gemini');
    const savedModel = (await localData.settings.getSetting('ai.provider.gemini.model'))?.value;
    const activeModel = typeof savedModel === 'string' && savedModel ? savedModel : this.metadata.defaultModel;

    if (!hasKey) {
      return {
        providerId: 'gemini',
        status: 'not_connected',
        reason: 'Google Gemini API key not configured. Enter a valid API key to connect.',
        models: this.metadata.supportedModels,
        activeModel,
        hasCredential: false,
      };
    }

    return {
      providerId: 'gemini',
      status: 'configured',
      models: this.metadata.supportedModels,
      activeModel,
      hasCredential: true,
    };
  }

  async testConnection(apiKeyOverride?: string): Promise<{ success: boolean; error?: string; models?: readonly string[] }> {
    const key = apiKeyOverride || (await credentialService.getCredential('gemini'));
    if (!key) {
      return {
        success: false,
        error: 'No Gemini API key provided. Enter an API key before testing connection.',
      };
    }

    try {
      // Header x-goog-api-key avoids putting credential in URL query
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
        method: 'GET',
        headers: {
          'x-goog-api-key': key,
        },
      });

      if (!res.ok) {
        if (res.status === 400 || res.status === 403 || res.status === 401) {
          return {
            success: false,
            error: 'Authentication failed: Invalid Google Gemini API key or quota exceeded.',
          };
        }
        return {
          success: false,
          error: `Google Gemini returned HTTP ${res.status}: ${res.statusText}`,
        };
      }

      const data = (await res.json()) as {
        models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
      };
      const rawModels = (data.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => (m.name ?? '').replace(/^models\//, ''))
        .filter((name) => name.startsWith('gemini-'))
        .sort();

      const models = rawModels.length > 0 ? rawModels : this.metadata.supportedModels;
      return {
        success: true,
        models,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Network error connecting to Google Gemini: ${msg}. Check your internet connection.`,
      };
    }
  }

  async discoverModels(): Promise<readonly string[]> {
    const test = await this.testConnection();
    return test.models && test.models.length > 0 ? test.models : this.metadata.supportedModels;
  }

  async getModelProvider(modelId?: string): Promise<ModelProvider> {
    const savedModel = (await localData.settings.getSetting('ai.provider.gemini.model'))?.value;
    const targetModel = modelId || (typeof savedModel === 'string' && savedModel ? savedModel : this.metadata.defaultModel);
    return new GeminiModelProvider(targetModel);
  }
}

export const geminiProvider = new GeminiProvider();
