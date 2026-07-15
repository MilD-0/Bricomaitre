import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { HomepageBrandCarousel } from './homepage-carousels';

const mocks = vi.hoisted(() => ({ autoScroll: vi.fn(() => ({ name: 'autoScroll' })), embla: vi.fn(() => [vi.fn(), null]) }));
vi.mock('embla-carousel-auto-scroll', () => ({ default: mocks.autoScroll }));
vi.mock('embla-carousel-react', () => ({ default: mocks.embla }));
vi.mock('@/components/storefront-image', () => ({ StorefrontImage: (props: Record<string, unknown>) => React.createElement('img', props) }));

const stamp = '2026-07-01T00:00:00.000Z';
const brands = [{ id: 1, name: 'WADFOW', slug: 'wadfow', image: '/wadfow.png', featured: true, createdAt: stamp, updatedAt: stamp }];

describe('HomepageBrandCarousel', () => {
  it('uses Embla loop mode with uninterrupted auto-scroll', () => {
    const { container } = render(<HomepageBrandCarousel brands={brands} locale="fr" />);
    expect(mocks.embla).toHaveBeenCalledWith(expect.objectContaining({ loop: true, watchDrag: false }), [expect.objectContaining({ name: 'autoScroll' })]);
    expect(mocks.autoScroll).toHaveBeenCalledWith(expect.objectContaining({ playOnInit: true, startDelay: 0, stopOnFocusIn: false, stopOnInteraction: false, stopOnMouseEnter: false }));
    expect(container.querySelectorAll('.home-brand-carousel a')).toHaveLength(24);
  });
});
