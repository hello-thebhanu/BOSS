export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type MessageStatus = 'pending' | 'streaming' | 'complete' | 'failed';
export type ToolCallRecord = { id: string; toolName: string; status: MessageStatus; input: unknown; result?: unknown };
export type Message = { id: string; role: MessageRole; content: string; timestamp: string; status: MessageStatus; attachments: readonly string[]; toolCalls: readonly ToolCallRecord[]; metadata: Record<string, unknown> };
export type Conversation = { id: string; title: string; projectId?: string; createdAt: string; updatedAt: string; messages: readonly Message[] };
