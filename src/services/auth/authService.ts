export type AuthMode = 'local' | 'authenticated';
export type AuthIdentity = { id: string; displayName?: string; provider: 'email' | 'google' | 'github' | 'local' };
export interface AuthService { getMode(): Promise<AuthMode>; getIdentity(): Promise<AuthIdentity | null>; continueLocally(): Promise<void>; signIn(provider: Exclude<AuthIdentity['provider'], 'local'>): Promise<AuthIdentity>; signOut(): Promise<void>; }
