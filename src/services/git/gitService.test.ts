import { describe, expect, it, vi } from 'vitest';
import { TauriGitService, gitService } from './gitService';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('TauriGitService', () => {
  it('exposes the singleton instance', () => {
    expect(gitService).toBeInstanceOf(TauriGitService);
  });

  it('delegates status to git_status with default ALLOWED_SESSION', async () => {
    const service = new TauriGitService();
    const fakeStatus = {
      isRepository: true,
      branch: 'main',
      entries: [{ path: 'file.txt', state: 'modified', staged: false, unstaged: true }],
    };
    vi.mocked(invoke).mockResolvedValueOnce(fakeStatus);

    const result = await service.status('p1');
    expect(invoke).toHaveBeenCalledWith('git_status', {
      projectId: 'p1',
      decision: 'ALLOWED_SESSION',
    });
    expect(result).toEqual(fakeStatus);
  });

  it('delegates branches to git_branches', async () => {
    const service = new TauriGitService();
    const fakeBranches = ['main', 'feature/login'];
    vi.mocked(invoke).mockResolvedValueOnce(fakeBranches);

    const result = await service.branches('p1');
    expect(invoke).toHaveBeenCalledWith('git_branches', {
      projectId: 'p1',
      decision: 'ALLOWED_SESSION',
    });
    expect(result).toEqual(fakeBranches);
  });

  it('delegates diff with path and staged options', async () => {
    const service = new TauriGitService();
    const fakeDiff = 'diff --git a/test.txt b/test.txt\n+hello';
    vi.mocked(invoke).mockResolvedValueOnce(fakeDiff);

    const result = await service.diff('p1', { path: 'test.txt', staged: true });
    expect(invoke).toHaveBeenCalledWith('git_diff', {
      projectId: 'p1',
      path: 'test.txt',
      staged: true,
      decision: 'ALLOWED_SESSION',
    });
    expect(result).toBe(fakeDiff);
  });

  it('delegates diff with legacy signature', async () => {
    const service = new TauriGitService();
    const fakeDiff = 'diff --git a/all b/all';
    vi.mocked(invoke).mockResolvedValueOnce(fakeDiff);

    const result = await service.diff('p1', 'ALLOWED_ALWAYS');
    expect(invoke).toHaveBeenCalledWith('git_diff', {
      projectId: 'p1',
      path: undefined,
      staged: undefined,
      decision: 'ALLOWED_ALWAYS',
    });
    expect(result).toBe(fakeDiff);
  });

  it('delegates log with limit', async () => {
    const service = new TauriGitService();
    const fakeLog = [
      { id: '1234567890', summary: 'Initial commit', author: 'Bhanu', timestamp: '2026-01-01T00:00:00Z' },
    ];
    vi.mocked(invoke).mockResolvedValueOnce(fakeLog);

    const result = await service.log('p1', 20);
    expect(invoke).toHaveBeenCalledWith('git_log', {
      projectId: 'p1',
      limit: 20,
      decision: 'ALLOWED_SESSION',
    });
    expect(result).toEqual(fakeLog);
  });

  it('delegates stage to git_stage', async () => {
    const service = new TauriGitService();
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await service.stage('p1', ['file1.txt', 'file2.txt']);
    expect(invoke).toHaveBeenCalledWith('git_stage', {
      projectId: 'p1',
      paths: ['file1.txt', 'file2.txt'],
      decision: 'ALLOWED_SESSION',
    });
  });

  it('delegates unstage to git_unstage', async () => {
    const service = new TauriGitService();
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await service.unstage('p1', ['file1.txt']);
    expect(invoke).toHaveBeenCalledWith('git_unstage', {
      projectId: 'p1',
      paths: ['file1.txt'],
      decision: 'ALLOWED_SESSION',
    });
  });

  it('delegates commit to git_commit', async () => {
    const service = new TauriGitService();
    vi.mocked(invoke).mockResolvedValueOnce('[main 1a2b3c4] Phase 12.7 test commit');

    const result = await service.commit('p1', 'Phase 12.7 test commit');
    expect(invoke).toHaveBeenCalledWith('git_commit', {
      projectId: 'p1',
      message: 'Phase 12.7 test commit',
      decision: 'ALLOWED_SESSION',
    });
    expect(result).toBe('[main 1a2b3c4] Phase 12.7 test commit');
  });

  it('delegates checkout to git_checkout', async () => {
    const service = new TauriGitService();
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await service.checkout('p1', 'develop');
    expect(invoke).toHaveBeenCalledWith('git_checkout', {
      projectId: 'p1',
      branch: 'develop',
      decision: 'ALLOWED_SESSION',
    });
  });
});
