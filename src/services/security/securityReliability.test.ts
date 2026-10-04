import { describe, it, expect, vi } from 'vitest';
import { validateLocalEndpoint } from '../ai/localModelRuntime';
import { BossToolRuntime } from '../tools/toolRuntime';
import { ProjectToolRegistry } from '../tools/projectTools';
import { reduceCoreState, type CoreState } from '../../core/state-machine/coreStateMachine';
import { BossAgentOrchestrator } from '../agent/agent';

describe('Phase 15 — Security & Reliability Suite', () => {
  describe('15.1 Permission Security & Boundary Checks', () => {
    it('enforces that DENIED decision immediately blocks tool execution and yields PERMISSION_DENIED', async () => {
      const mockTool = {
        name: 'test_tool',
        description: 'Test Tool',
        permissions: ['READ_FILE'] as const,
        inputSchema: { type: 'object' as const, properties: {} },
        execute: vi.fn(),
      };
      const registry = new ProjectToolRegistry();
      registry.register(mockTool);
      const runtime = new BossToolRuntime(registry);

      const result = await runtime.execute('test_tool', {}, {
        projectId: 'proj-1',
        permissionDecision: 'DENIED',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('denied');
      expect(result.error?.code).toBe('PERMISSION_DENIED');
      expect(mockTool.execute).not.toHaveBeenCalled();
    });

    it('rejects execution when unregistered tool is invoked', async () => {
      const registry = new ProjectToolRegistry();
      const runtime = new BossToolRuntime(registry);

      const result = await runtime.execute('unregistered_backdoor_tool', {}, {
        projectId: 'proj-1',
        permissionDecision: 'ALLOWED_SESSION',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('TOOL_NOT_FOUND');
      expect(result.error?.message).toContain('not registered');
    });

    it('rejects execution when projectId is missing or whitespace-only', async () => {
      const mockTool = {
        name: 'test_tool',
        description: 'Test Tool',
        permissions: ['READ_FILE'] as const,
        inputSchema: { type: 'object' as const, properties: {} },
        execute: vi.fn(),
      };
      const registry = new ProjectToolRegistry();
      registry.register(mockTool);
      const runtime = new BossToolRuntime(registry);

      const result = await runtime.execute('test_tool', {}, {
        projectId: '   ',
        permissionDecision: 'ALLOWED_SESSION',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PROJECT_NOT_FOUND');
      expect(mockTool.execute).not.toHaveBeenCalled();
    });
  });

  describe('15.2 Filesystem Security & Boundary Protections', () => {
    it('classifies project boundary escape errors correctly', async () => {
      const mockTool = {
        name: 'fs_read',
        description: 'Read file',
        permissions: ['READ_FILE'] as const,
        inputSchema: { type: 'object' as const, properties: {} },
        execute: vi.fn().mockResolvedValue({
          ok: false,
          error: { message: 'Requested path is outside the registered project root' },
        }),
      };
      const registry = new ProjectToolRegistry();
      registry.register(mockTool);
      const runtime = new BossToolRuntime(registry);

      const result = await runtime.execute('fs_read', { path: '../../etc/passwd' }, {
        projectId: 'proj-1',
        permissionDecision: 'ALLOWED_SESSION',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PROJECT_BOUNDARY_VIOLATION');
      expect(result.error?.message).toContain('outside the registered project root');
    });
  });

  describe('15.5 Agent Security & Execution Boundaries', () => {
    it('bounds agent execution and enforces maxSteps safety limit', async () => {
      const agent = new BossAgentOrchestrator();
      const mockPlan = {
        goal: 'Loop indefinitely',
        steps: Array.from({ length: 15 }, (_, i) => ({
          id: String(i + 1),
          description: `Step ${i + 1}`,
          toolName: 'noop',
        })),
      };

      vi.spyOn(agent, 'interpret').mockResolvedValue(mockPlan);
      vi.spyOn(agent, 'executeStep').mockResolvedValue({
        ok: true,
        observation: { stepId: '1', output: 'ok' },
        status: 'succeeded',
      });

      const run = await agent.executeRun('Test loop bound', 'proj-1', undefined, {
        maxSteps: 5,
      });

      expect(run.status).toBe('failed');
      expect(run.error).toContain('stopped after 5 steps to guarantee safety');
      expect(run.actions.length).toBe(5);
    });

    it('cancels immediately and aborts active controller when cancel() is called', async () => {
      const agent = new BossAgentOrchestrator();
      const mockPlan = {
        goal: 'Long task',
        steps: [
          { id: '1', description: 'Step 1', toolName: 'noop' },
          { id: '2', description: 'Step 2', toolName: 'noop' },
        ],
      };

      vi.spyOn(agent, 'interpret').mockResolvedValue(mockPlan);
      vi.spyOn(agent, 'executeStep').mockImplementation(async () => {
        await agent.cancel();
        return { ok: false, observation: { stepId: '1', output: null }, status: 'cancelled' };
      });

      const run = await agent.executeRun('Test cancellation', 'proj-1');

      expect(run.status).toBe('cancelled');
    });
  });

  describe('15.6 Local AI Privacy & Loopback Isolation', () => {
    it('permits strictly local loopback addresses: 127.0.0.1, localhost, ::1', () => {
      expect(validateLocalEndpoint('http://127.0.0.1:11434').valid).toBe(true);
      expect(validateLocalEndpoint('http://localhost:11434').valid).toBe(true);
      expect(validateLocalEndpoint('http://[::1]:11434').valid).toBe(true);
      expect(validateLocalEndpoint('http://localhost:8080/v1').valid).toBe(true);
    });

    it('strictly rejects non-loopback IPs, LAN addresses, and remote cloud endpoints', () => {
      // Remote cloud URLs
      const cloudRes = validateLocalEndpoint('https://api.openai.com/v1');
      expect(cloudRes.valid).toBe(false);
      expect(cloudRes.error).toContain('Security boundary violation');

      // LAN IP addresses
      const lanRes = validateLocalEndpoint('http://192.168.1.100:11434');
      expect(lanRes.valid).toBe(false);
      expect(lanRes.error).toContain('Security boundary violation');

      // Public IP addresses
      const publicRes = validateLocalEndpoint('http://8.8.8.8:11434');
      expect(publicRes.valid).toBe(false);

      // Non-loopback domains
      const domainRes = validateLocalEndpoint('http://my-ollama-server.internal:11434');
      expect(domainRes.valid).toBe(false);
    });

    it('rejects unsupported protocols such as file://, ftp://, ws://', () => {
      expect(validateLocalEndpoint('file:///etc/passwd').valid).toBe(false);
      expect(validateLocalEndpoint('ftp://127.0.0.1:21').valid).toBe(false);
    });
  });

  describe('15.8 Recovery & Core State Safety', () => {
    it('guarantees BOSS Core state machine can RESET to READY from any active state', () => {
      const activeStates: CoreState['status'][] = ['THINKING', 'WORKING', 'SPEAKING', 'LISTENING', 'COMPLETE', 'READY'];

      for (const status of activeStates) {
        const state: CoreState = {
          status,
          animation: status,
          updatedAt: new Date().toISOString(),
        };

        const resetState = reduceCoreState(state, { type: 'RESET' });
        expect(resetState.status).toBe('READY');
        expect(resetState.animation).toBe('READY');
      }
    });

    it('recovers cleanly from timeout in tool runtime without deadlocking the project queue', async () => {
      const mockSlowTool = {
        name: 'slow_tool',
        description: 'Slow Tool',
        permissions: ['READ_FILE'] as const,
        inputSchema: { type: 'object' as const, properties: {} },
        execute: () => new Promise<{ ok: true; value: unknown }>((resolve) => setTimeout(() => resolve({ ok: true, value: 'done' }), 200)),
      };
      const registry = new ProjectToolRegistry();
      registry.register(mockSlowTool);
      const runtime = new BossToolRuntime(registry);

      // Tool timed out
      const timeoutResult = await runtime.execute('slow_tool', {}, {
        projectId: 'proj-queue-test',
        permissionDecision: 'ALLOWED_SESSION',
        timeoutMs: 30,
      });

      expect(timeoutResult.success).toBe(false);
      expect(timeoutResult.error?.code).toBe('TIMEOUT');

      // Subsequent tool on the same project queue must execute immediately without getting blocked
      const quickTool = {
        name: 'quick_tool',
        description: 'Quick Tool',
        permissions: ['READ_FILE'] as const,
        inputSchema: { type: 'object' as const, properties: {} },
        execute: async () => ({ ok: true as const, value: 'recovered' }),
      };
      registry.register(quickTool);

      const nextResult = await runtime.execute('quick_tool', {}, {
        projectId: 'proj-queue-test',
        permissionDecision: 'ALLOWED_SESSION',
      });

      expect(nextResult.success).toBe(true);
      expect(nextResult.output).toBe('recovered');
    });
  });
});
