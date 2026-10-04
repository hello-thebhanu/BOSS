import type { PermissionDecision } from '../../core/security/permissions';
import { invoke } from '@tauri-apps/api/core';

export type GitStatusEntry = {
  path: string;
  state: string; // 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'staged' | 'conflicted'
  staged: boolean;
  unstaged: boolean;
};

export type GitStatus = {
  isRepository: boolean;
  branch?: string;
  entries: readonly GitStatusEntry[];
};

export type GitCommit = {
  id: string;
  summary: string;
  author: string;
  timestamp: string;
};

export interface GitDiffOptions {
  path?: string;
  staged?: boolean;
  decision?: PermissionDecision;
}

export interface GitService {
  status(projectId: string, decision?: PermissionDecision): Promise<GitStatus>;
  branches(projectId: string, decision?: PermissionDecision): Promise<readonly string[]>;
  diff(projectId: string, optionsOrDecision?: GitDiffOptions | PermissionDecision, legacyDecision?: PermissionDecision): Promise<string>;
  log(projectId: string, limit?: number, decision?: PermissionDecision): Promise<readonly GitCommit[]>;
  stage(projectId: string, paths: readonly string[], decision?: PermissionDecision): Promise<void>;
  unstage(projectId: string, paths: readonly string[], decision?: PermissionDecision): Promise<void>;
  commit(projectId: string, message: string, decision?: PermissionDecision): Promise<string>;
  checkout(projectId: string, branch: string, decision?: PermissionDecision): Promise<void>;
}

export class TauriGitService implements GitService {
  async status(projectId: string, decision: PermissionDecision = 'ALLOWED_SESSION'): Promise<GitStatus> {
    return await invoke<GitStatus>('git_status', { projectId, decision });
  }

  async branches(projectId: string, decision: PermissionDecision = 'ALLOWED_SESSION'): Promise<readonly string[]> {
    return await invoke<string[]>('git_branches', { projectId, decision });
  }

  async diff(
    projectId: string,
    optionsOrDecision?: GitDiffOptions | PermissionDecision,
    legacyDecision?: PermissionDecision,
  ): Promise<string> {
    let path: string | undefined;
    let staged: boolean | undefined;
    let decision: PermissionDecision = 'ALLOWED_SESSION';

    if (typeof optionsOrDecision === 'string') {
      decision = optionsOrDecision;
    } else if (optionsOrDecision && typeof optionsOrDecision === 'object') {
      path = optionsOrDecision.path;
      staged = optionsOrDecision.staged;
      if (optionsOrDecision.decision) {
        decision = optionsOrDecision.decision;
      }
    } else if (legacyDecision) {
      decision = legacyDecision;
    }

    return await invoke<string>('git_diff', { projectId, path, staged, decision });
  }

  async log(projectId: string, limit: number = 50, decision: PermissionDecision = 'ALLOWED_SESSION'): Promise<readonly GitCommit[]> {
    return await invoke<GitCommit[]>('git_log', { projectId, limit, decision });
  }

  async stage(projectId: string, paths: readonly string[], decision: PermissionDecision = 'ALLOWED_SESSION'): Promise<void> {
    await invoke('git_stage', { projectId, paths, decision });
  }

  async unstage(projectId: string, paths: readonly string[], decision: PermissionDecision = 'ALLOWED_SESSION'): Promise<void> {
    await invoke('git_unstage', { projectId, paths, decision });
  }

  async commit(projectId: string, message: string, decision: PermissionDecision = 'ALLOWED_SESSION'): Promise<string> {
    return await invoke<string>('git_commit', { projectId, message, decision });
  }

  async checkout(projectId: string, branch: string, decision: PermissionDecision = 'ALLOWED_SESSION'): Promise<void> {
    await invoke('git_checkout', { projectId, branch, decision });
  }
}

export const gitService = new TauriGitService();
