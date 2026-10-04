import type { Message } from '../../core/types/conversation';
import type { PermissionDecision, PermissionRequest } from '../../core/security/permissions';
import { localModelRuntime } from '../ai/localModelRuntime';
import { aiProviderService } from '../ai/aiProviderService';
import { projectTools } from '../tools/projectTools';
import { toolRuntime } from '../tools/toolRuntime';
import { localData } from '../storage/localData';
import { reduceAgentState, type AgentStatus } from './agentStateMachine';

export type AgentPlan = { goal: string; steps: readonly AgentStep[] };
export type AgentStep = {
  id: string;
  description: string;
  toolName?: string;
  input?: Record<string, unknown>;
  permission?: PermissionRequest;
};

export type AgentObservation = { stepId: string; output: unknown };

export type AgentActionStatus = 'pending' | 'executing' | 'complete' | 'failed' | 'cancelled' | 'blocked';

export type AgentAction = {
  id: string;
  runId: string;
  stepId: string;
  toolName: string;
  input: Record<string, unknown>;
  status: AgentActionStatus;
  permission?: PermissionRequest;
  result?: unknown;
  error?: string;
  createdAt: string;
  completedAt?: string;
};

export type AgentRunStatus =
  | 'idle'
  | 'planning'
  | 'awaiting_permission'
  | 'executing'
  | 'observing'
  | 'complete'
  | 'cancelled'
  | 'failed'
  | 'interrupted';

