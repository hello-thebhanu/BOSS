import { describe, expect, it, vi, beforeEach } from 'vitest';
import { projectTools } from './projectTools';
import { projectFilesystem } from '../filesystem/projectFilesystem';
import { terminalService } from '../terminal/terminalService';
import { gitService } from '../git/gitService';

describe('ProjectToolRegistry', () => {
  it('registers all approved BOSS capability tools', () => {
    const expected = [
      'fs_list',
      'fs_read',
      'fs_write',
      'fs_create_dir',
      'fs_rename',
      'fs_remove',
      'terminal_run',
      'git_status',
      'git_diff',
      'git_log',
      'git_branches',
      'git_stage',
      'git_unstage',
      'git_commit',
    ];

    const names = projectTools.listToolNames();
    for (const toolName of expected) {
      expect(names).toContain(toolName);
      expect(projectTools.get(toolName)).toBeDefined();
    }
  });

  it('generates formatted descriptions for local model planning', () => {
    const desc = projectTools.getToolDescriptions();
    expect(desc).toContain('fs_list');
    expect(desc).toContain('terminal_run');
    expect(desc).toContain('git_status');
  });
});

describe('Project Tools Execution & Boundary Protection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fs_list validates arguments and delegates to projectFilesystem', async () => {
    const tool = projectTools.get('fs_list')!;
    const missingProj = await tool.execute({ projectId: '' });
    expect(missingProj.ok).toBe(false);

    vi.spyOn(projectFilesystem, 'list').mockResolvedValueOnce([
      { name: 'index.ts', relativePath: 'index.ts', kind: 'file' },
    ]);

    const result = await tool.execute({ projectId: 'p1', relativePath: 'src' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
      expect(result.value[0].name).toBe('index.ts');
    }
  });

  it('fs_read validates arguments and captures errors safely', async () => {
    const tool = projectTools.get('fs_read')!;
    const missingArgs = await tool.execute({ projectId: 'p1', relativePath: '' });
    expect(missingArgs.ok).toBe(false);

    vi.spyOn(projectFilesystem, 'read').mockRejectedValueOnce(new Error('File not found'));
    const failedResult = await tool.execute({ projectId: 'p1', relativePath: 'nonexistent.txt' });
    expect(failedResult.ok).toBe(false);
    if (!failedResult.ok) {
      expect(failedResult.error.message).toContain('File not found');
    }
  });

  it('fs_write delegates to projectFilesystem.write', async () => {
    const tool = projectTools.get('fs_write')!;
    const writeSpy = vi.spyOn(projectFilesystem, 'write').mockResolvedValueOnce();

    const result = await tool.execute({ projectId: 'p1', relativePath: 'test.txt', content: 'hello' });
    expect(result.ok).toBe(true);
    expect(writeSpy).toHaveBeenCalledWith({ projectId: 'p1', relativePath: 'test.txt' }, 'hello');
  });

  it('terminal_run delegates through terminalService', async () => {
    const tool = projectTools.get('terminal_run')!;
    vi.spyOn(terminalService, 'start').mockResolvedValueOnce({
      id: 'sess-1',
      projectId: 'p1',
      cwd: 'C:/project',
      status: 'running',
    });
    const sendSpy = vi.spyOn(terminalService, 'send').mockResolvedValueOnce();

    const result = await tool.execute({ projectId: 'p1', command: 'git --version' });
    expect(result.ok).toBe(true);
    expect(sendSpy).toHaveBeenCalledWith('sess-1', 'git --version');
  });

  it('git_status delegates through gitService', async () => {
    const tool = projectTools.get('git_status')!;
    vi.spyOn(gitService, 'status').mockResolvedValueOnce({
      isRepository: true,
      branch: 'main',
      entries: [],
    });

    const result = await tool.execute({ projectId: 'p1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isRepository).toBe(true);
      expect(result.value.branch).toBe('main');
    }
  });
});
