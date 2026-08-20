import { beforeEach, describe, expect, it, vi } from 'vitest';

const { syncMock, configMock, scheduleMock } = vi.hoisted(() => ({
  syncMock: vi.fn(),
  configMock: vi.fn(),
  scheduleMock: vi.fn(() => ({ stop: vi.fn() })),
}));

vi.mock('node-cron', () => ({
  default: { schedule: scheduleMock, validate: () => true },
}));
vi.mock('./search-console', () => ({
  readSearchConsoleConfig: configMock,
  syncSearchConsole: syncMock,
}));

import {
  resetSearchConsoleSchedulerForTests,
  runScheduledSearchConsoleSync,
  startSearchConsoleScheduler,
} from './search-console-scheduler';

describe('Search Console scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSearchConsoleSchedulerForTests();
  });

  it('stays disabled unless explicitly enabled', () => {
    const previous = process.env.ADMIN_SEARCH_CONSOLE_SYNC_ENABLED;
    delete process.env.ADMIN_SEARCH_CONSOLE_SYNC_ENABLED;
    expect(startSearchConsoleScheduler()).toBeNull();
    expect(configMock).not.toHaveBeenCalled();
    if (previous == null) delete process.env.ADMIN_SEARCH_CONSOLE_SYNC_ENABLED;
    else process.env.ADMIN_SEARCH_CONSOLE_SYNC_ENABLED = previous;
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
