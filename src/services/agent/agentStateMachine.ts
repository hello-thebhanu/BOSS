export type AgentStatus = 'idle' | 'planning' | 'awaiting_permission' | 'executing' | 'observing' | 'complete' | 'cancelled' | 'failed';
export type AgentEvent = 'START' | 'PLAN_READY' | 'PERMISSION_REQUIRED' | 'PERMISSION_GRANTED' | 'ACTION_FINISHED' | 'FINISH' | 'CANCEL' | 'FAIL' | 'RESET';
const transitions: Record<AgentStatus, Partial<Record<AgentEvent, AgentStatus>>> = {
  idle: { START: 'planning', RESET: 'idle' },
  planning: { PLAN_READY: 'awaiting_permission', FINISH: 'complete', FAIL: 'failed', CANCEL: 'cancelled', RESET: 'idle' },
  awaiting_permission: { PERMISSION_GRANTED: 'executing', CANCEL: 'cancelled', FAIL: 'failed', RESET: 'idle' },
  executing: { ACTION_FINISHED: 'observing', FAIL: 'failed', CANCEL: 'cancelled', RESET: 'idle' },
  observing: { PLAN_READY: 'awaiting_permission', FINISH: 'complete', FAIL: 'failed', CANCEL: 'cancelled', RESET: 'idle' },
  complete: { START: 'planning', RESET: 'idle' },
  cancelled: { START: 'planning', RESET: 'idle' },
  failed: { START: 'planning', RESET: 'idle' },
};
export function reduceAgentState(current: AgentStatus, event: AgentEvent): AgentStatus { const next = transitions[current][event]; if (!next) throw new Error(`Invalid agent transition: ${current} + ${event}`); return next; }
