export type CoreStatus = 'READY' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'WORKING' | 'COMPLETE';
export type CoreState = { status: CoreStatus; animation: CoreStatus; updatedAt: string };
export type CoreEvent =
  | { type: 'PROMPT_SUBMITTED' } | { type: 'VOICE_STARTED' } | { type: 'VOICE_STOPPED' }
  | { type: 'GENERATION_STARTED' } | { type: 'TOOL_STARTED' } | { type: 'RESPONSE_READY' }
  | { type: 'SPEECH_STARTED' } | { type: 'SPEECH_FINISHED' } | { type: 'RESET' };

const transitions: Record<CoreStatus, Partial<Record<CoreEvent['type'], CoreStatus>>> = {
  READY: { PROMPT_SUBMITTED: 'THINKING', VOICE_STARTED: 'LISTENING', RESET: 'READY' },
  LISTENING: { VOICE_STOPPED: 'THINKING', RESET: 'READY' },
  THINKING: { TOOL_STARTED: 'WORKING', RESPONSE_READY: 'COMPLETE', RESET: 'READY' },
  WORKING: { RESPONSE_READY: 'COMPLETE', RESET: 'READY' },
  COMPLETE: { SPEECH_STARTED: 'SPEAKING', PROMPT_SUBMITTED: 'THINKING', RESET: 'READY' },
  SPEAKING: { SPEECH_FINISHED: 'READY', RESET: 'READY' },
};
export const initialCoreState: CoreState = { status: 'READY', animation: 'READY', updatedAt: new Date(0).toISOString() };
export function canTransition(state: CoreState, event: CoreEvent): boolean { return Boolean(transitions[state.status][event.type]); }
export function reduceCoreState(state: CoreState, event: CoreEvent): CoreState {
  const next = transitions[state.status][event.type];
  if (!next) throw new Error(`Invalid BOSS Core transition: ${state.status} + ${event.type}`);
  return { status: next, animation: next, updatedAt: new Date().toISOString() };
}
