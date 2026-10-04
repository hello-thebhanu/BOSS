import { TauriStorageGateway } from './database/tauriStorageGateway';
import { ConversationRepository, HistoryRepository, MemoryRepository, MessageRepository, PermissionAuditRepository, ProjectRepository, SettingsRepository } from './repositories/repositories';
const gateway = new TauriStorageGateway();
export const localData = { projects: new ProjectRepository(gateway), conversations: new ConversationRepository(gateway), messages: new MessageRepository(gateway), history: new HistoryRepository(gateway), memory: new MemoryRepository(gateway), settings: new SettingsRepository(gateway), permissions: new PermissionAuditRepository(gateway) };
