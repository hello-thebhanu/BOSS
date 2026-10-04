import type { AgentAction, Conversation, MemoryItem, Message, PermissionAudit, Project, Session, Setting, ToolExecution } from '../types/entities';
export interface StorageGateway {
  projects: { create(value: Project): Promise<Project>; get(id: string): Promise<Project | null>; list(): Promise<readonly Project[]>; update(value: Project): Promise<Project>; delete(id: string): Promise<void> };
  conversations: { create(value: Conversation): Promise<Conversation>; get(id: string): Promise<Conversation | null>; list(): Promise<readonly Conversation[]>; update(value: Conversation): Promise<Conversation>; delete(id: string): Promise<void> };
  messages: { create(value: Message & { conversationId: string }): Promise<Message>; get(id: string): Promise<Message | null>; list(conversationId: string): Promise<readonly Message[]>; delete(id: string): Promise<void> };
  sessions: { list(): Promise<readonly Session[]>; create?(value: Session): Promise<Session>; finish?(id: string, endedAt: string): Promise<void> };
  agentActions: { list(sessionId?: string): Promise<readonly AgentAction[]>; create?(value: AgentAction): Promise<AgentAction>; updateStatus?(id: string, status: 'started' | 'complete' | 'failed', metadata?: Record<string, unknown>): Promise<void> };
  toolExecutions: { list(sessionId?: string): Promise<readonly ToolExecution[]>; create?(value: ToolExecution): Promise<ToolExecution>; updateStatus?(id: string, status: string, metadata?: Record<string, unknown>): Promise<void> };
  memory: { list(): Promise<readonly MemoryItem[]> }; settings: { get(key: string): Promise<Setting | null>; set(value: Setting): Promise<Setting> }; permissionAudit: { list(): Promise<readonly PermissionAudit[]> };
}
