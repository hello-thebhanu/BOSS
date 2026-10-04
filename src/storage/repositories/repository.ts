export interface Repository<T extends { id: string }> { get(id: string): Promise<T | null>; list(): Promise<readonly T[]>; save(entity: T): Promise<void>; remove(id: string): Promise<void>; }
