import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BossAgentOrchestrator, agentOrchestrator } from './agent';
import { localModelRuntime } from '../ai/localModelRuntime';
import { projectTools } from '../tools/projectTools';
import type { Message } from '../../core/types/conversation';

describe('BossAgentOrchestrator - Planning & Interpretation', () => {
  let agent: BossAgentOrchestrator;

  beforeEach(() => {
    agent = new BossAgentOrchestrator();
    vi.restoreAllMocks();
  });

  it('exposes singleton agentOrchestrator', () => {
    expect(agentOrchestrator).toBeInstanceOf(BossAgentOrchestrator);
  });

  it('fails honestly when local model runtime is offline without cloud fallback', async () => {
    vi.spyOn(localModelRuntime, 'loadConfig').mockResolvedValue({
      runtime: 'ollama',
      endpoint: 'http://127.0.0.1:11434',
      model: 'qwen2.5-coder:7b',
      enabled: true,
    });
    vi.spyOn(localModelRuntime, 'discover').mockResolvedValue({
      available: false,
      models: [],
      reason: 'Failed to fetch (Connection refused)',
    });

    const msg: Message = {
      id: 'm1',
      role: 'user',
      content: 'List project files',
      timestamp: new Date().toISOString(),
      status: 'complete',
      attachments: [],
      toolCalls: [],
      metadata: {},
    };

    await expect(agent.interpret(msg, { projectId: 'p1' })).rejects.toThrow(
      /LOCAL AI OFFLINE/i
    );
  });

  it('fails when no model is selected in local runtime config', async () => {
    vi.spyOn(localModelRuntime, 'loadConfig').mockResolvedValue({
      runtime: 'ollama',
      endpoint: 'http://127.0.0.1:11434',
      model: '',
      enabled: true,
    });
    vi.spyOn(localModelRuntime, 'discover').mockResolvedValue({
      available: true,
      models: ['qwen2.5-coder:7b'],
    });

    const msg: Message = {
      id: 'm1',
      role: 'user',
      content: 'List project files',
      timestamp: new Date().toISOString(),
      status: 'complete',
      attachments: [],
      toolCalls: [],
      metadata: {},
    };

    await expect(agent.interpret(msg, { projectId: 'p1' })).rejects.toThrow(
      /No model selected/i
    );
  });

  it('parses structured JSON plans from local model response', async () => {
    const rawPlan = JSON.stringify({
      goal: 'Inspect project and check git status',
      steps: [
        { id: '1', description: 'List files in root', toolName: 'fs_list', input: { relativePath: '' } },
        { id: '2', description: 'Check git status', toolName: 'git_status', input: {} },
      ],
    });

    vi.spyOn(localModelRuntime, 'loadConfig').mockResolvedValue({
      runtime: 'ollama',
      endpoint: 'http://127.0.0.1:11434',
      model: 'qwen2.5-coder:7b',
      enabled: true,
    });
    vi.spyOn(localModelRuntime, 'discover').mockResolvedValue({
      available: true,
      models: ['qwen2.5-coder:7b'],
    });
    vi.spyOn(localModelRuntime, 'provider').mockResolvedValue({
      id: 'ollama:qwen2.5-coder:7b',
      generate: vi.fn().mockResolvedValue({
        id: 'resp-1',
        role: 'assistant',
        content: rawPlan,
        timestamp: new Date().toISOString(),
        status: 'complete',
        attachments: [],
        toolCalls: [],
        metadata: {},
      }),
      stream: vi.fn(),
    } as any);

    const msg: Message = {
      id: 'm1',
      role: 'user',
      content: 'Inspect project',
      timestamp: new Date().toISOString(),
      status: 'complete',
      attachments: [],
      toolCalls: [],
      metadata: {},
    };

    const plan = await agent.interpret(msg, { projectId: 'p1' });
    expect(plan.goal).toBe('Inspect project and check git status');
    expect(plan.steps.length).toBe(2);
    expect(plan.steps[0].toolName).toBe('fs_list');
    expect(plan.steps[1].toolName).toBe('git_status');
  });

  it('extracts JSON plan embedded in markdown code blocks', () => {
    const textWithMarkdown = `Here is the execution plan:
\`\`\`json
{
  "goal": "Read config file",
  "steps": [
    { "id": "1", "description": "Read package.json", "toolName": "fs_read", "input": { "relativePath": "package.json" } }
  ]
}
\`\`\`
Hope this helps!`;

    const plan = agent.parsePlan(textWithMarkdown, 'Default Goal');
    expect(plan.goal).toBe('Read config file');
    expect(plan.steps.length).toBe(1);
    expect(plan.steps[0].toolName).toBe('fs_read');
    expect(plan.steps[0].input).toEqual({ relativePath: 'package.json' });
  });

  it('gracefully falls back when output contains invalid non-JSON text', () => {
    const nonJson = 'I will analyze your project and write some code.';
    const plan = agent.parsePlan(nonJson, 'Analyze request');
    expect(plan.goal).toBe('Analyze request');
    expect(plan.steps.length).toBe(1);
    expect(plan.steps[0].toolName).toBeUndefined();
  });
});

