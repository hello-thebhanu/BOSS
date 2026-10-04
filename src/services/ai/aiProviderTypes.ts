import type { ModelProvider } from './modelProvider';

export type AIProviderId = 'ollama' | 'openai' | 'gemini';
export type AIProviderType = 'local' | 'cloud';

export type AIProviderStatus =
  | 'connected'
  | 'not_connected'
  | 'not_installed'
  | 'unavailable'
  | 'configured'
  | 'error'
  | 'testing';

export interface AIProviderMetadata {
  id: AIProviderId;
  name: string;
  type: AIProviderType;
  tagline: string;
  description: string;
  defaultModel: string;
  supportedModels: readonly string[];
  requiresApiKey: boolean;
  pricingNotice: string;
  privacyNotice: string;
  websiteUrl: string;
  pricingUrl: string;
  docsUrl: string;
  apiKeyUrl?: string;
}

export interface AIProviderStatusResult {
  providerId: AIProviderId;
  status: AIProviderStatus;
  reason?: string;
  models: readonly string[];
  activeModel: string;
  hasCredential?: boolean;
}

export interface AIProvider {
  readonly id: AIProviderId;
  readonly metadata: AIProviderMetadata;
  getStatus(): Promise<AIProviderStatusResult>;
  testConnection(apiKeyOverride?: string): Promise<{ success: boolean; error?: string; models?: readonly string[] }>;
  discoverModels(): Promise<readonly string[]>;
  getModelProvider(modelId?: string): Promise<ModelProvider>;
}
