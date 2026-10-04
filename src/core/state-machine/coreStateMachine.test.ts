import { describe, expect, it } from 'vitest';
import { canTransition, initialCoreState, reduceCoreState } from './coreStateMachine';

describe('BOSS Core state machine', () => {
  it('follows prompt to work to complete', () => {
    const thinking = reduceCoreState(initialCoreState, { type: 'PROMPT_SUBMITTED' });
    const working = reduceCoreState(thinking, { type: 'TOOL_STARTED' });
    expect(reduceCoreState(working, { type: 'RESPONSE_READY' }).status).toBe('COMPLETE');
  });
  it('rejects invalid transitions', () => expect(() => reduceCoreState(initialCoreState, { type: 'RESPONSE_READY' })).toThrow());
  it('exposes transition validation', () => expect(canTransition(initialCoreState, { type: 'VOICE_STARTED' })).toBe(true));
});
