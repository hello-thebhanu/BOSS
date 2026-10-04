import type { PermissionKind } from '../../core/security/permissions';
import type { Tool, ToolResult } from './tool';
import { projectFilesystem, type FileEntry } from '../filesystem/projectFilesystem';
import { terminalService } from '../terminal/terminalService';
import { gitService, type GitStatus, type GitCommit } from '../git/gitService';

// ─── Filesystem Tools ──────────────────────────────────────────

export class FsListTool implements Tool<{ projectId: string; relativePath?: string }, readonly FileEntry[]> {
  readonly name = 'fs_list';
  readonly description = 'List files and directories in a registered project relative path.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
      relativePath: { type: 'string', default: '' },
    },
    required: ['projectId'],
  };
  readonly permissions: readonly PermissionKind[] = ['READ_FILE'];

  async execute(input: { projectId: string; relativePath?: string }): Promise<ToolResult<readonly FileEntry[]>> {
    try {
      if (!input.projectId) {
        return { ok: false, error: { code: 'INVALID_ARGS', message: 'projectId is required' } };
      }
      const entries = await projectFilesystem.list({
        projectId: input.projectId,
        relativePath: input.relativePath ?? '',
      });
      return { ok: true, value: entries };
    } catch (err: unknown) {
      return { ok: false, error: { code: 'FS_LIST_ERROR', message: err instanceof Error ? err.message : String(err) } };
    }
  }
}

export class FsReadTool implements Tool<{ projectId: string; relativePath: string }, { content: string }> {
  readonly name = 'fs_read';
  readonly description = 'Read UTF-8 content of a file in the registered project.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
      relativePath: { type: 'string' },
    },
    required: ['projectId', 'relativePath'],
  };
  readonly permissions: readonly PermissionKind[] = ['READ_FILE'];

  async execute(input: { projectId: string; relativePath: string }): Promise<ToolResult<{ content: string }>> {
    try {
      if (!input.projectId || !input.relativePath) {
        return { ok: false, error: { code: 'INVALID_ARGS', message: 'projectId and relativePath are required' } };
      }
      const content = await projectFilesystem.read({
        projectId: input.projectId,
        relativePath: input.relativePath,
      });
      return { ok: true, value: { content } };
    } catch (err: unknown) {
      return { ok: false, error: { code: 'FS_READ_ERROR', message: err instanceof Error ? err.message : String(err) } };
    }
  }
}

export class FsWriteTool implements Tool<{ projectId: string; relativePath: string; content: string }, { success: true }> {
  readonly name = 'fs_write';
  readonly description = 'Write UTF-8 content to a file in the registered project.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
      relativePath: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['projectId', 'relativePath', 'content'],
  };
  readonly permissions: readonly PermissionKind[] = ['WRITE_FILE'];

  async execute(input: { projectId: string; relativePath: string; content: string }): Promise<ToolResult<{ success: true }>> {
    try {
      if (!input.projectId || !input.relativePath || input.content === undefined) {
        return { ok: false, error: { code: 'INVALID_ARGS', message: 'projectId, relativePath, and content are required' } };
      }
      await projectFilesystem.write({
        projectId: input.projectId,
        relativePath: input.relativePath,
      }, input.content);
      return { ok: true, value: { success: true } };
    } catch (err: unknown) {
      return { ok: false, error: { code: 'FS_WRITE_ERROR', message: err instanceof Error ? err.message : String(err) } };
    }
  }
}

export class FsCreateDirTool implements Tool<{ projectId: string; relativePath: string }, { success: true }> {
  readonly name = 'fs_create_dir';
  readonly description = 'Create a directory in the registered project.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
      relativePath: { type: 'string' },
    },
    required: ['projectId', 'relativePath'],
  };
  readonly permissions: readonly PermissionKind[] = ['WRITE_FILE'];

  async execute(input: { projectId: string; relativePath: string }): Promise<ToolResult<{ success: true }>> {
    try {
      if (!input.projectId || !input.relativePath) {
        return { ok: false, error: { code: 'INVALID_ARGS', message: 'projectId and relativePath are required' } };
      }
      await projectFilesystem.createDirectory({
        projectId: input.projectId,
        relativePath: input.relativePath,
      });
      return { ok: true, value: { success: true } };
    } catch (err: unknown) {
      return { ok: false, error: { code: 'FS_CREATE_DIR_ERROR', message: err instanceof Error ? err.message : String(err) } };
    }
  }
}

export class FsRenameTool implements Tool<{ projectId: string; oldPath: string; newPath: string }, { success: true }> {
  readonly name = 'fs_rename';
  readonly description = 'Rename a file or directory in the registered project.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
      oldPath: { type: 'string' },
      newPath: { type: 'string' },
    },
    required: ['projectId', 'oldPath', 'newPath'],
  };
  readonly permissions: readonly PermissionKind[] = ['WRITE_FILE'];

  async execute(input: { projectId: string; oldPath: string; newPath: string }): Promise<ToolResult<{ success: true }>> {
    try {
      if (!input.projectId || !input.oldPath || !input.newPath) {
        return { ok: false, error: { code: 'INVALID_ARGS', message: 'projectId, oldPath, and newPath are required' } };
      }
      await projectFilesystem.rename({
        projectId: input.projectId,
        relativePath: input.oldPath,
      }, input.newPath);
      return { ok: true, value: { success: true } };
    } catch (err: unknown) {
      return { ok: false, error: { code: 'FS_RENAME_ERROR', message: err instanceof Error ? err.message : String(err) } };
    }
  }
}

