import type { PermissionDecision } from '../../core/security/permissions';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type TerminalSession = {
  id: string;
  projectId: string;
  cwd: string;
  status: 'starting' | 'running' | 'stopped' | 'failed';
};

export type TerminalOutput = {
  sessionId: string;
  stream: 'stdout' | 'stderr';
  data: string;
  seq?: number;
};

export interface TerminalService {
  start(projectId: string, decision: PermissionDecision): Promise<TerminalSession>;
  send(sessionId: string, input: string, projectId?: string): Promise<void>;
  stop(sessionId: string, decision?: PermissionDecision, projectId?: string): Promise<void>;
  poll(sessionId: string, projectId?: string): Promise<TerminalOutput[]>;
  cleanAll(): Promise<void>;
  subscribe(listener: (output: TerminalOutput) => void): () => void;
}

export class TauriTerminalService implements TerminalService {
  private listeners = new Set<(output: TerminalOutput) => void>();
  private unlistenPromise: Promise<UnlistenFn> | null = null;

  async start(projectId: string, decision: PermissionDecision = 'ALLOWED_SESSION'): Promise<TerminalSession> {
    return await invoke<TerminalSession>('terminal_start_session', { projectId, decision });
  }

  async send(sessionId: string, input: string, projectId?: string): Promise<void> {
    await invoke('terminal_send_input', { sessionId, input, projectId });
  }

  async stop(sessionId: string, decision: PermissionDecision = 'ALLOWED_SESSION', projectId?: string): Promise<void> {
    await invoke('terminal_stop_session', { sessionId, decision, projectId });
  }

  async poll(sessionId: string, projectId?: string): Promise<TerminalOutput[]> {
    return await invoke<TerminalOutput[]>('terminal_poll_output', { sessionId, projectId });
  }

  async cleanAll(): Promise<void> {
    try {
      await invoke('terminal_clean_all');
    } catch {
      // ignore
    }
  }

  subscribe(listener: (output: TerminalOutput) => void): () => void {
    this.listeners.add(listener);
    if (!this.unlistenPromise) {
      const p = listen<TerminalOutput>('terminal-output', (event) => {
        for (const l of this.listeners) {
          l(event.payload);
        }
      });
      p.catch((err) => {
        console.warn('terminal-output listen error:', err);
      });
      this.unlistenPromise = p;
    }

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.unlistenPromise) {
        this.unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
        this.unlistenPromise = null;
      }
    };
  }
}

export const terminalService = new TauriTerminalService();