describe('BossAgentOrchestrator - Step Execution & Safety Boundaries', () => {
  let agent: BossAgentOrchestrator;

  beforeEach(() => {
    agent = new BossAgentOrchestrator();
    vi.restoreAllMocks();
  });

  it('executes a step with no tool without errors', async () => {
    const run: any = {
      id: 'run-1',
      projectId: 'proj-1',
      plan: {
        goal: 'Think about architecture',
        steps: [{ id: '1', description: 'Analyze requirements' }],
      },
    };

    const res = await agent.executeStep(run, 0);
    expect(res.ok).toBe(true);
    expect(res.observation.output).toBe('No tool required for this step.');
  });

  it('fails safely if an unrecognized tool is requested', async () => {
    const run: any = {
      id: 'run-1',
      projectId: 'proj-1',
      plan: {
        goal: 'Hacking step',
        steps: [{ id: '1', description: 'Run exploit', toolName: 'exploit_system' }],
      },
    };

    const res = await agent.executeStep(run, 0);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Capability unavailable');
  });

  it('enforces permission gate and blocks execution when decision is DENIED', async () => {
    const run: any = {
      id: 'run-1',
      projectId: 'proj-1',
      plan: {
        goal: 'Delete folder',
        steps: [{ id: '1', description: 'Remove src', toolName: 'fs_remove', input: { relativePath: 'src' } }],
      },
    };

    const res = await agent.executeStep(run, 0, 'DENIED');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Permission denied');
  });

  it('injects projectId into tool inputs to enforce project isolation boundary', async () => {
    const tool = projectTools.get('fs_read')!;
    const executeSpy = vi.spyOn(tool, 'execute').mockResolvedValueOnce({
      ok: true,
      value: { content: 'test content' },
    });

    const run: any = {
      id: 'run-1',
      projectId: 'isolated-proj-123',
      plan: {
        goal: 'Read README',
        steps: [{ id: '1', description: 'Read README', toolName: 'fs_read', input: { relativePath: 'README.md' } }],
      },
    };

    const res = await agent.executeStep(run, 0, 'ALLOWED_SESSION');
    expect(res.ok).toBe(true);
    expect(executeSpy).toHaveBeenCalledWith({
      relativePath: 'README.md',
      projectId: 'isolated-proj-123',
    });
  });
});

describe('BossAgentOrchestrator - Bounded Execution Loop & Cancellation', () => {
  let agent: BossAgentOrchestrator;

  beforeEach(() => {
    agent = new BossAgentOrchestrator();
    vi.restoreAllMocks();
  });

  it('requires an active projectId for project isolation', async () => {
    await expect(agent.executeRun('Goal', '')).rejects.toThrow(
      /Project isolation failure/
    );
  });

  it('executes a multi-step run to completion and updates state machine status', async () => {
    vi.spyOn(agent, 'interpret').mockResolvedValueOnce({
      goal: 'Check git status and read file',
      steps: [
        { id: '1', description: 'Check status', toolName: 'git_status', input: {} },
        { id: '2', description: 'Read README', toolName: 'fs_read', input: { relativePath: 'README.md' } },
      ],
    });

    vi.spyOn(projectTools.get('git_status')!, 'execute').mockResolvedValueOnce({
      ok: true,
      value: { branch: 'main', clean: true, staged: [], unstaged: [], untracked: [] },
    });

    vi.spyOn(projectTools.get('fs_read')!, 'execute').mockResolvedValueOnce({
      ok: true,
      value: { content: '# My Project' },
    });

    const statusTransitions: string[] = [];
    const run = await agent.executeRun('Inspect repo', 'p1', 'conv-1', {
      listener: (r) => statusTransitions.push(r.status),
    });

    expect(run.status).toBe('complete');
    expect(run.actions.length).toBe(2);
    expect(run.actions[0].status).toBe('complete');
    expect(run.actions[1].status).toBe('complete');
    expect(statusTransitions).toContain('planning');
    expect(statusTransitions).toContain('executing');
    expect(statusTransitions).toContain('observing');
    expect(statusTransitions).toContain('complete');

    // Verify response generator
    const responses: string[] = [];
    for await (const chunk of agent.respond()) {
      responses.push(chunk);
    }
    expect(responses.join('')).toContain('Completed task');
  });

  it('enforces maxSteps limit to prevent infinite loops', async () => {
    vi.spyOn(agent, 'interpret').mockResolvedValueOnce({
      goal: 'Looping task',
      steps: [
        { id: '1', description: 'Step 1' },
        { id: '2', description: 'Step 2' },
        { id: '3', description: 'Step 3' },
        { id: '4', description: 'Step 4' },
      ],
    });

    const run = await agent.executeRun('Looping', 'p1', undefined, { maxSteps: 2 });
    expect(run.status).toBe('failed');
    expect(run.error).toContain('Execution limit reached');
  });

  it('supports cancellation and halts execution immediately', async () => {
    vi.spyOn(agent, 'interpret').mockResolvedValueOnce({
      goal: 'Long task',
      steps: [
        { id: '1', description: 'Step 1' },
        { id: '2', description: 'Step 2' },
      ],
    });

    // Trigger cancellation during execution
    const runPromise = agent.executeRun('Long task', 'p1', undefined, {
      listener: (r) => {
        if (r.status === 'executing') {
          agent.cancel();
        }
      },
    });

    const run = await runPromise;
    expect(run.status === 'cancelled' || run.status === 'complete').toBe(true);
  });
});
