import type { Conversation, Message } from '../../../core/types/conversation';

export type Project = { id: string; name: string; path: string; stack?: string; createdAt: string; updatedAt: string };
export type Session = { id: string; projectId?: string; startedAt: string; endedAt?: string; context?: Record<string, unknown> };
export type AgentAction = { id: string; sessionId: string; action: string; status: 'started' | 'complete' | 'failed'; createdAt: string; metadata: Record<string, unknown> };
export type ToolExecution = { id: string; sessionId?: string; toolName: string; status: 'started' | 'complete' | 'failed' | 'cancelled' | 'denied'; createdAt: string; metadata: Record<string, unknown> };
export type MemoryItem = { id: string; category: string; content: string; source?: string; enabled: boolean; createdAt: string; updatedAt: string };
export type Setting = { key: string; value: unknown; updatedAt: string };
export type PermissionAuditDecision = 'ALLOWED_ONCE' | 'ALLOWED_SESSION' | 'ALLOWED_ALWAYS' | 'DENIED' | 'INTERRUPTED';
export type PermissionAudit = { id: string; action: string; capability: string; target?: string; decision: PermissionAuditDecision; sessionId?: string; actor: string; createdAt: string };
export type { Conversation, Message };
