import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  load: vi.fn(),
  prepare: vi.fn(),
}));

vi.mock('@/lib/marketing-attribution', () => ({
  captureMarketingAttribution: mocks.capture,
}));
vi.mock('@/lib/marketing-destinations', () => ({
  loadMarketingDestinationScripts: mocks.load,
  prepareMarketingDestinations: mocks.prepare,
}));

import { MARKETING_SCRIPT_FALLBACK_DELAY_MS, MarketingPixels } from './marketing-pixels';

describe('MarketingPixels weak-phone loading boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.capture.mockReset();
    mocks.load.mockReset();
    mocks.prepare.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('queues attribution immediately without loading vendor JavaScript on the critical path', () => {
    render(<MarketingPixels />);

    expect(mocks.capture).toHaveBeenCalledOnce();
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('loads once after a real interaction or the post-load fallback delay', () => {
    render(<MarketingPixels />);
    window.dispatchEvent(new Event('load'));

    act(() => {
      vi.advanceTimersByTime(MARKETING_SCRIPT_FALLBACK_DELAY_MS - 1);
    });
    expect(mocks.load).not.toHaveBeenCalled();

    window.dispatchEvent(new MouseEvent('click'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    act(() => {
      vi.advanceTimersByTime(MARKETING_SCRIPT_FALLBACK_DELAY_MS);
    });
    expect(mocks.load).toHaveBeenCalledOnce();
  });
});
