import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetMobilePageZoom } from './mobile-page-zoom';

describe('resetMobilePageZoom', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.head.insertAdjacentHTML('beforeend', '<meta name="viewport" content="width=device-width, initial-scale=1">');
  });

  afterEach(() => {
    document.querySelector('meta[name="viewport"]')?.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('briefly constrains a pinched viewport so the browser returns to scale one', () => {
    vi.stubGlobal('visualViewport', { scale: 2 });

    resetMobilePageZoom();

    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    expect(viewport).toHaveAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
    vi.advanceTimersByTime(300);
    expect(viewport).toHaveAttribute('content', 'width=device-width, initial-scale=1');
  });

  it('does not touch an already unzoomed page', () => {
    vi.stubGlobal('visualViewport', { scale: 1 });

    resetMobilePageZoom();

    expect(document.querySelector('meta[name="viewport"]')).toHaveAttribute('content', 'width=device-width, initial-scale=1');
    expect(vi.getTimerCount()).toBe(0);
  });
});