export type AgentRun = {
  id: string;
  sessionId: string;
  projectId: string;
  conversationId?: string;
  goal: string;
  status: AgentRunStatus;
  plan: AgentPlan;
  currentStepIndex: number;
  actions: readonly AgentAction[];
  error?: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentRunListener = (run: AgentRun) => void;

export interface BossAgent {
  interpret(input: Message, context?: { projectId: string }): Promise<AgentPlan>;
  observe(observation: AgentObservation): Promise<void>;
  respond(): AsyncIterable<string>;
  cancel(): Promise<void>;
}

export class BossAgentOrchestrator implements BossAgent {
  private currentRun: AgentRun | null = null;
  private isCancelled = false;
  private abortController: AbortController | null = null;
  private latestObservation: AgentObservation | null = null;
  private lastSummary = '';

  getCurrentRun(): AgentRun | null {
    return this.currentRun;
  }

  async cancel(): Promise<void> {
    this.isCancelled = true;
    if (this.abortController) {
      this.abortController.abort();
    }
    if (this.currentRun) {
      this.currentRun = {
        ...this.currentRun,
        status: 'cancelled',
        error: 'Execution cancelled by user.',
        updatedAt: new Date().toISOString(),
      };
    }
  }

  async observe(observation: AgentObservation): Promise<void> {
    this.latestObservation = observation;
  }

  async *respond(): AsyncIterable<string> {
    if (this.lastSummary) {
      yield this.lastSummary;
    } else if (this.currentRun?.error) {
      yield `Agent task failed: ${this.currentRun.error}`;
    } else {
      yield 'Agent task completed.';
    }
  }

  /**
   * Generates a structured execution plan using the active Local AI provider.
   * Prompts the local model with available capabilities and extracts a typed AgentPlan.
   */
  async interpret(input: Message, context?: { projectId: string }): Promise<AgentPlan> {
    const activeProvider = await aiProviderService.getActiveProvider();
    const isOllama = activeProvider.metadata.id === 'ollama';

    let modelToUse: string;

    if (isOllama) {
      const config = await localModelRuntime.loadConfig();
      const status = await localModelRuntime.discover(config);

      if (!status.available) {
        throw new Error(
          `LOCAL AI OFFLINE: Local model runtime is unavailable (${status.reason ?? 'Cannot connect'}). Start Ollama or llama.cpp locally to enable Agent planning.`
        );
      }

      if (!config.model) {
        throw new Error(
          'LOCAL AI: No model selected. Select an available local model in Settings > Models & AI Engine.'
        );
      }
      modelToUse = config.model;
    } else {
      const status = await activeProvider.getStatus();
      if (status.status !== 'connected' && status.status !== 'configured') {
        throw new Error(
          `AI PROVIDER OFFLINE: ${activeProvider.metadata.name} is ${status.status.toUpperCase()} (${status.reason ?? 'Cannot connect'}). Configure your provider in Settings > Models & AI Engine.`
        );
      }
      if (!status.activeModel) {
        throw new Error(
          `AI PROVIDER: No model selected for ${activeProvider.metadata.name}. Select an available model in Settings > Models & AI Engine.`
        );
      }
      modelToUse = status.activeModel;
    }

    const toolDescriptions = projectTools.getToolDescriptions();
    const systemPrompt = `You are BOSS Agent, an intelligent developer assistant running on the user's computer.
Your task is to analyze the user's request and construct a strict, minimal, step-by-step plan using the approved tools.

Available tools:
${toolDescriptions}

You MUST output ONLY a valid JSON object adhering to this schema:
{
  "goal": "Short string describing the goal",
  "steps": [
    {
      "id": "1",
      "description": "Short explanation of this specific step",
      "toolName": "one of the available tool names",
      "input": { ...arguments required by the tool... }
    }
  ]
}

Do NOT wrap the JSON in conversational filler. Do NOT execute destructive commands without reason. Output pure JSON.`;

    const provider = await activeProvider.getModelProvider(modelToUse);
    const planConversation = {
      id: crypto.randomUUID(),
      title: 'Agent Planning',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [
        {
          id: crypto.randomUUID(),
          role: 'system' as const,
          content: systemPrompt,
          timestamp: new Date().toISOString(),
          status: 'complete' as const,
          attachments: [],
          toolCalls: [],
          metadata: {},
        },
        {
          id: crypto.randomUUID(),
          role: 'user' as const,
          content: `Project ID: ${context?.projectId ?? 'active'}\nUser Request: ${input.content}`,
          timestamp: new Date().toISOString(),
          status: 'complete' as const,
          attachments: [],
          toolCalls: [],
          metadata: {},
        },
      ],
    };

    const response = await provider.generate({ conversation: planConversation });
    const content = response.content.trim();

    return this.parsePlan(content, input.content);
  }

  /**
   * Robust JSON plan extraction from model response.
   */
  parsePlan(rawResponse: string, fallbackGoal: string): AgentPlan {
    let jsonStr = rawResponse;

    // Check for ```json ... ``` markdown fence
    const match = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(rawResponse);
    if (match) {
      jsonStr = match[1].trim();
    } else {
      const start = rawResponse.indexOf('{');
      const end = rawResponse.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        jsonStr = rawResponse.slice(start, end + 1);
      }
    }

    try {
      const parsed = JSON.parse(jsonStr) as { goal?: string; steps?: unknown[] };
      const goal = typeof parsed.goal === 'string' && parsed.goal.trim() ? parsed.goal : fallbackGoal;
      const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : [];

      const steps: AgentStep[] = rawSteps.map((s: any, idx: number) => {
        const id = String(s.id ?? idx + 1);
        const description = String(s.description ?? `Step ${id}`);
        const toolName = typeof s.toolName === 'string' && s.toolName.trim() ? s.toolName.trim() : undefined;
        const input = typeof s.input === 'object' && s.input !== null ? s.input : {};
        return { id, description, toolName, input };
      });

      return { goal, steps };
    } catch {
      // Fallback: If model generated plain text without JSON, treat as 1 conversational step
      return {
        goal: fallbackGoal,
        steps: [
          {
            id: '1',
            description: rawResponse.slice(0, 80) || 'Analyze request',
          },
        ],
      };
    }
  }

  /**
   * Executes a single step of an Agent plan with validation, permission gating, and error boundary.
   * Delegates all tool execution exclusively through the controlled Tool Runtime layer.
   */
  async executeStep(
    run: AgentRun,
    stepIndex: number,
    decision: PermissionDecision = 'ALLOWED_SESSION',
    signal?: AbortSignal
  ): Promise<{ ok: boolean; observation: AgentObservation; error?: string; status?: string }> {
    const step = run.plan.steps[stepIndex];
    if (!step) {
      return {
        ok: false,
        observation: { stepId: String(stepIndex), output: null },
        error: `Step index ${stepIndex} out of bounds`,
      };
    }

    // Step with no tool execution
    if (!step.toolName) {
      const obs = { stepId: step.id, output: 'No tool required for this step.' };
      await this.observe(obs);
      return { ok: true, observation: obs };
    }

    // Execute strictly through Tool Runtime boundary
    const result = await toolRuntime.execute(step.toolName, step.input ?? {}, {
      projectId: run.projectId,
      sessionId: run.sessionId,
      runId: run.id,
      stepId: step.id,
      permissionDecision: decision,
      signal: signal ?? this.abortController?.signal,
    });

    if (!result.success) {
      const errorMsg = result.error?.message ?? `Tool '${step.toolName}' failed.`;
      return {
        ok: false,
        observation: { stepId: step.id, output: null },
        error: errorMsg,
        status: result.status,
      };
    }

    const observation: AgentObservation = {
      stepId: step.id,
      output: result.output,
    };
    await this.observe(observation);
    return { ok: true, observation, status: result.status };
  }

  /**
   * Executes a full, bounded Agent run: Planning -> Step-by-step Execution -> Observation -> Completion.
   */
  async executeRun(
    goal: string,
    projectId: string,
    conversationId?: string,
    options?: {
      maxSteps?: number;
      permissionDecision?: PermissionDecision;
      listener?: AgentRunListener;
    }
  ): Promise<AgentRun> {
    if (!projectId || !projectId.trim()) {
      throw new Error('Project isolation failure: An active registered project is required for Agent execution.');
    }

    const maxSteps = options?.maxSteps ?? 10;
    const defaultDecision = options?.permissionDecision ?? 'ALLOWED_SESSION';
    const runId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();

    this.isCancelled = false;
    this.abortController = new AbortController();

    let runState: AgentRun = {
      id: runId,
      sessionId,
      projectId,
      conversationId,
      goal,
      status: 'planning',
      plan: { goal, steps: [] },
      currentStepIndex: 0,
      actions: [],
      createdAt: now,
      updatedAt: now,
    };

    this.currentRun = runState;
    options?.listener?.(runState);

    try {
      await localData.history.createSession({
        id: sessionId,
        projectId,
        startedAt: now,
        context: { goal, conversationId },
      });
    } catch {
      // Ignored if storage gateway is unavailable
    }

    // 1. Planning Phase
    let plan: AgentPlan;
    try {
      plan = await this.interpret({
        id: crypto.randomUUID(),
        role: 'user',
        content: goal,
        timestamp: now,
        status: 'complete',
        attachments: [],
        toolCalls: [],
        metadata: {},
      }, { projectId });
      runState = {
        ...runState,
        plan,
        status: 'awaiting_permission',
        updatedAt: new Date().toISOString(),
      };
      this.currentRun = runState;
      options?.listener?.(runState);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      runState = {
        ...runState,
        status: 'failed',
        error: errorMsg,
        updatedAt: new Date().toISOString(),
      };
      this.currentRun = runState;
      options?.listener?.(runState);
      try {
        await localData.history.finishSession(sessionId, new Date().toISOString());
      } catch {}
      return runState;
    }

    // 2. Step Execution Loop
    const actions: AgentAction[] = [];

    for (let i = 0; i < plan.steps.length; i++) {
      // Check cancellation
      if (this.isCancelled) {
        runState = {
          ...runState,
          status: 'cancelled',
          error: 'Agent execution cancelled by user.',
          updatedAt: new Date().toISOString(),
        };
        this.currentRun = runState;
        options?.listener?.(runState);
        try {
          await localData.history.finishSession(sessionId, new Date().toISOString());
        } catch {}
        return runState;
      }

      // Check max steps limit
      if (i >= maxSteps) {
        runState = {
          ...runState,
          status: 'failed',
          error: `Execution limit reached: stopped after ${maxSteps} steps to guarantee safety.`,
          updatedAt: new Date().toISOString(),
        };
        this.currentRun = runState;
        options?.listener?.(runState);
        try {
          await localData.history.finishSession(sessionId, new Date().toISOString());
        } catch {}
        return runState;
      }

      const step = plan.steps[i];
      const actionId = crypto.randomUUID();
      const actionCreated = new Date().toISOString();

      const actionRecord: AgentAction = {
        id: actionId,
        runId,
        stepId: step.id,
        toolName: step.toolName ?? 'none',
        input: step.input ?? {},
        status: 'executing',
        createdAt: actionCreated,
      };

      runState = {
        ...runState,
        status: 'executing',
        currentStepIndex: i,
        actions: [...actions, actionRecord],
        updatedAt: actionCreated,
      };
      this.currentRun = runState;
      options?.listener?.(runState);

      try {
        await localData.history.recordAgentAction({
          id: actionId,
          sessionId,
          action: step.toolName ?? 'none',
          status: 'started',
          createdAt: actionCreated,
          metadata: { stepId: step.id, description: step.description, input: step.input ?? {} },
        });
      } catch {}

      // Execute step through Tool Runtime
      const stepResult = await this.executeStep(runState, i, defaultDecision, this.abortController?.signal);

      if (!stepResult.ok) {
        // Step failed, blocked, or cancelled
        actionRecord.status = (stepResult.status === 'denied' || stepResult.error?.includes('Permission denied'))
          ? 'blocked'
          : stepResult.status === 'cancelled'
          ? 'cancelled'
          : 'failed';
        actionRecord.error = stepResult.error;
        actionRecord.completedAt = new Date().toISOString();
        actions.push(actionRecord);

        try {
          await localData.history.updateAgentAction(
            actionId,
            'failed',
            { error: stepResult.error }
          );
          await localData.history.finishSession(sessionId, new Date().toISOString());
        } catch {}

        const isCancelled = stepResult.status === 'cancelled';
        runState = {
          ...runState,
          status: isCancelled ? 'cancelled' : 'failed',
          error: stepResult.error,
          actions: [...actions],
          updatedAt: new Date().toISOString(),
        };
        this.currentRun = runState;
        options?.listener?.(runState);
        return runState;
      }

      // Step succeeded -> Observing
      actionRecord.status = 'complete';
      actionRecord.result = stepResult.observation.output;
      actionRecord.completedAt = new Date().toISOString();
      actions.push(actionRecord);

      try {
        await localData.history.updateAgentAction(
          actionId,
          'complete',
          { result: stepResult.observation.output }
        );
      } catch {}

      runState = {
        ...runState,
        status: 'observing',
        actions: [...actions],
        updatedAt: new Date().toISOString(),
      };
      this.currentRun = runState;
      options?.listener?.(runState);
    }

    // 3. Completion
    const summary = `Completed task: ${goal} (${plan.steps.length} step${plan.steps.length === 1 ? '' : 's'} executed).`;
    this.lastSummary = summary;

    try {
      await localData.history.finishSession(sessionId, new Date().toISOString());
    } catch {}

    runState = {
      ...runState,
      status: 'complete',
      summary,
      updatedAt: new Date().toISOString(),
    };
    this.currentRun = runState;
    options?.listener?.(runState);

    return runState;
  }
}

export const agentOrchestrator = new BossAgentOrchestrator();
