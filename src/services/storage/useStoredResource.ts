import { useEffect, useState } from 'react';
export type StoredResource<T> = { status: 'loading' | 'ready' | 'unavailable'; data: readonly T[] };
/** Converts a repository list operation into presentation state without leaking database details to UI. */
export function useStoredResource<T>(load: () => Promise<readonly T[]>): StoredResource<T> { const [state, setState] = useState<StoredResource<T>>({ status: 'loading', data: [] }); useEffect(() => { let active = true; load().then((data) => active && setState({ status: 'ready', data })).catch(() => active && setState({ status: 'unavailable', data: [] })); return () => { active = false; }; }, []); return state; }
