import { describe, expect, it, vi } from 'vitest';
import { TauriProjectFilesystem, projectFilesystem } from './projectFilesystem';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('TauriProjectFilesystem', () => {
  it('exposes the singleton instance', () => {
    expect(projectFilesystem).toBeInstanceOf(TauriProjectFilesystem);
  });

  it('delegates directory listing to fs_list_directory', async () => {
    const fs = new TauriProjectFilesystem();
    vi.mocked(invoke).mockResolvedValueOnce([
      { name: 'src', relativePath: 'src', kind: 'directory' },
      { name: 'main.rs', relativePath: 'src/main.rs', kind: 'file' },
    ]);

    const entries = await fs.list({ projectId: 'proj-1', relativePath: '' });
    expect(invoke).toHaveBeenCalledWith('fs_list_directory', {
      projectId: 'proj-1',
      relativePath: '',
      decision: 'ALLOWED_SESSION',
    });
    expect(entries).toHaveLength(2);
    expect(entries[0].name).toBe('src');
  });

  it('delegates file reading to fs_read_file', async () => {
    const fs = new TauriProjectFilesystem();
    vi.mocked(invoke).mockResolvedValueOnce('file contents');

    const result = await fs.read({ projectId: 'proj-1', relativePath: 'src/main.rs' });
    expect(invoke).toHaveBeenCalledWith('fs_read_file', {
      projectId: 'proj-1',
      relativePath: 'src/main.rs',
      decision: 'ALLOWED_SESSION',
    });
    expect(result).toBe('file contents');
  });

  it('delegates file writing to fs_write_file', async () => {
    const fs = new TauriProjectFilesystem();
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await fs.write({ projectId: 'proj-1', relativePath: 'src/main.rs' }, 'new code');
    expect(invoke).toHaveBeenCalledWith('fs_write_file', {
      projectId: 'proj-1',
      relativePath: 'src/main.rs',
      contents: 'new code',
      decision: 'ALLOWED_SESSION',
    });
  });

  it('delegates directory creation to fs_create_directory', async () => {
    const fs = new TauriProjectFilesystem();
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await fs.createDirectory({ projectId: 'proj-1', relativePath: 'src/new_dir' });
    expect(invoke).toHaveBeenCalledWith('fs_create_directory', {
      projectId: 'proj-1',
      relativePath: 'src/new_dir',
      decision: 'ALLOWED_SESSION',
    });
  });

  it('delegates rename to fs_rename', async () => {
    const fs = new TauriProjectFilesystem();
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await fs.rename({ projectId: 'proj-1', relativePath: 'src/old.rs' }, 'src/new.rs');
    expect(invoke).toHaveBeenCalledWith('fs_rename', {
      projectId: 'proj-1',
      relativePath: 'src/old.rs',
      destination: 'src/new.rs',
      decision: 'ALLOWED_SESSION',
    });
  });

  it('delegates remove to fs_remove with ALLOWED_ONCE default', async () => {
    const fs = new TauriProjectFilesystem();
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await fs.remove({ projectId: 'proj-1', relativePath: 'src/temp.rs' });
    expect(invoke).toHaveBeenCalledWith('fs_remove', {
      projectId: 'proj-1',
      relativePath: 'src/temp.rs',
      decision: 'ALLOWED_ONCE',
    });
  });

  it('respects explicitly passed permission decision', async () => {
    const fs = new TauriProjectFilesystem();
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await fs.write({ projectId: 'proj-1', relativePath: 'src/main.rs' }, 'code', 'ALLOWED_ALWAYS');
    expect(invoke).toHaveBeenCalledWith('fs_write_file', {
      projectId: 'proj-1',
      relativePath: 'src/main.rs',
      contents: 'code',
      decision: 'ALLOWED_ALWAYS',
    });
  });

  it('delegates empty file creation for New File flow', async () => {
    const fs = new TauriProjectFilesystem();
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await fs.write({ projectId: 'proj-1', relativePath: 'new-file.txt' }, '');
    expect(invoke).toHaveBeenCalledWith('fs_write_file', {
      projectId: 'proj-1',
      relativePath: 'new-file.txt',
      contents: '',
      decision: 'ALLOWED_SESSION',
    });
  });

  it('delegates nested file creation with subdirectories', async () => {
    const fs = new TauriProjectFilesystem();
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await fs.write({ projectId: 'proj-1', relativePath: 'sub/nested/file.txt' }, '');
    expect(invoke).toHaveBeenCalledWith('fs_write_file', {
      projectId: 'proj-1',
      relativePath: 'sub/nested/file.txt',
      contents: '',
      decision: 'ALLOWED_SESSION',
    });
  });
});
