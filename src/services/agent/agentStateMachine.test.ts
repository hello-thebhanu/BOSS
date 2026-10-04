import { describe, expect, it } from 'vitest';
import { reduceAgentState } from './agentStateMachine';
describe('agent lifecycle', () => { it('requires a permission gate before execution', () => expect(reduceAgentState(reduceAgentState('idle','START'),'PLAN_READY')).toBe('awaiting_permission')); it('supports cancellation', () => expect(reduceAgentState('executing','CANCEL')).toBe('cancelled')); });
