import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductMedia } from './product-media';

const lightboxMock = vi.hoisted(() => ({
  callbacks: new Map<string, () => void>(),
  destroy: vi.fn(),
  init: vi.fn(),
  loadAndOpen: vi.fn((index: number) => {
    void index;
    return true;
  }),
  options: null as Record<string, unknown> | null,
}));
const trackProductEvent = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const haptics = vi.hoisted(() => ({ prepare: vi.fn(), trigger: vi.fn() }));

vi.mock('photoswipe/lightbox', () => ({
  default: class PhotoSwipeLightboxMock {
    pswp = {
      currIndex: 0,
      element: document.createElement('div'),
      close: vi.fn(),
      toggleZoom: vi.fn(),
      prev: vi.fn(),
      next: vi.fn(),
    };

    constructor(options: Record<string, unknown>) {
      lightboxMock.options = options;
    }

    on(name: string, callback: () => void) {
      lightboxMock.callbacks.set(name, callback);
    }

    init() {
      lightboxMock.init();
    }

    destroy() {
      lightboxMock.destroy();
    }

    loadAndOpen(index: number) {
      this.pswp.currIndex = index;
      lightboxMock.callbacks.get('afterInit')?.();
      return lightboxMock.loadAndOpen(index);
    }
  },
}));

vi.mock('@/lib/analytics', () => ({ trackProductEvent }));
vi.mock('@/lib/haptics', () => ({ prepareHaptics: haptics.prepare, triggerHaptic: haptics.trigger }));

vi.mock('next/image', () => ({
  default: (rawProps: Record<string, unknown>) => {
    const props: Record<string, unknown> = { ...rawProps, 'data-fill': rawProps.fill ? 'true' : undefined };
    delete props.fill;
    delete props.preload;
    delete props.quality;
    delete props.blurDataURL;
    return React.createElement('img', props);
  },
}));

const labels = {
  gallery: 'Photos du produit',
  image: 'Photo',
  empty: 'Photo bientôt disponible',
  zoom: 'Agrandir l’image',
  closeZoom: 'Fermer l’image agrandie',
  previousImage: 'Photo précédente',
  nextImage: 'Photo suivante',
  loadError: 'Impossible de charger cette image.',
};
const analytics = {
  locale: 'fr' as const,
  productId: 12,
  productSlug: 'desk-lamp',
  categoryId: 2,
  categorySlug: 'lighting',
  brandId: 4,
  brandSlug: 'bric-pro',
};
const items = [
  { url: '/one.jpg', position: 0, width: 900, height: 900, blurDataUrl: null },
  { url: '/two.jpg', position: 1, width: 900, height: 900, blurDataUrl: null },
];

describe('ProductMedia', () => {
  beforeEach(() => {
    lightboxMock.callbacks.clear();
    lightboxMock.destroy.mockClear();
    lightboxMock.init.mockClear();
    lightboxMock.loadAndOpen.mockClear();
    lightboxMock.options = null;
    trackProductEvent.mockClear();
    haptics.prepare.mockClear();
    haptics.trigger.mockClear();
  });

  afterEach(() => cleanup());

  it('exposes accessible gallery controls and changes the active image', () => {
    render(<ProductMedia items={items} productName="Desk Lamp" analytics={analytics} labels={labels} />);

    const hero = screen.getByRole('img', { name: 'Desk Lamp — Photo 1' });
    expect(hero).toHaveAttribute('src', '/one.jpg');
    expect(hero).toHaveAttribute('loading', 'eager');
    expect(screen.getByRole('button', { name: 'Photo 1' }).querySelector('img')).toHaveAttribute(
      'loading',
      'eager',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Photo 2' }));
    expect(screen.getByRole('img', { name: 'Desk Lamp — Photo 2' })).toHaveAttribute('src', '/two.jpg');
    expect(screen.getByRole('button', { name: 'Photo 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(haptics.prepare).toHaveBeenCalledOnce();
    expect(haptics.trigger).toHaveBeenCalledWith('control');
  });

  it('reserves the media stage and describes the empty state', () => {
    render(<ProductMedia items={[]} productName="Desk Lamp" analytics={analytics} labels={labels} />);
    expect(screen.getByRole('img', { name: labels.empty })).toBeInTheDocument();
  });

  it('uses fill-mode containment when upstream dimensions are missing or inaccurate', () => {
    render(<ProductMedia items={[{ ...items[0], width: null, height: null }]} productName="Desk Lamp" analytics={analytics} labels={labels} />);
    const hero = screen.getByRole('img', { name: 'Desk Lamp — Photo 1' });
    expect(hero).toHaveAttribute('data-fill', 'true');
    expect(hero).not.toHaveAttribute('width');
    expect(hero).not.toHaveAttribute('height');
  });

  it('keeps an image-link fallback and lazily opens the selected PhotoSwipe slide', async () => {
    render(<ProductMedia items={items} productName="Desk Lamp" analytics={analytics} labels={labels} />);
    fireEvent.click(screen.getByRole('button', { name: 'Photo 2' }));

    const zoomLink = screen.getByRole('link', { name: labels.zoom });
    expect(zoomLink).toHaveAttribute('href', '/two.jpg');
    expect(zoomLink).toHaveAttribute('target', '_blank');
    fireEvent.click(zoomLink);

    await waitFor(() => expect(lightboxMock.loadAndOpen).toHaveBeenCalledWith(1));
    expect(lightboxMock.init).toHaveBeenCalledOnce();
    expect(lightboxMock.options).toMatchObject({
      mainClass: 'product-lightbox',
      showHideAnimationType: 'none',
      wheelToZoom: true,
      close: false,
      zoom: false,
      arrowPrev: false,
      arrowNext: false,
      counter: false,
      closeTitle: labels.closeZoom,
      arrowPrevTitle: labels.previousImage,
      arrowNextTitle: labels.nextImage,
    });
    expect(trackProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventName: 'view_item_media',
      productId: 12,
      metadata: { mediaAction: 'open', mediaIndex: 1, mediaCount: 2 },
    }));
    expect(haptics.trigger).toHaveBeenCalledWith('surface');
  });

  it('destroys the lightbox when the interaction island unmounts', async () => {
    const view = render(<ProductMedia items={items} productName="Desk Lamp" analytics={analytics} labels={labels} />);
    fireEvent.click(screen.getByRole('link', { name: labels.zoom }));
    await waitFor(() => expect(lightboxMock.init).toHaveBeenCalledOnce());

    view.unmount();
    expect(lightboxMock.destroy).toHaveBeenCalledOnce();
  });

});
