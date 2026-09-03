import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  prepare: vi.fn(),
  script: vi.fn(),
}));

vi.mock('next/script', () => ({
  default: (props: {
    id: string;
    src: string;
    strategy: string;
    onLoad?: () => void;
    onError?: () => void;
  }) => {
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

  it('queues events immediately and gives Meta the first browser-idle slot', () => {
    render(<MarketingPixels metaPixelId="meta-id" googleMeasurementId="G-TEST" />);

    expect(mocks.capture).toHaveBeenCalledOnce();
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(scriptProps('bric-meta-pixel')).toMatchObject({
      src: 'https://connect.facebook.net/en_US/fbevents.js',
      strategy: 'lazyOnload',
    });
    expect(scriptProps('bric-google-analytics')).toBeUndefined();
    expect(scriptProps('bric-tiktok-pixel')).toBeUndefined();
  });

  it('offers GA4 its own idle slot only after Meta has loaded', () => {
    render(<MarketingPixels metaPixelId="meta-id" googleMeasurementId="G-TEST" />);
    const metaProps = scriptProps('bric-meta-pixel');
    act(() => metaProps?.onLoad?.());

    expect(scriptProps('bric-google-analytics')).toMatchObject({
      src: 'https://www.googletagmanager.com/gtag/js?id=G-TEST',
      strategy: 'lazyOnload',
    });
  });

  it('does not let a blocked Meta request prevent GA4 from loading', () => {
    render(<MarketingPixels metaPixelId="meta-id" googleMeasurementId="G-TEST" />);
    const metaProps = scriptProps('bric-meta-pixel');
    act(() => metaProps?.onError?.());

    expect(scriptProps('bric-google-analytics')).toBeDefined();
  });
});
