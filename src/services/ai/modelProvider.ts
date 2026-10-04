import type { Conversation, Message } from '../../core/types/conversation';

export type ModelStatus = 'unloaded' | 'loading' | 'ready' | 'error';
export type GenerationRequest = { conversation: Conversation; signal?: AbortSignal };
export type StreamEvent = { type: 'token'; value: string } | { type: 'tool-request'; name: string; input: unknown } | { type: 'complete'; message: Message };

export interface ModelProvider {
  readonly id: string;
  load(): Promise<void>;
  unload(): Promise<void>;
  generate(request: GenerationRequest): Promise<Message>;
  stream(request: GenerationRequest): AsyncIterable<StreamEvent>;
  cancel(): Promise<void>;
  getStatus(): Promise<ModelStatus>;
}

function assertLoopback(endpoint: string) {
  try {
    const parsed = new URL(endpoint.trim());
    const hostname = parsed.hostname.toLowerCase();
    const isLoopback =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname === '127.0.0.1.';
    if (!isLoopback) {
      throw new Error(`Security boundary violation: Endpoint '${endpoint}' is not a local loopback address. Cloud providers and remote endpoints are strictly prohibited in Local AI.`);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Security boundary violation')) throw err;
    throw new Error(`Malformed Local AI endpoint: '${endpoint}'`);
  }
}

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

export class LocalModelProvider implements ModelProvider {
  private status: ModelStatus = 'unloaded';
  private activeAbortController: AbortController | null = null;

  constructor(
    public readonly id: string,
    public readonly runtime: 'ollama' | 'llama.cpp',
    public readonly endpoint: string
  ) {}

  async load(): Promise<void> {
    assertLoopback(this.endpoint);
    this.status = 'ready';
  }

  async unload(): Promise<void> {
    this.cancel();
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
    assertLoopback(this.endpoint);
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
        throw new Error('Cannot generate response: conversation history contains no non-empty messages.');
      }

      let content = '';

      if (this.runtime === 'ollama') {
        const res = await fetch(`${this.endpoint}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            model: this.id,
            messages,
            stream: false,
          }),
          signal: abortCtrl.signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Ollama HTTP error ${res.status} (${res.statusText}): ${errText}`);
        }

        const data = (await res.json()) as { error?: string; message?: { content?: string } };
        if (data.error) {
          throw new Error(`Ollama runtime error: ${data.error}`);
        }
        content = data.message?.content ?? '';
      } else {
        // llama.cpp or OpenAI-compatible local server
        const res = await fetch(`${this.endpoint}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            model: this.id,
            messages,
            stream: false,
          }),
          signal: abortCtrl.signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`llama.cpp HTTP error ${res.status} (${res.statusText}): ${errText}`);
        }

        const data = (await res.json()) as { error?: string | { message?: string }; choices?: Array<{ message?: { content?: string } }> };
        if (data.error) {
          const msg = typeof data.error === 'object' ? data.error.message : data.error;
          throw new Error(`llama.cpp runtime error: ${msg}`);
        }
        content = data.choices?.[0]?.message?.content ?? '';
      }

      if (!content || !content.trim()) {
        throw new Error(`Local model '${this.id}' returned an empty completion.`);
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
          runtime: this.runtime,
          endpoint: this.endpoint,
        },
      };
    } catch (err: unknown) {
      this.status = 'error';
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Local AI generation failed for model '${this.id}': ${msg}`);
    } finally {
      this.activeAbortController = null;
    }
  }

  async *stream(request: GenerationRequest): AsyncIterable<StreamEvent> {
    assertLoopback(this.endpoint);
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
        throw new Error('Cannot stream response: conversation history contains no non-empty messages.');
      }

      if (this.runtime === 'ollama') {
        const res = await fetch(`${this.endpoint}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.id,
            messages,
            stream: true,
          }),
          signal: abortCtrl.signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Ollama HTTP error ${res.status} (${res.statusText}): ${errText}`);
        }

        if (!res.body) {
          throw new Error('Ollama streaming response body is null');
        }

        for await (const line of readLines(res.body)) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed) as { error?: string; message?: { content?: string }; done?: boolean };
            if (parsed.error) {
              throw new Error(`Ollama stream error: ${parsed.error}`);
            }
            if (parsed.message?.content) {
              accumulated += parsed.message.content;
              yield { type: 'token', value: parsed.message.content };
            }
            if (parsed.done) {
              break;
            }
          } catch (e: unknown) {
            if (e instanceof Error && e.message.includes('Ollama stream error')) throw e;
            // Ignore partial/unparseable json fragment if any
          }
        }
      } else {
        // llama.cpp SSE stream
        const res = await fetch(`${this.endpoint}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.id,
            messages,
            stream: true,
          }),
          signal: abortCtrl.signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`llama.cpp HTTP error ${res.status} (${res.statusText}): ${errText}`);
        }

        if (!res.body) {
          throw new Error('llama.cpp streaming response body is null');
        }

        for await (const line of readLines(res.body)) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload) as {
              error?: string | { message?: string };
              choices?: Array<{ delta?: { content?: string } }>;
            };
            if (parsed.error) {
              const msg = typeof parsed.error === 'object' ? parsed.error.message : parsed.error;
              throw new Error(`llama.cpp stream error: ${msg}`);
            }
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              accumulated += token;
              yield { type: 'token', value: token };
            }
          } catch (e: unknown) {
            if (e instanceof Error && e.message.includes('llama.cpp stream error')) throw e;
          }
        }
      }

      if (!accumulated.trim()) {
        throw new Error(`Local model '${this.id}' streamed an empty response.`);
      }

      this.status = 'ready';
      const completeMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: accumulated,
        timestamp: new Date().toISOString(),
        status: 'complete',
        attachments: [],
        toolCalls: [],
        metadata: {
          model: this.id,
          runtime: this.runtime,
          endpoint: this.endpoint,
        },
      };

      yield { type: 'complete', message: completeMessage };
    } catch (err: unknown) {
      this.status = 'error';
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Local AI stream failed for model '${this.id}': ${msg}`);
    } finally {
      this.activeAbortController = null;
    }
  }
}
