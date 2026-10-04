import { useEffect, type PropsWithChildren } from 'react';
import { useAppStore } from '../store/appStore';
import { terminalService } from '../../services/terminal/terminalService';
import { agentOrchestrator } from '../../services/agent/agent';
import { initGlassInputInteraction } from '../../components/glass-input';

/** Central composition boundary for state initialization and application lifecycle hooks. */
export function AppProviders({ children }: PropsWithChildren) {
  useEffect(() => {
    useAppStore.getState().initialize();
    const cleanupGlassInput = initGlassInputInteraction();

    const onBeforeUnload = () => {
      terminalService.cleanAll().catch(() => {});
      agentOrchestrator.cancel().catch(() => {});
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      cleanupGlassInput();
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  return <>{children}</>;
}

