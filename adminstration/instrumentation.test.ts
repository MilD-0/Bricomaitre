import { beforeEach, describe, expect, it, vi } from 'vitest';

const { instrumentationNodeLoadedMock } = vi.hoisted(() => ({
  instrumentationNodeLoadedMock: vi.fn(),
}));

vi.mock('./instrumentation.node', () => ({
  __esModule: true,
  default: instrumentationNodeLoadedMock(),
}));

describe('instrumentation', () => {
  beforeEach(() => {
    vi.resetModules();
    instrumentationNodeLoadedMock.mockReset();
  });

  it('starts the ECOTRACK scheduler for node runtimes', async () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    const { register } = await import('./instrumentation');

    await register();

    expect(instrumentationNodeLoadedMock).toHaveBeenCalledTimes(1);
  });

  it('skips scheduler startup for edge runtimes', async () => {
    process.env.NEXT_RUNTIME = 'edge';
    const { register } = await import('./instrumentation');

    await register();

    expect(instrumentationNodeLoadedMock).not.toHaveBeenCalled();
  });
});
