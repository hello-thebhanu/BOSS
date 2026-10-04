import { create } from 'zustand';
import { initialCoreState, reduceCoreState, type CoreEvent, type CoreState } from '../../core/state-machine/coreStateMachine';
import { reduceAgentState, type AgentEvent, type AgentStatus } from '../../services/agent/agentStateMachine';
import { localData } from '../../services/storage/localData';

type AppStore = {
  core: CoreState;
  agentStatus: AgentStatus;
  activeProjectId: string | null;
  isInitialized: boolean;
  initialize: () => Promise<void>;
  setActiveProjectId: (id: string | null) => void;
  dispatchCore: (event: CoreEvent) => void;
  dispatchAgent: (event: AgentEvent) => void;
};

export const useAppStore = create<AppStore>((set) => ({
  core: initialCoreState,
  agentStatus: 'idle',
  activeProjectId: null,
  isInitialized: false,
  initialize: async () => {
    try {
      const [savedSetting, projects] = await Promise.all([
        localData.settings.getSetting('active_project_id').catch(() => null),
        localData.projects.listProjects().catch(() => []),
      ]);
      let activeId: string | null = null;
      if (typeof savedSetting?.value === 'string' && projects.some((p) => p.id === savedSetting.value)) {
        activeId = savedSetting.value;
      } else if (projects.length > 0) {
        activeId = projects[0].id;
      }
      set({ activeProjectId: activeId, isInitialized: true });
    } catch {
      set({ isInitialized: true });
    }
  },
  setActiveProjectId: (activeProjectId) => {
    set({ activeProjectId });
    localData.settings.setSetting({
      key: 'active_project_id',
      value: activeProjectId ?? '',
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
  },
  dispatchCore: (event) => set(({ core }) => {
    try {
      return { core: reduceCoreState(core, event) };
    } catch {
      if (event.type === 'RESET') {
        return { core: { status: 'READY', animation: 'READY', updatedAt: new Date().toISOString() } };
      }
      return { core };
    }
  }),
  dispatchAgent: (event) => set(({ core, agentStatus }) => {
    const next = reduceAgentState(agentStatus, event);
    const coreEvent: Partial<Record<AgentEvent, CoreEvent>> = {
      START: { type: 'PROMPT_SUBMITTED' },
      PERMISSION_GRANTED: { type: 'TOOL_STARTED' },
      FINISH: { type: 'RESPONSE_READY' },
      CANCEL: { type: 'RESET' },
      FAIL: { type: 'RESET' },
      RESET: { type: 'RESET' },
    };
    let nextCore = core;
    const mapped = coreEvent[event];
    if (mapped) {
      try {
        nextCore = reduceCoreState(core, mapped);
      } catch {
        if (mapped.type === 'RESET') {
          nextCore = { status: 'READY', animation: 'READY', updatedAt: new Date().toISOString() };
        }
      }
    }
    return { agentStatus: next, core: nextCore };
  }),
}));
