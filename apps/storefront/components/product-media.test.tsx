import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
const embla = vi.hoisted(() => {
  const callbacks = new Map<string, () => void>();
  let selectedIndex = 0;
  return {
    callbacks,
    reset: () => {
      callbacks.clear();
      selectedIndex = 0;
    },
    api: {
      off: vi.fn((name: string) => callbacks.delete(name)),
      on: vi.fn((name: string, callback: () => void) => {
        callbacks.set(name, callback);
      }),
      scrollTo: vi.fn((index: number) => {
        selectedIndex = index;
        callbacks.get('select')?.();
      }),
      selectedScrollSnap: vi.fn(() => selectedIndex),
    },
  };
});

vi.mock('embla-carousel-react', () => ({
  default: () => [vi.fn(), embla.api],
}));

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
vi.mock('@/lib/haptics', () => ({
  prepareHaptics: haptics.prepare,
  triggerHaptic: haptics.trigger,
}));

vi.mock('next/image', () => ({
  default: (rawProps: Record<string, unknown>) => {
    const props: Record<string, unknown> = {
      ...rawProps,
      'data-fill': rawProps.fill ? 'true' : undefined,
      'data-preload': rawProps.preload ? 'true' : undefined,
    };
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
    embla.reset();
    embla.api.off.mockClear();
    embla.api.on.mockClear();
    embla.api.scrollTo.mockClear();
    embla.api.selectedScrollSnap.mockClear();
  });

  afterEach(() => cleanup());

  it('does not initialize a lightbox after navigating away during its lazy import', async () => {
    const { unmount } = render(
      <ProductMedia items={items} productName="Desk Lamp" analytics={analytics} labels={labels} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: labels.zoom }));
      unmount();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(lightboxMock.init).not.toHaveBeenCalled();
    expect(lightboxMock.loadAndOpen).not.toHaveBeenCalled();
  });

  it('uses loaded intrinsic dimensions when catalog metadata is absent and limits zoom to native resolution', async () => {
    const { container } = render(
      <ProductMedia
        items={[{ ...items[0]!, width: null, height: null }]}
        productName="Desk Lamp"
        analytics={analytics}
        labels={labels}
      />,
    );
    const image = container.querySelector('img')!;
    Object.defineProperties(image, { naturalWidth: { value: 900 }, naturalHeight: { value: 600 } });
    fireEvent.load(image);
    fireEvent.click(screen.getByRole('link', { name: labels.zoom }));
    await waitFor(() => expect(lightboxMock.loadAndOpen).toHaveBeenCalled());
    expect(lightboxMock.options).toMatchObject({
      dataSource: [{ width: 900, height: 600 }],
      secondaryZoomLevel: 1,
      maxZoomLevel: 1,
    });
  });

  it('exposes accessible gallery controls and changes the active image', () => {
    render(
      <ProductMedia items={items} productName="Desk Lamp" analytics={analytics} labels={labels} />,
    );

    const hero = screen.getByRole('img', { name: 'Desk Lamp — Photo 1' });
    expect(hero).toHaveAttribute('src', '/one.jpg');
    expect(hero).toHaveAttribute('loading', 'eager');
    expect(hero).toHaveAttribute('data-preload', 'true');
    expect(document.querySelector('img[src="/two.jpg"]')).toHaveAttribute('loading', 'lazy');
    expect(document.querySelector('img[src="/two.jpg"]')).not.toHaveAttribute('data-preload');
    expect(screen.getByRole('button', { name: 'Photo 1' }).querySelector('img')).toHaveAttribute(
      'loading',
      'eager',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Photo 2' }));
    expect(embla.api.scrollTo).toHaveBeenCalledWith(1);
    expect(screen.getByRole('img', { name: 'Desk Lamp — Photo 2' })).toHaveAttribute(
      'src',
      '/two.jpg',
    );
    expect(screen.getByRole('button', { name: 'Photo 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(haptics.prepare).toHaveBeenCalledOnce();
    expect(haptics.trigger).toHaveBeenCalledWith('control');
  });

  it('reserves the media stage and describes the empty state', () => {
    render(
      <ProductMedia items={[]} productName="Desk Lamp" analytics={analytics} labels={labels} />,
    );
    expect(screen.getByRole('img', { name: labels.empty })).toBeInTheDocument();
  });

  it('uses fill-mode containment when upstream dimensions are missing or inaccurate', () => {
    render(
      <ProductMedia
        items={[{ ...items[0], width: null, height: null }]}
        productName="Desk Lamp"
        analytics={analytics}
        labels={labels}
      />,
    );
    const hero = screen.getByRole('img', { name: 'Desk Lamp — Photo 1' });
    expect(hero).toHaveAttribute('data-fill', 'true');
    expect(hero).not.toHaveAttribute('width');
    expect(hero).not.toHaveAttribute('height');
  });

  it('keeps an image-link fallback and lazily opens the selected PhotoSwipe slide', async () => {
    render(
      <ProductMedia items={items} productName="Desk Lamp" analytics={analytics} labels={labels} />,
    );
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
    expect(trackProductEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'view_item_media',
        productId: 12,
        metadata: { mediaAction: 'open', mediaIndex: 1, mediaCount: 2 },
      }),
    );
    expect(haptics.trigger).toHaveBeenCalledWith('surface');
  });

  it('destroys the lightbox when the interaction island unmounts', async () => {
    const view = render(
      <ProductMedia items={items} productName="Desk Lamp" analytics={analytics} labels={labels} />,
    );
    fireEvent.click(screen.getByRole('link', { name: labels.zoom }));
    await waitFor(() => expect(lightboxMock.init).toHaveBeenCalledOnce());

    view.unmount();
    expect(lightboxMock.destroy).toHaveBeenCalledOnce();
  });
});
