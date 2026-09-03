import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  prepare: vi.fn(),
  script: vi.fn(),
}));

vi.mock('next/script', () => ({
  default: (props: { id: string; src: string; strategy: string }) => {
    mocks.script(props);
    return null;
  },
}));
vi.mock('@/lib/marketing-attribution', () => ({
  captureMarketingAttribution: mocks.capture,
}));
vi.mock('@/lib/marketing-destinations', () => ({
  prepareMarketingDestinations: mocks.prepare,
}));

import { MarketingPixels } from './marketing-pixels';

function scriptProps(id: string) {
  return mocks.script.mock.calls.find(([props]) => props.id === id)?.[0];
}

describe('MarketingPixels standard script loading boundary', () => {
  beforeEach(() => {
    mocks.capture.mockReset();
    mocks.prepare.mockReset();
    mocks.script.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('queues events immediately and loads only Meta during browser idle', () => {
    render(<MarketingPixels metaPixelId="meta-id" />);

    expect(mocks.capture).toHaveBeenCalledOnce();
    expect(mocks.prepare).toHaveBeenCalledWith({ metaPixelId: 'meta-id' });
    expect(scriptProps('bric-meta-pixel')).toMatchObject({
      src: 'https://connect.facebook.net/en_US/fbevents.js',
      strategy: 'lazyOnload',
    });
    expect(scriptProps('bric-google-analytics')).toBeUndefined();
    expect(scriptProps('bric-tiktok-pixel')).toBeUndefined();
  });

  it('does not load a marketing script when Meta is unconfigured', () => {
    render(<MarketingPixels metaPixelId={null} />);

    expect(mocks.capture).toHaveBeenCalledOnce();
    expect(mocks.prepare).toHaveBeenCalledWith({ metaPixelId: null });
    expect(mocks.script).not.toHaveBeenCalled();
  });
});
