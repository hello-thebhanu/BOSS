import type { PermissionKind } from '../../core/security/permissions';

export type ToolResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };
export interface Tool<I, O> { readonly name: string; readonly description: string; readonly inputSchema: unknown; readonly permissions: readonly PermissionKind[]; execute(input: I): Promise<ToolResult<O>>; }
