import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BossToolRuntime, toolRuntime } from './toolRuntime';
import { projectTools } from './projectTools';
import { localData } from '../storage/localData';
import { BossAgentOrchestrator } from '../agent/agent';
import { projectFilesystem } from '../filesystem/projectFilesystem';
import { terminalService } from '../terminal/terminalService';
import { gitService } from '../git/gitService';

describe('BossToolRuntime — Phase 12.10 Comprehensive Validation', () => {
  let runtime: BossToolRuntime;

  beforeEach(() => {
    runtime = new BossToolRuntime();
    vi.restoreAllMocks();
  });

  // 1. Tool lookup success
  it('1. Tool lookup success: retrieves registered tools by name', () => {
    const tool = runtime.getTool('fs_read');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('fs_read');
    expect(toolRuntime.getTool('git_status')).toBeDefined();
  });

  // 2. Unknown tool rejection
  it('2. Unknown tool rejection: rejects unregistered tools with TOOL_NOT_FOUND', async () => {
    const res = await runtime.execute('unknown_dangerous_tool', {}, { projectId: 'p1' });
    expect(res.success).toBe(false);
    expect(res.status).toBe('failed');
    expect(res.error?.code).toBe('TOOL_NOT_FOUND');
    expect(res.error?.message).toContain('is not registered');
  });

  // 3. Valid input
  it('3. Valid input: succeeds when required parameters are provided', async () => {
    vi.spyOn(projectFilesystem, 'read').mockResolvedValueOnce('file contents');

    const res = await runtime.execute('fs_read', { relativePath: 'hello.txt' }, { projectId: 'p1' });
    expect(res.success).toBe(true);
    expect(res.status).toBe('succeeded');
    expect(res.output).toEqual({ content: 'file contents' });
  });

  // 4. Invalid input
  it('4. Invalid input: rejects execution with INVALID_INPUT when required fields are missing', async () => {
    const res = await runtime.execute('fs_write', { relativePath: 'test.txt' }, { projectId: 'p1' }); // missing content
    expect(res.success).toBe(false);
    expect(res.status).toBe('failed');
    expect(res.error?.code).toBe('INVALID_INPUT');
    expect(res.error?.message).toContain('content');
  });

  // 5. Missing project
  it('5. Missing project: rejects execution with PROJECT_NOT_FOUND when projectId is missing or empty', async () => {
    const res = await runtime.execute('fs_read', { relativePath: 'test.txt' }, { projectId: '' });
    expect(res.success).toBe(false);
    expect(res.status).toBe('failed');
    expect(res.error?.code).toBe('PROJECT_NOT_FOUND');
  });

  // 6. Permission allowed
  it('6. Permission allowed: executes when permission is ALLOWED_SESSION or ALLOWED_ONCE', async () => {
    vi.spyOn(projectFilesystem, 'list').mockResolvedValueOnce([
      { name: 'README.md', relativePath: 'README.md', kind: 'file' },
    ]);

    const res = await runtime.execute('fs_list', { relativePath: '' }, {
      projectId: 'p1',
      permissionDecision: 'ALLOWED_SESSION',
    });
    expect(res.success).toBe(true);
    expect(res.status).toBe('succeeded');
  });

  // 7. Permission denied
  it('7. Permission denied: blocks execution and returns PERMISSION_DENIED when decision is DENIED', async () => {
    const fsRemoveSpy = vi.spyOn(projectFilesystem, 'remove');

    const res = await runtime.execute('fs_remove', { relativePath: 'src' }, {
      projectId: 'p1',
      permissionDecision: 'DENIED',
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe('denied');
    expect(res.error?.code).toBe('PERMISSION_DENIED');
    expect(fsRemoveSpy).not.toHaveBeenCalled();
  });

  // 8. Project boundary violation
  it('8. Project boundary violation: normalizes boundary errors to PROJECT_BOUNDARY_VIOLATION', async () => {
    vi.spyOn(projectFilesystem, 'read').mockRejectedValueOnce(
      new Error('Requested path is outside the registered project root')
    );

    const res = await runtime.execute('fs_read', { relativePath: '../../etc/passwd' }, { projectId: 'p1' });
    expect(res.success).toBe(false);
    expect(res.status).toBe('failed');
    expect(res.error?.code).toBe('PROJECT_BOUNDARY_VIOLATION');
  });

  // 9. Successful filesystem tool
  it('9. Successful filesystem tool: executes fs_write and updates file', async () => {
    const writeSpy = vi.spyOn(projectFilesystem, 'write').mockResolvedValueOnce();

    const res = await runtime.execute(
      'fs_write',
      { relativePath: 'src/main.rs', content: 'fn main() {}' },
      { projectId: 'p1' }
    );

    expect(res.success).toBe(true);
    expect(res.status).toBe('succeeded');
    expect(writeSpy).toHaveBeenCalledWith({ projectId: 'p1', relativePath: 'src/main.rs' }, 'fn main() {}');
  });

  // 10. Successful Git tool
  it('10. Successful Git tool: executes git_status and returns real repo status', async () => {
    vi.spyOn(gitService, 'status').mockResolvedValueOnce({
      isRepository: true,
      branch: 'main',
      entries: [
        { path: 'src/app.ts', state: 'staged', staged: true, unstaged: false },
      ],
    });

    const res = await runtime.execute<{ branch: string; isRepository: boolean }>('git_status', {}, { projectId: 'p1' });
    expect(res.success).toBe(true);
    expect(res.status).toBe('succeeded');
    expect(res.output?.branch).toBe('main');
    expect(res.output?.isRepository).toBe(true);
  });

  // 11. Successful terminal tool
  it('11. Successful terminal tool: executes terminal_run within project scope', async () => {
    vi.spyOn(terminalService, 'start').mockResolvedValueOnce({
      id: 'term-session-1',
      projectId: 'p1',
      cwd: 'C:/projects/my-app',
      status: 'running',
    });

    vi.spyOn(terminalService, 'send').mockResolvedValueOnce();

    const res = await runtime.execute<{ command: string; status: string }>(
      'terminal_run',
      { command: 'node -v' },
      { projectId: 'p1' }
    );

    expect(res.success).toBe(true);
    expect(res.status).toBe('succeeded');
    expect(res.output?.command).toBe('node -v');
    expect(res.output?.status).toBe('dispatched');
  });

  // 12. Tool execution persistence
  it('12. Tool execution persistence: records and updates tool execution in SQLite', async () => {
    const recordSpy = vi.spyOn(localData.history, 'recordToolExecution').mockResolvedValueOnce({} as any);
    const updateSpy = vi.spyOn(localData.history, 'updateToolExecution').mockResolvedValueOnce();

    vi.spyOn(projectFilesystem, 'read').mockResolvedValueOnce('persisted data');

    const res = await runtime.execute(
      'fs_read',
      { relativePath: 'config.json' },
      { projectId: 'p1', sessionId: 'sess-123' }
    );

    expect(res.success).toBe(true);
    expect(recordSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: res.executionId,
        sessionId: 'sess-123',
        toolName: 'fs_read',
        status: 'started',
      })
    );
    expect(updateSpy).toHaveBeenCalledWith(
      res.executionId,
      'complete',
      expect.objectContaining({ output: { content: 'persisted data' } })
    );
  });

  // 13. Structured error result
  it('13. Structured error result: formats consistent error and metadata objects', async () => {
    const res = await runtime.execute('unknown_tool', {}, { projectId: 'p1', sessionId: 'sess-abc' });
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe('TOOL_NOT_FOUND');
    expect(typeof res.error?.message).toBe('string');
    expect(res.metadata.projectId).toBe('p1');
    expect(res.metadata.sessionId).toBe('sess-abc');
    expect(typeof res.metadata.durationMs).toBe('number');
    expect(typeof res.metadata.timestamp).toBe('string');
  });

  // 14. Cancellation before execution
  it('14. Cancellation before execution: halts immediately if AbortSignal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const toolSpy = vi.spyOn(projectFilesystem, 'read');

    const res = await runtime.execute(
      'fs_read',
      { relativePath: 'hello.txt' },
      { projectId: 'p1', signal: controller.signal }
    );

    expect(res.success).toBe(false);
    expect(res.status).toBe('cancelled');
    expect(res.error?.code).toBe('CANCELLED');
    expect(toolSpy).not.toHaveBeenCalled();
  });

  // 15. Cancellation during supported execution
  it('15. Cancellation during supported execution: handles abort signal triggered during execution', async () => {
    const controller = new AbortController();

    vi.spyOn(projectFilesystem, 'read').mockImplementationOnce(async () => {
      // Simulate asynchronous work during which cancellation occurs
      controller.abort();
      await new Promise((r) => setTimeout(r, 10));
      return 'done';
    });

    const res = await runtime.execute(
      'fs_read',
      { relativePath: 'slow.txt' },
      { projectId: 'p1', signal: controller.signal }
    );

    expect(res.success).toBe(false);
    expect(res.status).toBe('cancelled');
    expect(res.error?.code).toBe('CANCELLED');
  });

  // 16. Agent → Tool Runtime integration
  it('16. Agent → Tool Runtime integration: Agent delegates executeStep to Tool Runtime', async () => {
    const agent = new BossAgentOrchestrator();
    const runtimeExecuteSpy = vi.spyOn(toolRuntime, 'execute').mockResolvedValueOnce({
      success: true,
      status: 'succeeded',
      toolName: 'git_status',
      executionId: 'exec-1',
      output: { branch: 'main', clean: true },
      metadata: { projectId: 'p1', durationMs: 5, timestamp: new Date().toISOString() },
    });

    const run: any = {
      id: 'run-1',
      projectId: 'p1',
      sessionId: 'sess-1',
      plan: {
        goal: 'Check status',
        steps: [{ id: '1', description: 'Check git status', toolName: 'git_status', input: {} }],
      },
    };

    const stepResult = await agent.executeStep(run, 0);
    expect(stepResult.ok).toBe(true);
    expect(stepResult.observation.output).toEqual({ branch: 'main', clean: true });
    expect(runtimeExecuteSpy).toHaveBeenCalledWith('git_status', {}, expect.objectContaining({ projectId: 'p1' }));
  });

  // 17. No direct Agent → native execution bypass
  it('17. No direct Agent → native execution bypass: Agent step fails safely if runtime rejects tool', async () => {
    const agent = new BossAgentOrchestrator();

    const run: any = {
      id: 'run-1',
      projectId: 'p1',
      plan: {
        goal: 'Invalid tool',
        steps: [{ id: '1', description: 'Execute invalid', toolName: 'malicious_tool' }],
      },
    };

    const stepResult = await agent.executeStep(run, 0);
    expect(stepResult.ok).toBe(false);
    expect(stepResult.error).toContain('is not registered');
  });

  // 18. Sequential execution safety
  it('18. Sequential execution safety: serializes tool executions on the same projectId', async () => {
    const executionOrder: number[] = [];

    vi.spyOn(projectFilesystem, 'read').mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 20));
      executionOrder.push(1);
      return 'first';
    });

    vi.spyOn(projectFilesystem, 'read').mockImplementationOnce(async () => {
      executionOrder.push(2);
      return 'second';
    });

    // Launch both concurrently on the same projectId
    const p1 = runtime.execute('fs_read', { relativePath: '1.txt' }, { projectId: 'same-proj' });
    const p2 = runtime.execute('fs_read', { relativePath: '2.txt' }, { projectId: 'same-proj' });

    await Promise.all([p1, p2]);

    expect(executionOrder).toEqual([1, 2]);
  });

  // 19. Tool execution lifecycle
  it('19. Tool execution lifecycle: transitions through pending, validating, waiting_for_permission, executing, succeeded', async () => {
    vi.spyOn(projectFilesystem, 'read').mockResolvedValueOnce('content');

    const lifecycleStatuses: string[] = [];
    const unsubscribe = runtime.onLifecycle((event) => {
      lifecycleStatuses.push(event.status);
    });

    await runtime.execute('fs_read', { relativePath: 'file.txt' }, { projectId: 'p1' });
    unsubscribe();

    expect(lifecycleStatuses).toEqual([
      'pending',
      'validating',
      'waiting_for_permission',
      'executing',
      'succeeded',
    ]);
  });

  // 20. Tools registry/runtime consistency
  it('20. Tools registry/runtime consistency: lists exactly the 14 approved capability tools', () => {
    const tools = runtime.listTools();
    expect(tools.length).toBe(14);

    const toolNames = tools.map((t) => t.name);
    const expected = [
      'fs_list',
      'fs_read',
      'fs_write',
      'fs_create_dir',
      'fs_rename',
      'fs_remove',
      'terminal_run',
      'git_status',
      'git_diff',
      'git_log',
      'git_branches',
      'git_stage',
      'git_unstage',
      'git_commit',
    ];

    for (const name of expected) {
      expect(toolNames).toContain(name);
    }
  });
});
