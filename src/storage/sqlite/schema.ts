/** Schema migration identifiers. SQLite adapter and migrations are intentionally deferred to the native layer. */
export const storageTables = ['conversations', 'messages', 'projects', 'settings', 'model_configurations', 'memory', 'tool_history', 'permissions', 'application_events'] as const;
