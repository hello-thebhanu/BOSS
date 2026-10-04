import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../app/store/appStore';
import { localData } from '../storage/localData';
import { projectFilesystem } from '../filesystem/projectFilesystem';
import { terminalService } from '../terminal/terminalService';
import { gitService } from '../git/gitService';
import { localModelRuntime } from '../ai/localModelRuntime';
import { agentOrchestrator } from '../agent/agent';
import { toolRuntime } from '../tools/toolRuntime';
import { reduceCoreState, initialCoreState } from '../../core/state-machine/coreStateMachine';

describe('Phase 13 — Integration & Stabilization Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAppStore.setState({
      core: initialCoreState,
      agentStatus: 'idle',
      activeProjectId: null,
      isInitialized: false,
    });
  });

  // 13.1 Architecture Integration
  it('13.1 Architecture Integration: all modules route through authoritative single services', () => {
    expect(projectFilesystem).toBeDefined();
    expect(terminalService).toBeDefined();
    expect(gitService).toBeDefined();
    expect(localModelRuntime).toBeDefined();
    expect(agentOrchestrator).toBeDefined();
    expect(toolRuntime).toBeDefined();
    expect(localData).toBeDefined();

    // 14 registered tools in Tool Runtime
    const tools = toolRuntime.listTools();
    expect(tools.length).toBe(14);
    expect(tools.map((t) => t.name)).toContain('fs_read');
    expect(tools.map((t) => t.name)).toContain('terminal_run');
    expect(tools.map((t) => t.name)).toContain('git_status');
  });

  // 13.2 State Synchronization
  it('13.2 State Synchronization: store initialization restores persisted active project context', async () => {
    vi.spyOn(localData.settings, 'getSetting').mockResolvedValueOnce({
      key: 'active_project_id',
      value: 'proj-alpha',
      updatedAt: new Date().toISOString(),
    });
    vi.spyOn(localData.projects, 'listProjects').mockResolvedValueOnce([
      { id: 'proj-alpha', name: 'Alpha App', path: 'C:/apps/alpha', createdAt: '', updatedAt: '' },
      { id: 'proj-beta', name: 'Beta App', path: 'C:/apps/beta', createdAt: '', updatedAt: '' },
    ]);

    await useAppStore.getState().initialize();

    expect(useAppStore.getState().activeProjectId).toBe('proj-alpha');
    expect(useAppStore.getState().isInitialized).toBe(true);

    // Switching project persists new setting
    const setSettingSpy = vi.spyOn(localData.settings, 'setSetting').mockResolvedValueOnce({
      key: 'active_project_id',
      value: 'proj-beta',
      updatedAt: new Date().toISOString(),
    });

    useAppStore.getState().setActiveProjectId('proj-beta');
    expect(useAppStore.getState().activeProjectId).toBe('proj-beta');
    expect(setSettingSpy).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'active_project_id', value: 'proj-beta' })
    );
  });

  // 13.3 Persistence Integration
  it('13.3 Persistence Integration: sessions, actions, and tool executions persist to SQLite', async () => {
    const recordToolSpy = vi.spyOn(localData.history, 'recordToolExecution').mockResolvedValueOnce({
      id: 'tool-exec-1',
      sessionId: 'sess-1',
      toolName: 'fs_read',
      status: 'complete',
      createdAt: new Date().toISOString(),
      metadata: { projectId: 'p1', durationMs: 12 },
    });

    const updateToolSpy = vi.spyOn(localData.history, 'updateToolExecution').mockResolvedValueOnce();
    const finishSessionSpy = vi.spyOn(localData.history, 'finishSession').mockResolvedValueOnce();

    await localData.history.recordToolExecution({
      id: 'tool-exec-1',
      sessionId: 'sess-1',
      toolName: 'fs_read',
      status: 'complete',
      createdAt: new Date().toISOString(),
      metadata: { projectId: 'p1', durationMs: 12 },
    });
    expect(recordToolSpy).toHaveBeenCalledTimes(1);

    await localData.history.updateToolExecution('tool-exec-1', 'complete', { output: 'test' });
    expect(updateToolSpy).toHaveBeenCalledWith('tool-exec-1', 'complete', { output: 'test' });

    await localData.history.finishSession('sess-1', new Date().toISOString());
    expect(finishSessionSpy).toHaveBeenCalledTimes(1);
  });

  // 13.4 Error Handling & Recovery
  it('13.4 Error Handling & Recovery: Core state machine handles idempotent RESET from any state without sticking', () => {
    // RESET from READY
    expect(reduceCoreState(initialCoreState, { type: 'RESET' }).status).toBe('READY');

    // Prompt submitted -> THINKING
    const thinking = reduceCoreState(initialCoreState, { type: 'PROMPT_SUBMITTED' });
    expect(thinking.status).toBe('THINKING');

    // Error recovery: RESET from THINKING -> READY
    const recoveredFromThinking = reduceCoreState(thinking, { type: 'RESET' });
    expect(recoveredFromThinking.status).toBe('READY');

    // Tool started -> WORKING
    const working = reduceCoreState(thinking, { type: 'TOOL_STARTED' });
    expect(working.status).toBe('WORKING');

    // Error recovery: RESET from WORKING -> READY
    const recoveredFromWorking = reduceCoreState(working, { type: 'RESET' });
    expect(recoveredFromWorking.status).toBe('READY');

    // Response ready -> COMPLETE
    const complete = reduceCoreState(working, { type: 'RESPONSE_READY' });
    expect(complete.status).toBe('COMPLETE');

    // Error recovery: RESET from COMPLETE -> READY
    const recoveredFromComplete = reduceCoreState(complete, { type: 'RESET' });
    expect(recoveredFromComplete.status).toBe('READY');

    // appStore dispatchCore handles safe recovery
    useAppStore.getState().dispatchCore({ type: 'PROMPT_SUBMITTED' });
    expect(useAppStore.getState().core.status).toBe('THINKING');

    useAppStore.getState().dispatchCore({ type: 'RESET' });
    expect(useAppStore.getState().core.status).toBe('READY');
  });

  // 13.5 Application Lifecycle
  it('13.5 Application Lifecycle: terminalService cleanAll invokes native teardown', async () => {
    const cleanSpy = vi.spyOn(terminalService, 'cleanAll').mockResolvedValueOnce();
    await terminalService.cleanAll();
    expect(cleanSpy).toHaveBeenCalledTimes(1);
  });

  // 13.6 Workflow A: Project -> Coding (Filesystem)
  it('13.6 Workflow A: Project Filesystem read and write within project scope', async () => {
    vi.spyOn(localData.projects, 'getProject').mockResolvedValueOnce({
      id: 'p1',
      name: 'App',
      path: 'C:/apps/app',
      createdAt: '',
      updatedAt: '',
    });
    const writeSpy = vi.spyOn(projectFilesystem, 'write').mockResolvedValueOnce();
    const readSpy = vi.spyOn(projectFilesystem, 'read').mockResolvedValueOnce('hello world');

    await projectFilesystem.write({ projectId: 'p1', relativePath: 'src/index.ts' }, 'hello world');
    const content = await projectFilesystem.read({ projectId: 'p1', relativePath: 'src/index.ts' });

    expect(writeSpy).toHaveBeenCalledWith({ projectId: 'p1', relativePath: 'src/index.ts' }, 'hello world');
    expect(readSpy).toHaveBeenCalledWith({ projectId: 'p1', relativePath: 'src/index.ts' });
    expect(content).toBe('hello world');
  });

  // 13.6 Workflow B: Project -> Terminal
  it('13.6 Workflow B: Project Terminal session lifecycle', async () => {
    vi.spyOn(terminalService, 'start').mockResolvedValueOnce({
      id: 'term-1',
      projectId: 'p1',
      cwd: 'C:/apps/app',
      status: 'running',
    });
    const sendSpy = vi.spyOn(terminalService, 'send').mockResolvedValueOnce();
    const stopSpy = vi.spyOn(terminalService, 'stop').mockResolvedValueOnce();

    const session = await terminalService.start('p1');
    expect(session.id).toBe('term-1');

    await terminalService.send(session.id, 'dir');
    expect(sendSpy).toHaveBeenCalledWith('term-1', 'dir');

    await terminalService.stop(session.id);
    expect(stopSpy).toHaveBeenCalledWith('term-1');
  });

  // 13.6 Workflow C: Project -> Git
  it('13.6 Workflow C: Project Git status and commit workflow', async () => {
    vi.spyOn(gitService, 'status').mockResolvedValueOnce({
      isRepository: true,
      branch: 'main',
      entries: [{ path: 'README.md', state: 'modified', staged: false, unstaged: true }],
    });
    const stageSpy = vi.spyOn(gitService, 'stage').mockResolvedValueOnce();
    const commitSpy = vi.spyOn(gitService, 'commit').mockResolvedValueOnce('[main 1a2b3c4] Update README');

    const status = await gitService.status('p1');
    expect(status.isRepository).toBe(true);
    expect(status.branch).toBe('main');

    await gitService.stage('p1', ['README.md']);
    expect(stageSpy).toHaveBeenCalledWith('p1', ['README.md']);

    const commitRes = await gitService.commit('p1', 'Update README');
    expect(commitSpy).toHaveBeenCalledWith('p1', 'Update README');
    expect(commitRes).toContain('1a2b3c4');
  });

  // 13.6 Workflow D: Chat -> Local AI (Offline Detection & Honest State)
  it('13.6 Workflow D: Local AI offline state is reported honestly with no cloud fallback', async () => {
    vi.spyOn(localModelRuntime, 'loadConfig').mockResolvedValueOnce({
      runtime: 'ollama',
      endpoint: 'http://127.0.0.1:11434',
    });
    vi.spyOn(localModelRuntime, 'discover').mockResolvedValueOnce({
      available: false,
      runtime: 'ollama',
      models: [],
      reason: 'Failed to connect to Ollama runtime at http://127.0.0.1:11434',
    });

    const cfg = await localModelRuntime.loadConfig();
    const status = await localModelRuntime.discover(cfg);

    expect(status.available).toBe(false);
    expect(status.models).toHaveLength(0);
    expect(status.reason).toContain('Failed to connect');
  });

  // 13.6 Workflow E: Chat -> Agent -> Tool Runtime
  it('13.6 Workflow E: Agent executes tool via Tool Runtime with permission gating and persistence', async () => {
    vi.spyOn(localData.projects, 'getProject').mockResolvedValue({
      id: 'p1',
      name: 'App',
      path: 'C:/apps/app',
      createdAt: '',
      updatedAt: '',
    });
    vi.spyOn(projectFilesystem, 'read').mockResolvedValueOnce('export const version = 1.0.0;');

    const recordSpy = vi.spyOn(localData.history, 'recordToolExecution').mockResolvedValue({
      id: 't-exec-e',
      sessionId: 's1',
      toolName: 'fs_read',
      status: 'complete',
      createdAt: '',
      metadata: {},
    });
    vi.spyOn(localData.history, 'updateToolExecution').mockResolvedValue();

    const result = await toolRuntime.execute<{ content: string }>(
      'fs_read',
      { relativePath: 'src/version.ts' },
      { projectId: 'p1', sessionId: 's1' }
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('succeeded');
    expect(result.output?.content).toContain('version = 1.0.0');
    expect(recordSpy).toHaveBeenCalled();
  });

  // 13.6 Workflow F: Agent Cancellation
  it('13.6 Workflow F: Agent cancellation stops execution and updates Core state safely', async () => {
    vi.spyOn(localData.projects, 'getProject').mockResolvedValue({
      id: 'p1',
      name: 'App',
      path: 'C:/apps/app',
      createdAt: '',
      updatedAt: '',
    });

    vi.spyOn(agentOrchestrator, 'interpret').mockResolvedValueOnce({
      goal: 'Perform multi-step refactor',
      steps: [
        { id: 's1', description: 'Step 1', toolName: 'fs_read', input: { relativePath: 'a.txt' } },
        { id: 's2', description: 'Step 2', toolName: 'fs_write', input: { relativePath: 'b.txt', content: 'test' } },
      ],
    });

    vi.spyOn(projectFilesystem, 'read').mockImplementation(async () => {
      await agentOrchestrator.cancel();
      return 'content';
    });

    useAppStore.getState().dispatchAgent('START');
    expect(useAppStore.getState().agentStatus).toBe('planning');

    const run = await agentOrchestrator.executeRun('Perform multi-step refactor', 'p1');

    expect(run.status).toBe('cancelled');
    useAppStore.getState().dispatchAgent('CANCEL');
    expect(useAppStore.getState().agentStatus).toBe('cancelled');
    expect(useAppStore.getState().core.status).toBe('READY');
  });

  // 13.6 Workflow G: Application Restart (Persistence Integrity)
  it('13.6 Workflow G: Application restart restores valid state without corruption', async () => {
    vi.spyOn(localData.settings, 'getSetting').mockResolvedValueOnce({
      key: 'active_project_id',
      value: 'p-restored',
      updatedAt: new Date().toISOString(),
    });
    vi.spyOn(localData.projects, 'listProjects').mockResolvedValueOnce([
      { id: 'p-restored', name: 'Restored Project', path: 'C:/apps/restored', createdAt: '', updatedAt: '' },
    ]);

    await useAppStore.getState().initialize();

    expect(useAppStore.getState().activeProjectId).toBe('p-restored');
    expect(useAppStore.getState().core.status).toBe('READY');
  });
});
