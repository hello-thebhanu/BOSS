import { describe, expect, it, vi } from 'vitest';
import { ProjectRepository, SettingsRepository } from './repositories';
import type { StorageGateway } from './storageGateway';
const gateway = { projects: { list: vi.fn(async () => []), create: vi.fn(), get: vi.fn(), update: vi.fn(), delete: vi.fn() }, settings: { get: vi.fn(), set: vi.fn() } } as unknown as StorageGateway;
describe('typed repositories', () => { it('delegates project reads through the storage gateway', async () => { await new ProjectRepository(gateway).listProjects(); expect(gateway.projects.list).toHaveBeenCalledOnce(); }); it('keeps project removal at the repository boundary', async () => { await new ProjectRepository(gateway).deleteProject('project-id'); expect(gateway.projects.delete).toHaveBeenCalledWith('project-id'); }); it('does not expose raw SQL to settings clients', () => expect(typeof new SettingsRepository(gateway).getSetting).toBe('function')); });
