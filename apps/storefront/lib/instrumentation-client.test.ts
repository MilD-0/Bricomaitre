import { afterEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => sentry);

describe('client instrumentation loading', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetModules();
    sentry.init.mockReset();
    sentry.captureException.mockReset();
    sentry.captureRouterTransitionStart.mockReset();
  });

  it('keeps the Sentry SDK off the initial rendering path and initializes it after the quiet window', async () => {
    vi.useFakeTimers();
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN_STOREFRONT', 'https://public@example.ingest.sentry.io/123');

    await import('../instrumentation-client');
    expect(sentry.init).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(19_999);
    expect(sentry.init).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(sentry.init).toHaveBeenCalledOnce();
    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        sendDefaultPii: false,
        initialScope: { tags: { service: 'storefront' } },
      }),
    );

    const error = new Error('after initialization');
    window.dispatchEvent(new ErrorEvent('error', { error }));
    expect(sentry.captureException).toHaveBeenCalledWith(error, {
      mechanism: { type: 'error', handled: false },
    });
  });
});
