import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { syncMock, configMock, scheduleMock } = vi.hoisted(() => ({
  syncMock: vi.fn(),
  configMock: vi.fn(),
  scheduleMock: vi.fn(() => ({ destroy: vi.fn() })),
}));

vi.mock('node-cron', () => ({
  default: { schedule: scheduleMock, validate: () => true },
}));
vi.mock('./search-console', () => ({
  readSearchConsoleConfig: configMock,
  syncSearchConsole: syncMock,
}));

import {
  runScheduledSearchConsoleSync,
  startSearchConsoleScheduler,
  stopSearchConsoleScheduler,
} from './search-console-scheduler';

describe('Search Console scheduler', () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ADMIN_SEARCH_CONSOLE_SYNC_ENABLED', 'false');
    stopSearchConsoleScheduler();
  });

  it('stays disabled unless explicitly enabled', async () => {
    expect(startSearchConsoleScheduler()).toBeNull();
    expect(configMock).not.toHaveBeenCalled();
    expect(scheduleMock).not.toHaveBeenCalled();
    vi.stubEnv('ADMIN_SEARCH_CONSOLE_SYNC_ENABLED', 'true');
    expect(startSearchConsoleScheduler()).not.toBeNull();
    expect(scheduleMock).toHaveBeenCalledOnce();
    expect(syncMock).toHaveBeenCalledWith({ trigger: 'startup' });
    await Promise.resolve();
  });

  it('prevents overlapping provider synchronizations', async () => {
    let release: (() => void) | undefined;
    syncMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const first = runScheduledSearchConsoleSync('schedule');
    await Promise.resolve();
    expect(await runScheduledSearchConsoleSync('schedule')).toBe(false);
    release?.();
    expect(await first).toBe(true);
    expect(syncMock).toHaveBeenCalledOnce();
  });
});
