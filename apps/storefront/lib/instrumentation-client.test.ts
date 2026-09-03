import { afterEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
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
    sentry.browserTracingIntegration.mockClear();
    sentry.captureException.mockReset();
    sentry.captureRouterTransitionStart.mockReset();
  });

  it('loads Sentry for an error, not for successful-session interactions or navigation', async () => {
    vi.useFakeTimers();
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN_STOREFRONT', 'https://public@example.ingest.sentry.io/123');

    const { onRouterTransitionStart } = await import('../instrumentation-client');
    expect(sentry.init).not.toHaveBeenCalled();

    window.dispatchEvent(new PointerEvent('pointerdown'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    onRouterTransitionStart('/fr/products', 'push');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureRouterTransitionStart).not.toHaveBeenCalled();

    const error = new Error('after initialization');
    window.dispatchEvent(new ErrorEvent('error', { error }));
    await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledOnce());
    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        sendDefaultPii: false,
        integrations: [{ name: 'BrowserTracing' }],
        initialScope: { tags: { service: 'storefront' } },
      }),
    );
    expect(sentry.browserTracingIntegration).toHaveBeenCalledWith({
      instrumentPageLoad: false,
      instrumentNavigation: true,
    });
    expect(sentry.captureException).toHaveBeenCalledWith(error, {
      mechanism: { type: 'error', handled: false },
    });

    onRouterTransitionStart('/fr/checkout', 'push');
    expect(sentry.captureRouterTransitionStart).toHaveBeenCalledWith('/fr/checkout', 'push');
  });
});
