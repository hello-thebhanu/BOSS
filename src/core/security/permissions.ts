export type PermissionKind = 'READ_FILE' | 'WRITE_FILE' | 'DELETE_FILE' | 'RUN_COMMAND' | 'GIT_OPERATION' | 'NETWORK_REQUEST';
export type PermissionDecision = 'ALLOWED_ONCE' | 'ALLOWED_SESSION' | 'ALLOWED_ALWAYS' | 'DENIED';
export type PermissionRequest = { kind: PermissionKind; reason: string; resource?: string; projectId?: string };
export interface PermissionService { request(request: PermissionRequest): Promise<PermissionDecision>; revokeSession(): Promise<void>; }
