import { invoke } from '@tauri-apps/api/core';
import type { Project } from '../storage/types/entities';

export type ProjectRegistrationDecision = 'ALLOWED_ONCE' | 'ALLOWED_SESSION' | 'ALLOWED_ALWAYS' | 'DENIED';
/** Narrow native entry point: it can only open the picker and register its selected canonical directory. */
export function registerProject(decision: ProjectRegistrationDecision = 'ALLOWED_ONCE'): Promise<Project | null> {
  return invoke<Project | null>('register_project', { request: { id: crypto.randomUUID(), decision } });
}