export class FsRemoveTool implements Tool<{ projectId: string; relativePath: string }, { success: true }> {
  readonly name = 'fs_remove';
  readonly description = 'Remove a file or directory in the registered project.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
      relativePath: { type: 'string' },
    },
    required: ['projectId', 'relativePath'],
  };
  readonly permissions: readonly PermissionKind[] = ['DELETE_FILE'];

  async execute(input: { projectId: string; relativePath: string }): Promise<ToolResult<{ success: true }>> {
    try {
      if (!input.projectId || !input.relativePath) {
        return { ok: false, error: { code: 'INVALID_ARGS', message: 'projectId and relativePath are required' } };
      }
      await projectFilesystem.remove({
        projectId: input.projectId,
        relativePath: input.relativePath,
      });
      return { ok: true, value: { success: true } };
    } catch (err: unknown) {
      return { ok: false, error: { code: 'FS_REMOVE_ERROR', message: err instanceof Error ? err.message : String(err) } };
    }
  }
}

// ─── Terminal Tool ─────────────────────────────────────────────

export class TerminalRunTool implements Tool<{ projectId: string; command: string }, { command: string; status: 'dispatched' }> {
  readonly name = 'terminal_run';
  readonly description = 'Dispatch a command to the native project terminal session.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
      command: { type: 'string' },
    },
    required: ['projectId', 'command'],
  };
  readonly permissions: readonly PermissionKind[] = ['RUN_COMMAND'];

  async execute(input: { projectId: string; command: string }): Promise<ToolResult<{ command: string; status: 'dispatched' }>> {
    try {
      if (!input.projectId || !input.command) {
        return { ok: false, error: { code: 'INVALID_ARGS', message: 'projectId and command are required' } };
      }
      const session = await terminalService.start(input.projectId);
      await terminalService.send(session.id, input.command);
      return { ok: true, value: { command: input.command, status: 'dispatched' } };
    } catch (err: unknown) {
      return { ok: false, error: { code: 'TERMINAL_RUN_ERROR', message: err instanceof Error ? err.message : String(err) } };
    }
  }
}

// ─── Git Tools ─────────────────────────────────────────────────

export class GitStatusTool implements Tool<{ projectId: string }, GitStatus> {
  readonly name = 'git_status';
  readonly description = 'Get current git repository status and changed files.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
    },
    required: ['projectId'],
  };
  readonly permissions: readonly PermissionKind[] = ['GIT_OPERATION'];

  async execute(input: { projectId: string }): Promise<ToolResult<GitStatus>> {
    try {
      if (!input.projectId) {
        return { ok: false, error: { code: 'INVALID_ARGS', message: 'projectId is required' } };
      }
      const status = await gitService.status(input.projectId);
      return { ok: true, value: status };
    } catch (err: unknown) {
      return { ok: false, error: { code: 'GIT_STATUS_ERROR', message: err instanceof Error ? err.message : String(err) } };
    }
  }
}

export class GitDiffTool implements Tool<{ projectId: string; path?: string; cached?: boolean }, string> {
  readonly name = 'git_diff';
  readonly description = 'Get git diff for the project working tree or staged index.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
      path: { type: 'string' },
      cached: { type: 'boolean' },
    },
    required: ['projectId'],
  };
  readonly permissions: readonly PermissionKind[] = ['GIT_OPERATION'];

  async execute(input: { projectId: string; path?: string; cached?: boolean }): Promise<ToolResult<string>> {
    try {
      if (!input.projectId) {
        return { ok: false, error: { code: 'INVALID_ARGS', message: 'projectId is required' } };
      }
      const diff = await gitService.diff(input.projectId, { path: input.path, staged: input.cached });
      return { ok: true, value: diff };
    } catch (err: unknown) {
      return { ok: false, error: { code: 'GIT_DIFF_ERROR', message: err instanceof Error ? err.message : String(err) } };
    }
  }
}

export class GitLogTool implements Tool<{ projectId: string; maxCount?: number }, readonly GitCommit[]> {
  readonly name = 'git_log';
  readonly description = 'Get recent git commit history for the project.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
      maxCount: { type: 'number', default: 20 },
    },
    required: ['projectId'],
  };
  readonly permissions: readonly PermissionKind[] = ['GIT_OPERATION'];

  async execute(input: { projectId: string; maxCount?: number }): Promise<ToolResult<readonly GitCommit[]>> {
    try {
      if (!input.projectId) {
        return { ok: false, error: { code: 'INVALID_ARGS', message: 'projectId is required' } };
      }
      const log = await gitService.log(input.projectId, input.maxCount);
      return { ok: true, value: log };
    } catch (err: unknown) {
      return { ok: false, error: { code: 'GIT_LOG_ERROR', message: err instanceof Error ? err.message : String(err) } };
    }
  }
}

