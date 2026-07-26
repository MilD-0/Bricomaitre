import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomepageBannerCarousel } from './homepage-banner-carousel';

const mocks = vi.hoisted(() => ({ scrollNext: vi.fn() }));
vi.mock('embla-carousel-react', () => ({ default: () => [vi.fn(), { scrollNext: mocks.scrollNext }] }));
vi.mock('next/image', () => ({ getImageProps: ({ src, alt, sizes }: Record<string, unknown>) => ({ props: { src, alt, sizes, srcSet: String(src) } }) }));

const stamp = '2026-07-01T00:00:00.000Z';
const banners = [1, 2].map((id) => ({ id, title: `Banner ${id}`, titleAr: null, imageUrl: `/banner-${id}.jpg`, imageUrlPortrait: `/banner-${id}-portrait.jpg`, imageUrlLandscape: `/banner-${id}-wide.jpg`, productId: id, sortOrder: id - 1, active: true, createdAt: stamp, updatedAt: stamp }));

describe('HomepageBannerCarousel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.scrollNext.mockReset();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false })) });
  });
  afterEach(() => vi.useRealTimers());

  it('does not autoplay until the second full-resolution image has loaded', () => {
    const { container } = render(<HomepageBannerCarousel banners={banners} locale="fr" />);
    const fullImages = container.querySelectorAll('.home-banner-picture > picture:last-child img');
    fireEvent.load(fullImages[0]!);
    vi.advanceTimersByTime(10_000);
    expect(mocks.scrollNext).not.toHaveBeenCalled();
    fireEvent.load(fullImages[1]!);
    vi.advanceTimersByTime(5_000);
    expect(mocks.scrollNext).toHaveBeenCalledTimes(1);
  });

  it('keeps autoplay disabled for reduced-motion users', () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    const { container } = render(<HomepageBannerCarousel banners={banners} locale="fr" />);
    container.querySelectorAll('.home-banner-picture > picture:last-child img').forEach((image) => fireEvent.load(image));
    vi.advanceTimersByTime(10_000);
    expect(mocks.scrollNext).not.toHaveBeenCalled();
  });

  it('keeps the mobile hero stable while retaining the swipeable carousel', () => {
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      matches: query === '(max-width: 620px)',
    } as MediaQueryList));
    const { container } = render(<HomepageBannerCarousel banners={banners} locale="fr" />);
    container.querySelectorAll('.home-banner-picture > picture:last-child img').forEach((image) => fireEvent.load(image));

    vi.advanceTimersByTime(15_000);

    expect(container.querySelector('.home-banner-viewport')).toBeInTheDocument();
    expect(mocks.scrollNext).not.toHaveBeenCalled();
  });

  it('retains autoplay when matchMedia is unavailable', () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: undefined });
    const { container } = render(<HomepageBannerCarousel banners={banners} locale="fr" />);
    container.querySelectorAll('.home-banner-picture > picture:last-child img').forEach((image) => fireEvent.load(image));

    vi.advanceTimersByTime(5_000);

    expect(mocks.scrollNext).toHaveBeenCalledTimes(1);
  });

  it('reveals an image that completed before the hydration effect attached', () => {
    const complete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete');
    const naturalWidth = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'naturalWidth');
    Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => true });
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 1200 });
    const { container } = render(<HomepageBannerCarousel banners={banners} locale="fr" />);
    expect(container.querySelectorAll('.home-banner-picture.is-ready')).toHaveLength(2);
    if (complete) Object.defineProperty(HTMLImageElement.prototype, 'complete', complete);
    if (naturalWidth) Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', naturalWidth);
  });
});
