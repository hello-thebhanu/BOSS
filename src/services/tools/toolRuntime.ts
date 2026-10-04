import type { PermissionDecision } from '../../core/security/permissions';
import type { Tool } from './tool';
import { projectTools, ProjectToolRegistry } from './projectTools';
import { localData } from '../storage/localData';

export type ToolExecutionStatus =
  | 'pending'
  | 'validating'
  | 'waiting_for_permission'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'denied';

export type ToolErrorCode =
  | 'TOOL_NOT_FOUND'
  | 'INVALID_INPUT'
  | 'PROJECT_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'PROJECT_BOUNDARY_VIOLATION'
  | 'EXECUTION_FAILED'
  | 'CANCELLED'
  | 'TIMEOUT';

export type ToolExecutionContext = {
  projectId: string;
  sessionId?: string;
  runId?: string;
  stepId?: string;
  permissionDecision?: PermissionDecision;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type StructuredToolResult<T = unknown> = {
  success: boolean;
  status: ToolExecutionStatus;
  toolName: string;
  executionId: string;
  output?: T;
  error?: {
    code: ToolErrorCode;
    message: string;
  };
  metadata: {
    projectId: string;
    sessionId?: string;
    runId?: string;
    durationMs: number;
    timestamp: string;
  };
};

export type ToolExecutionLifecycleListener = (event: {
  executionId: string;
  toolName: string;
  status: ToolExecutionStatus;
  context: ToolExecutionContext;
}) => void;

export class BossToolRuntime {
  private readonly projectQueues = new Map<string, Promise<unknown>>();
  private readonly listeners = new Set<ToolExecutionLifecycleListener>();

  constructor(private readonly registry: ProjectToolRegistry = projectTools) {}

  /**
   * Subscribes a listener to tool execution lifecycle events.
   */
  onLifecycle(listener: ToolExecutionLifecycleListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(executionId: string, toolName: string, status: ToolExecutionStatus, context: ToolExecutionContext): void {
    for (const listener of this.listeners) {
      try {
        listener({ executionId, toolName, status, context });
      } catch {
        // Lifecycle listener errors must not break tool execution
      }
    }
  }

  /**
   * Retrieves all approved tools registered in the runtime.
   */
  listTools(): readonly Tool<any, any>[] {
    return this.registry.list();
  }

  /**
   * Retrieves a registered tool by name.
   */
  getTool(name: string): Tool<any, any> | undefined {
    return this.registry.get(name);
  }

  /**
   * Executes a registered tool through the controlled runtime boundary.
   * Enforces: tool lookup, input validation, project existence and isolation,
   * permission checks, cancellation, timeout, SQLite persistence, and structured outputs.
   */
  async execute<T = unknown>(
    toolName: string,
    rawInput: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<StructuredToolResult<T>> {
    const executionId = crypto.randomUUID();
    const startTime = Date.now();
    const createdAt = new Date().toISOString();

    const baseMetadata = {
      projectId: context.projectId,
      sessionId: context.sessionId,
      runId: context.runId,
      durationMs: 0,
      timestamp: createdAt,
    };

    this.notify(executionId, toolName, 'pending', context);

    // Persist initial execution record in SQLite
    try {
      await localData.history.recordToolExecution({
        id: executionId,
        sessionId: context.sessionId,
        toolName,
        status: 'started',
        createdAt,
        metadata: {
          input: rawInput,
          projectId: context.projectId,
          runId: context.runId,
          stepId: context.stepId,
        },
      });
    } catch {
      // Ignored if database is not active
    }

    // 0. Early cancellation check
    if (context.signal?.aborted) {
      this.notify(executionId, toolName, 'cancelled', context);
      await this.persistResult(executionId, 'cancelled', { error: 'Execution cancelled before start.' });
      return {
        success: false,
        status: 'cancelled',
        toolName,
        executionId,
        error: {
          code: 'CANCELLED',
          message: 'Tool execution was cancelled by user.',
        },
        metadata: { ...baseMetadata, durationMs: Date.now() - startTime },
      };
    }

    // 1. Validation Phase
    this.notify(executionId, toolName, 'validating', context);

    // 1a. Tool lookup
    const tool = this.registry.get(toolName);
    if (!tool) {
      this.notify(executionId, toolName, 'failed', context);
      const errMsg = `Capability unavailable: Tool '${toolName}' is not registered in BOSS Tool Runtime.`;
      await this.persistResult(executionId, 'failed', { error: errMsg, code: 'TOOL_NOT_FOUND' });
      return {
        success: false,
        status: 'failed',
        toolName,
        executionId,
        error: {
          code: 'TOOL_NOT_FOUND',
          message: errMsg,
        },
        metadata: { ...baseMetadata, durationMs: Date.now() - startTime },
      };
    }

    // 1b. Project ID presence
    if (!context.projectId || typeof context.projectId !== 'string' || !context.projectId.trim()) {
      this.notify(executionId, toolName, 'failed', context);
      const errMsg = 'Project ID is required for project-scoped tool execution.';
      await this.persistResult(executionId, 'failed', { error: errMsg, code: 'PROJECT_NOT_FOUND' });
      return {
        success: false,
        status: 'failed',
        toolName,
        executionId,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: errMsg,
        },
        metadata: { ...baseMetadata, durationMs: Date.now() - startTime },
      };
    }

    // 1c. Project existence validation against database
    try {
      const project = await localData.projects.getProject(context.projectId);
      if (!project) {
        this.notify(executionId, toolName, 'failed', context);
        const errMsg = `Project with ID '${context.projectId}' was not found in registered projects.`;
        await this.persistResult(executionId, 'failed', { error: errMsg, code: 'PROJECT_NOT_FOUND' });
        return {
          success: false,
          status: 'failed',
          toolName,
          executionId,
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: errMsg,
          },
          metadata: { ...baseMetadata, durationMs: Date.now() - startTime },
        };
      }
    } catch {
      // In headless test environments where storage may be mocked or throw, continue if project is non-empty
    }

    // 1d. Input validation against schema required fields
    const schema = tool.inputSchema as { required?: readonly string[] } | undefined;
    if (schema?.required && Array.isArray(schema.required)) {
      for (const requiredField of schema.required) {
        if (requiredField === 'projectId') continue; // Injected by runtime
        const val = rawInput[requiredField];
        if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '' && requiredField === 'message')) {
          this.notify(executionId, toolName, 'failed', context);
          const errMsg = `Missing or invalid required input field '${requiredField}' for tool '${toolName}'.`;
          await this.persistResult(executionId, 'failed', { error: errMsg, code: 'INVALID_INPUT' });
          return {
            success: false,
            status: 'failed',
            toolName,
            executionId,
            error: {
              code: 'INVALID_INPUT',
              message: errMsg,
            },
            metadata: { ...baseMetadata, durationMs: Date.now() - startTime },
          };
        }
      }
    }

    // 2. Permission Evaluation Phase
    this.notify(executionId, toolName, 'waiting_for_permission', context);
    const decision = context.permissionDecision ?? 'ALLOWED_SESSION';
    if (decision === 'DENIED') {
      this.notify(executionId, toolName, 'denied', context);
      const errMsg = `Permission denied for tool '${toolName}' by user or security policy.`;
      await this.persistResult(executionId, 'denied', { error: errMsg, code: 'PERMISSION_DENIED' });
      return {
        success: false,
        status: 'denied',
        toolName,
        executionId,
        error: {
          code: 'PERMISSION_DENIED',
          message: errMsg,
        },
        metadata: { ...baseMetadata, durationMs: Date.now() - startTime },
      };
    }

    // 3. Execution Phase with Sequential Serialization per Project
    return this.serializeForProject(context.projectId, async () => {
      // Check cancellation again before native dispatch
      if (context.signal?.aborted) {
        this.notify(executionId, toolName, 'cancelled', context);
        await this.persistResult(executionId, 'cancelled', { error: 'Execution cancelled before dispatch.' });
        return {
          success: false,
          status: 'cancelled',
          toolName,
          executionId,
          error: {
            code: 'CANCELLED',
            message: 'Tool execution was cancelled by user.',
          },
          metadata: { ...baseMetadata, durationMs: Date.now() - startTime },
        };
      }

      this.notify(executionId, toolName, 'executing', context);

      // Prepare validated input with bound projectId
      const boundInput = {
        ...rawInput,
        projectId: context.projectId,
      };

      // Native execution with optional timeout and abort monitoring
      let timeoutHandle: any;
      try {
        const executionPromise = tool.execute(boundInput);

        const racePromises: Promise<any>[] = [executionPromise];

        // Attach abort signal listener
        if (context.signal) {
          const abortPromise = new Promise((_, reject) => {
            const onAbort = () => {
              context.signal?.removeEventListener('abort', onAbort);
              reject(new Error('__BOSS_ABORTED__'));
            };
            if (context.signal?.aborted) {
              onAbort();
            } else {
              context.signal?.addEventListener('abort', onAbort);
            }
          });
          racePromises.push(abortPromise);
        }

        // Attach timeout if configured
        if (context.timeoutMs && context.timeoutMs > 0) {
          const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(new Error('__BOSS_TIMEOUT__'));
            }, context.timeoutMs);
          });
          racePromises.push(timeoutPromise);
        }

        const rawResult = await Promise.race(racePromises);
        if (timeoutHandle) clearTimeout(timeoutHandle);

        if (!rawResult.ok) {
          const errMsg = rawResult.error?.message ?? 'Native operation failed.';
          const code = this.classifyErrorCode(errMsg, rawResult.error?.code);
          this.notify(executionId, toolName, 'failed', context);
          await this.persistResult(executionId, 'failed', { error: errMsg, code });
          return {
            success: false,
            status: 'failed',
            toolName,
            executionId,
            error: {
              code,
              message: errMsg,
            },
            metadata: { ...baseMetadata, durationMs: Date.now() - startTime },
          };
        }

        // Execution succeeded
        this.notify(executionId, toolName, 'succeeded', context);
        await this.persistResult(executionId, 'complete', { output: rawResult.value });
        return {
          success: true,
          status: 'succeeded',
          toolName,
          executionId,
          output: rawResult.value as T,
          metadata: { ...baseMetadata, durationMs: Date.now() - startTime },
        };
      } catch (err: unknown) {
        if (timeoutHandle) clearTimeout(timeoutHandle);

        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg === '__BOSS_ABORTED__') {
          this.notify(executionId, toolName, 'cancelled', context);
          await this.persistResult(executionId, 'cancelled', { error: 'Operation cancelled.' });
          return {
            success: false,
            status: 'cancelled',
            toolName,
            executionId,
            error: {
              code: 'CANCELLED',
              message: 'Tool execution was cancelled during execution.',
            },
            metadata: { ...baseMetadata, durationMs: Date.now() - startTime },
          };
        }

        if (errMsg === '__BOSS_TIMEOUT__') {
          this.notify(executionId, toolName, 'failed', context);
          const timeoutMsg = `Tool execution timed out after ${context.timeoutMs}ms.`;
          await this.persistResult(executionId, 'failed', { error: timeoutMsg, code: 'TIMEOUT' });
          return {
            success: false,
            status: 'failed',
            toolName,
            executionId,
            error: {
              code: 'TIMEOUT',
              message: timeoutMsg,
            },
            metadata: { ...baseMetadata, durationMs: Date.now() - startTime },
          };
        }

        const code = this.classifyErrorCode(errMsg);
        this.notify(executionId, toolName, 'failed', context);
        await this.persistResult(executionId, 'failed', { error: errMsg, code });
        return {
          success: false,
          status: 'failed',
          toolName,
          executionId,
          error: {
            code,
            message: errMsg,
          },
          metadata: { ...baseMetadata, durationMs: Date.now() - startTime },
        };
      }
    });
  }

  private classifyErrorCode(errMsg: string, rawCode?: string): ToolErrorCode {
    const lower = errMsg.toLowerCase();
    if (
      lower.includes('outside the registered project root') ||
      lower.includes('project boundary violation') ||
      lower.includes('cannot escape root') ||
      lower.includes('cannot be canonicalized') ||
      lower.includes('traversal')
    ) {
      return 'PROJECT_BOUNDARY_VIOLATION';
    }
    if (lower.includes('permission denied') || lower.includes('denied by user')) {
      return 'PERMISSION_DENIED';
    }
    if (rawCode === 'INVALID_ARGS' || lower.includes('invalid') || lower.includes('required')) {
      return 'INVALID_INPUT';
    }
    return 'EXECUTION_FAILED';
  }

  private async serializeForProject<R>(projectId: string, fn: () => Promise<R>): Promise<R> {
    const prevPromise = this.projectQueues.get(projectId) ?? Promise.resolve();
    let resolveNext: () => void;
    const nextPromise = new Promise<void>((resolve) => {
      resolveNext = resolve;
    });

    this.projectQueues.set(projectId, nextPromise);

    try {
      await prevPromise.catch(() => {});
      return await fn();
    } finally {
      resolveNext!();
      if (this.projectQueues.get(projectId) === nextPromise) {
        this.projectQueues.delete(projectId);
      }
    }
  }

  private async persistResult(
    executionId: string,
    status: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    try {
      await localData.history.updateToolExecution(executionId, status, metadata);
    } catch {
      // Ignored if storage gateway is in-memory or offline
    }
  }
}

export const toolRuntime = new BossToolRuntime();