export class GitBranchesTool implements Tool<{ projectId: string }, readonly string[]> {
  readonly name = 'git_branches';
  readonly description = 'List git branches for the project.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
    },
    required: ['projectId'],
  };
  readonly permissions: readonly PermissionKind[] = ['GIT_OPERATION'];

  async execute(input: { projectId: string }): Promise<ToolResult<readonly string[]>> {
    try {
      if (!input.projectId) {
        return { ok: false, error: { code: 'INVALID_ARGS', message: 'projectId is required' } };
      }
      const branches = await gitService.branches(input.projectId);
      return { ok: true, value: branches };
    } catch (err: unknown) {
      return { ok: false, error: { code: 'GIT_BRANCHES_ERROR', message: err instanceof Error ? err.message : String(err) } };
    }
  }
}

export class GitStageTool implements Tool<{ projectId: string; paths: string[] }, { success: true }> {
  readonly name = 'git_stage';
  readonly description = 'Stage files into the git index.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
      paths: { type: 'array', items: { type: 'string' } },
    },
    required: ['projectId', 'paths'],
  };
  readonly permissions: readonly PermissionKind[] = ['GIT_OPERATION'];

  async execute(input: { projectId: string; paths: string[] }): Promise<ToolResult<{ success: true }>> {
    try {
      if (!input.projectId || !Array.isArray(input.paths) || input.paths.length === 0) {
        return { ok: false, error: { code: 'INVALID_ARGS', message: 'projectId and non-empty paths array are required' } };
      }
      await gitService.stage(input.projectId, input.paths);
      return { ok: true, value: { success: true } };
    } catch (err: unknown) {
      return { ok: false, error: { code: 'GIT_STAGE_ERROR', message: err instanceof Error ? err.message : String(err) } };
    }
  }
}

export class GitUnstageTool implements Tool<{ projectId: string; paths: string[] }, { success: true }> {
  readonly name = 'git_unstage';
  readonly description = 'Unstage files from the git index.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
      paths: { type: 'array', items: { type: 'string' } },
    },
    required: ['projectId', 'paths'],
  };
  readonly permissions: readonly PermissionKind[] = ['GIT_OPERATION'];

  async execute(input: { projectId: string; paths: string[] }): Promise<ToolResult<{ success: true }>> {
    try {
      if (!input.projectId || !Array.isArray(input.paths) || input.paths.length === 0) {
        return { ok: false, error: { code: 'INVALID_ARGS', message: 'projectId and non-empty paths array are required' } };
      }
      await gitService.unstage(input.projectId, input.paths);
      return { ok: true, value: { success: true } };
    } catch (err: unknown) {
      return { ok: false, error: { code: 'GIT_UNSTAGE_ERROR', message: err instanceof Error ? err.message : String(err) } };
    }
  }
}

export class GitCommitTool implements Tool<{ projectId: string; message: string }, { commitOutput: string }> {
  readonly name = 'git_commit';
  readonly description = 'Commit staged changes to the git repository with a commit message.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      projectId: { type: 'string' },
      message: { type: 'string' },
    },
    required: ['projectId', 'message'],
  };
  readonly permissions: readonly PermissionKind[] = ['GIT_OPERATION'];

  async execute(input: { projectId: string; message: string }): Promise<ToolResult<{ commitOutput: string }>> {
    try {
      if (!input.projectId || !input.message?.trim()) {
        return { ok: false, error: { code: 'INVALID_ARGS', message: 'projectId and non-empty commit message are required' } };
      }
      const output = await gitService.commit(input.projectId, input.message.trim());
      return { ok: true, value: { commitOutput: output } };
    } catch (err: unknown) {
      return { ok: false, error: { code: 'GIT_COMMIT_ERROR', message: err instanceof Error ? err.message : String(err) } };
    }
  }
}

// ─── Tool Registry ─────────────────────────────────────────────

export class ProjectToolRegistry {
  private readonly tools = new Map<string, Tool<any, any>>();

  constructor() {
    this.register(new FsListTool());
    this.register(new FsReadTool());
    this.register(new FsWriteTool());
    this.register(new FsCreateDirTool());
    this.register(new FsRenameTool());
    this.register(new FsRemoveTool());
    this.register(new TerminalRunTool());
    this.register(new GitStatusTool());
    this.register(new GitDiffTool());
    this.register(new GitLogTool());
    this.register(new GitBranchesTool());
    this.register(new GitStageTool());
    this.register(new GitUnstageTool());
    this.register(new GitCommitTool());
  }

  register(tool: Tool<any, any>): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool<any, any> | undefined {
    return this.tools.get(name);
  }

  list(): readonly Tool<any, any>[] {
    return Array.from(this.tools.values());
  }

  listToolNames(): readonly string[] {
    return Array.from(this.tools.keys());
  }

  getToolDescriptions(): string {
    return Array.from(this.tools.values())
      .map((t) => `- ${t.name}: ${t.description}`)
      .join('\n');
  }
}

export const projectTools = new ProjectToolRegistry();
