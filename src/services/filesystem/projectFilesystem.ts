import { invoke } from '@tauri-apps/api/core';
import type { PermissionDecision } from '../../core/security/permissions';

export type ProjectPath = { projectId: string; relativePath: string };
export type FileEntry = { name: string; relativePath: string; kind: 'file' | 'directory' };

export type ProjectFilesystem = {
  list(path: ProjectPath, decision?: PermissionDecision): Promise<readonly FileEntry[]>;
  read(path: ProjectPath, decision?: PermissionDecision): Promise<string>;
  write(path: ProjectPath, contents: string, decision?: PermissionDecision): Promise<void>;
  createDirectory(path: ProjectPath, decision?: PermissionDecision): Promise<void>;
  rename(path: ProjectPath, destination: string, decision?: PermissionDecision): Promise<void>;
  remove(path: ProjectPath, decision?: PermissionDecision): Promise<void>;
};

export class TauriProjectFilesystem implements ProjectFilesystem {
  list(path: ProjectPath, decision: PermissionDecision = 'ALLOWED_SESSION'): Promise<readonly FileEntry[]> {
    return invoke<FileEntry[]>('fs_list_directory', {
      projectId: path.projectId,
      relativePath: path.relativePath,
      decision,
    });
  }

  read(path: ProjectPath, decision: PermissionDecision = 'ALLOWED_SESSION'): Promise<string> {
    return invoke<string>('fs_read_file', {
      projectId: path.projectId,
      relativePath: path.relativePath,
      decision,
    });
  }

  write(path: ProjectPath, contents: string, decision: PermissionDecision = 'ALLOWED_SESSION'): Promise<void> {
    return invoke<void>('fs_write_file', {
      projectId: path.projectId,
      relativePath: path.relativePath,
      contents,
      decision,
    });
  }

  createDirectory(path: ProjectPath, decision: PermissionDecision = 'ALLOWED_SESSION'): Promise<void> {
    return invoke<void>('fs_create_directory', {
      projectId: path.projectId,
      relativePath: path.relativePath,
      decision,
    });
  }

  rename(path: ProjectPath, destination: string, decision: PermissionDecision = 'ALLOWED_SESSION'): Promise<void> {
    return invoke<void>('fs_rename', {
      projectId: path.projectId,
      relativePath: path.relativePath,
      destination,
      decision,
    });
  }

  remove(path: ProjectPath, decision: PermissionDecision = 'ALLOWED_ONCE'): Promise<void> {
    return invoke<void>('fs_remove', {
      projectId: path.projectId,
      relativePath: path.relativePath,
      decision,
    });
  }
}

export const projectFilesystem: ProjectFilesystem = new TauriProjectFilesystem();
