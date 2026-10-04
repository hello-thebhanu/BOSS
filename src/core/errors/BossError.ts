export class BossError extends Error { constructor(public readonly code: string, message: string, public readonly cause?: unknown) { super(message); this.name = 'BossError'; } }
