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
    vi.stubEnv('NEXT_PUBLIC_RELEASE', 'sha-release-test');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_RELEASE', 'release-test');
    vi.stubEnv('SENTRY_RELEASE', '');
    const removeListener = vi.spyOn(window, 'removeEventListener');

    const { onRouterTransitionStart } = await import('../instrumentation-client');
    expect(sentry.init).not.toHaveBeenCalled();

    window.dispatchEvent(new PointerEvent('pointerdown'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    onRouterTransitionStart('/fr/products', 'push');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureRouterTransitionStart).not.toHaveBeenCalled();

    const error = new Error('after initialization');
    window.dispatchEvent(
      new ErrorEvent('error', {
        error,
        filename: 'https://user:secret@bricomaitre.com/_next/static/chunk.js?token=secret#details',
        lineno: 8,
        colno: 21,
      }),
    );
    await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledOnce());
    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        release: 'release-test',
        sendDefaultPii: false,
        integrations: [{ name: 'BrowserTracing' }],
        initialScope: { tags: { service: 'storefront', capture_phase: 'sdk' } },
      }),
    );
    expect(sentry.browserTracingIntegration).toHaveBeenCalledWith({
      instrumentPageLoad: false,
      instrumentNavigation: true,
    });
    expect(sentry.captureException).toHaveBeenCalledWith(error, {
      mechanism: { type: 'error', handled: false },
      captureContext: {
        tags: { capture_phase: 'bootstrap' },
        contexts: {
          browser_error: {
            sourceUrl: 'https://bricomaitre.com/_next/static/chunk.js',
            lineNumber: 8,
            columnNumber: 21,
          },
        },
      },
    });

    expect(removeListener).toHaveBeenCalledWith('error', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
    expect(sentry.captureException).toHaveBeenCalledOnce();
    removeListener.mockRestore();

    onRouterTransitionStart('/fr/checkout', 'push');
    expect(sentry.captureRouterTransitionStart).toHaveBeenCalledWith('/fr/checkout', 'push');
  });
});
