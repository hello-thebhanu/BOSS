import { describe, expect, it, vi } from 'vitest';
import { TauriTerminalService, terminalService } from './terminalService';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

describe('TauriTerminalService', () => {
  it('exposes the singleton instance', () => {
    expect(terminalService).toBeInstanceOf(TauriTerminalService);
  });

  it('delegates start to terminal_start_session with default ALLOWED_SESSION', async () => {
    const service = new TauriTerminalService();
    const fakeSession = { id: 'term-1', projectId: 'p1', cwd: 'C:/proj', status: 'running' as const };
    vi.mocked(invoke).mockResolvedValueOnce(fakeSession);

    const session = await service.start('p1');
    expect(invoke).toHaveBeenCalledWith('terminal_start_session', {
      projectId: 'p1',
      decision: 'ALLOWED_SESSION',
    });
    expect(session).toEqual(fakeSession);
  });

  it('delegates start with explicit permission decision', async () => {
    const service = new TauriTerminalService();
    const fakeSession = { id: 'term-2', projectId: 'p2', cwd: 'C:/proj2', status: 'running' as const };
    vi.mocked(invoke).mockResolvedValueOnce(fakeSession);

    const session = await service.start('p2', 'ALLOWED_ALWAYS');
    expect(invoke).toHaveBeenCalledWith('terminal_start_session', {
      projectId: 'p2',
      decision: 'ALLOWED_ALWAYS',
    });
    expect(session).toEqual(fakeSession);
  });

  it('delegates send to terminal_send_input', async () => {
    const service = new TauriTerminalService();
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await service.send('term-1', 'dir');
    expect(invoke).toHaveBeenCalledWith('terminal_send_input', {
      sessionId: 'term-1',
      input: 'dir',
    });
  });

  it('delegates stop to terminal_stop_session', async () => {
    const service = new TauriTerminalService();
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await service.stop('term-1');
    expect(invoke).toHaveBeenCalledWith('terminal_stop_session', {
      sessionId: 'term-1',
      decision: 'ALLOWED_SESSION',
    });
  });

  it('subscribes to terminal-output events and forwards payload', async () => {
    const service = new TauriTerminalService();
    let listenerCb: ((event: { payload: unknown }) => void) | undefined;
    const unlistenFn = vi.fn();

    vi.mocked(listen).mockImplementationOnce(async (_event, cb) => {
      listenerCb = cb as typeof listenerCb;
      return unlistenFn;
    });

    const received: unknown[] = [];
    const unsubscribe = service.subscribe((out) => {
      received.push(out);
    });

    expect(listen).toHaveBeenCalledWith('terminal-output', expect.any(Function));

    // Simulate event payload
    listenerCb?.({
      payload: { sessionId: 'term-1', stream: 'stdout', data: 'Hello from terminal' },
    });

    expect(received).toEqual([
      { sessionId: 'term-1', stream: 'stdout', data: 'Hello from terminal' },
    ]);

    unsubscribe();
    // Allow promise tick to call unlisten
    await Promise.resolve();
    expect(unlistenFn).toHaveBeenCalled();
  });

  it('delegates poll to terminal_poll_output', async () => {
    const service = new TauriTerminalService();
    const fakeChunks = [
      { sessionId: 'term-1', stream: 'stdout' as const, data: 'line 1\n', seq: 1 },
      { sessionId: 'term-1', stream: 'stdout' as const, data: 'line 2\n', seq: 2 },
    ];
    vi.mocked(invoke).mockResolvedValueOnce(fakeChunks);

    const result = await service.poll('term-1');
    expect(invoke).toHaveBeenCalledWith('terminal_poll_output', { sessionId: 'term-1' });
    expect(result).toEqual(fakeChunks);
  });
});
