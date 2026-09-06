'use client';

import useEmblaCarousel from 'embla-carousel-react';
import { lazy, Suspense, type MouseEvent, useCallback, useEffect, useRef, useState } from 'react';

import { StorefrontImage } from '@/components/storefront-image';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/i18n/config';
import { trackProductEvent } from '@/lib/analytics';
import { prepareHaptics, triggerHaptic } from '@/lib/haptics';

type ProductMediaItem = {
  url: string;
  position: number;
  width: number | null;
  height: number | null;
  blurDataUrl: string | null;
};

type ProductLightbox = InstanceType<(typeof import('photoswipe/lightbox'))['default']>;

const ProductLightboxControls = lazy(() =>
  import('./product-lightbox-controls').then((module) => ({
    default: module.ProductLightboxControls,
  })),
);

type ProductMediaProps = {
  items: ProductMediaItem[];
  productName: string;
  analytics: {
    locale: Locale;
    productId: number | null;
    productSlug: string | null;
    categoryId: number | null;
    categorySlug: string | null;
    brandId: number | null;
    brandSlug: string | null;
  };
  labels: {
    gallery: string;
    image: string;
    empty: string;
    zoom: string;
    closeZoom: string;
    previousImage: string;
    nextImage: string;
    loadError: string;
  };
};

function ImagePlaceholder({ label }: { label: string }) {
  return (
    <div className="product-image-placeholder" role="img" aria-label={label}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M13 11h38a5 5 0 0 1 5 5v32a5 5 0 0 1-5 5H13a5 5 0 0 1-5-5V16a5 5 0 0 1 5-5Z" />
        <circle cx="23" cy="24" r="5" />
        <path d="m10 45 13-12 9 8 7-6 15 14" />
      </svg>
      <span>{label}</span>
    </div>
  );
}

export function ProductMedia({ items, productName, analytics, labels }: ProductMediaProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [galleryRef, galleryApi] = useEmblaCarousel({
    align: 'start',
    containScroll: 'trimSnaps',
    direction: analytics.locale === 'ar' ? 'rtl' : 'ltr',
    dragFree: false,
    loop: false,
  });
  const [lightboxElement, setLightboxElement] = useState<HTMLElement | null>(null);
  const activeIndexRef = useRef(0);
  const imageSizes = useRef(new Map<string, { width: number; height: number }>());
  const lightboxRef = useRef<ProductLightbox | null>(null);
  const lightboxPromiseRef = useRef<Promise<ProductLightbox> | null>(null);
  const mountedRef = useRef(true);
  const openingRef = useRef(false);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    mountedRef.current = true;
    void prepareHaptics();
    return () => {
      mountedRef.current = false;
      lightboxRef.current?.destroy();
      lightboxRef.current = null;
      lightboxPromiseRef.current = null;
    };
  }, []);

  const trackMedia = useCallback(
    (action: 'open' | 'navigate', index: number) => {
      void trackProductEvent({
        eventName: 'view_item_media',
        ...analytics,
        metadata: {
          mediaAction: action,
          mediaIndex: index,
          mediaCount: items.length,
        },
      });
    },
    [analytics, items.length],
  );

  useEffect(() => {
    if (!galleryApi) return;
    const syncSelection = () => {
      const nextIndex = galleryApi.selectedScrollSnap();
      if (nextIndex === activeIndexRef.current) return;
      activeIndexRef.current = nextIndex;
      setActiveIndex(nextIndex);
      trackMedia('navigate', nextIndex);
    };
    syncSelection();
    galleryApi.on('select', syncSelection);
    galleryApi.on('reInit', syncSelection);
    return () => {
      galleryApi.off('select', syncSelection);
      galleryApi.off('reInit', syncSelection);
    };
  }, [galleryApi, trackMedia]);

  async function getLightbox() {
    if (lightboxRef.current) return lightboxRef.current;
    if (lightboxPromiseRef.current) return lightboxPromiseRef.current;

    lightboxPromiseRef.current = import('photoswipe/lightbox').then(
      ({ default: PhotoSwipeLightbox }) => {
        const lightbox = new PhotoSwipeLightbox({
          dataSource: items.map((item, index) => ({
            src: item.url,
            width: imageSizes.current.get(item.url)?.width ?? item.width ?? 1600,
            height: imageSizes.current.get(item.url)?.height ?? item.height ?? 1600,
            alt: `${productName} — ${labels.image} ${index + 1}`,
          })),
          pswpModule: () => import('photoswipe'),
          mainClass: 'product-lightbox',
          bgOpacity: 0.98,
          showHideAnimationType: 'none',
          showAnimationDuration: 0,
          hideAnimationDuration: 0,
          wheelToZoom: true,
          secondaryZoomLevel: 1,
          maxZoomLevel: 1,
          preload: [1, 1],
          closeTitle: labels.closeZoom,
          zoomTitle: labels.zoom,
          arrowPrevTitle: labels.previousImage,
          arrowNextTitle: labels.nextImage,
          errorMsg: labels.loadError,
          close: false,
          zoom: false,
          arrowPrev: false,
          arrowNext: false,
          counter: false,
        });

        lightbox.on('loadComplete', ({ content }) => {
          const image = content.element;
          if (!(image instanceof HTMLImageElement) || !image.naturalWidth || !image.naturalHeight)
            return;
          const { naturalWidth: width, naturalHeight: height } = image;
          if (content.data.width === width && content.data.height === height) return;
          imageSizes.current.set(items[content.index]!.url, { width, height });
          content.data.width = width;
          content.data.height = height;
          lightbox.pswp?.refreshSlideContent(content.index);
        });

        lightbox.on('afterInit', () => {
          lightbox.pswp?.element?.setAttribute('aria-label', `${labels.zoom} — ${productName}`);
          if (mountedRef.current) setLightboxElement(lightbox.pswp?.element ?? null);
        });
        lightbox.on('destroy', () => {
          if (mountedRef.current) setLightboxElement(null);
        });
        lightbox.on('change', () => {
          const nextIndex = lightbox.pswp?.currIndex;
          if (typeof nextIndex !== 'number' || nextIndex === activeIndexRef.current) return;
          activeIndexRef.current = nextIndex;
          setActiveIndex(nextIndex);
          galleryApi?.scrollTo(nextIndex, true);
          trackMedia('navigate', nextIndex);
        });
        lightbox.init();
        lightboxRef.current = lightbox;
        return lightbox;
      },
    );

    return lightboxPromiseRef.current;
  }

  async function openZoom(event: MouseEvent<HTMLAnchorElement>, index: number) {
    event.preventDefault();
    const item = items[index];
    if (!item || openingRef.current) return;
    openingRef.current = true;

    try {
      const lightbox = await getLightbox();
      if (!mountedRef.current) return;
      const opened = lightbox.loadAndOpen(index, undefined, {
        x: event.clientX,
        y: event.clientY,
      });
      if (opened) {
        void triggerHaptic('surface');
        trackMedia('open', index);
      }
    } catch {
      window.location.assign(item.url);
    } finally {
      openingRef.current = false;
    }
  }

  return (
    <section className="product-media" aria-label={labels.gallery}>
      <div
        className="product-media-stage"
        ref={galleryRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={labels.gallery}
      >
        {items.length > 0 ? (
          <div className="product-media-track">
            {items.map((item, index) => (
              <div
                className="product-media-slide"
                key={`${item.url}-${item.position}`}
                role="group"
                aria-roledescription="slide"
                aria-label={`${index + 1} / ${items.length}`}
                aria-hidden={index === activeIndex ? undefined : 'true'}
              >
                <a
                  className="product-media-zoom-trigger"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={
                    index === activeIndex
                      ? labels.zoom
                      : `${labels.zoom} — ${labels.image} ${index + 1}`
                  }
                  tabIndex={index === activeIndex ? 0 : -1}
                  onClick={(event) => openZoom(event, index)}
                >
                  <StorefrontImage
                    src={item.url}
                    onLoad={(event) => {
                      const image = event.currentTarget;
                      if (image.naturalWidth && image.naturalHeight) {
                        imageSizes.current.set(item.url, {
                          width: item.width ?? image.naturalWidth,
                          height: item.height ?? image.naturalHeight,
                        });
                      }
                    }}
                    alt={`${productName} — ${labels.image} ${index + 1}`}
                    fill
                    sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1199px) 48vw, 560px"
                    preload={index === 0}
                    loading={index === 0 ? 'eager' : 'lazy'}
                    fetchPriority={index === 0 ? 'high' : 'auto'}
                    quality={75}
                    placeholder={item.blurDataUrl ? 'blur' : 'empty'}
                    blurDataURL={item.blurDataUrl ?? undefined}
                  />
                  <span className="product-media-zoom-label" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <circle cx="10.5" cy="10.5" r="6.5" />
                      <path d="m15.5 15.5 5 5M10.5 7.5v6M7.5 10.5h6" />
                    </svg>
                    <span className="product-media-zoom-text">{labels.zoom}</span>
                  </span>
                </a>
              </div>
            ))}
          </div>
        ) : (
          <ImagePlaceholder label={labels.empty} />
        )}
      </div>

      {items.length > 1 ? (
        <div className="product-media-thumbnails" role="group" aria-label={labels.gallery}>
          {items.map((item, index) => (
            <Button
              key={`${item.url}-${item.position}`}
              type="button"
              variant="ghost"
              className="product-media-thumbnail"
              aria-label={`${labels.image} ${index + 1}`}
              aria-pressed={activeIndex === index}
              onClick={() => {
                if (index === activeIndex) return;
                galleryApi?.scrollTo(index);
                void triggerHaptic('control');
              }}
            >
              <StorefrontImage
                src={item.url}
                alt=""
                fill
                sizes="72px"
                loading={index === 0 ? 'eager' : 'lazy'}
                quality={60}
              />
            </Button>
          ))}
        </div>
      ) : null}

      {lightboxElement ? (
        <Suspense fallback={null}>
          <ProductLightboxControls
            portalTarget={lightboxElement}
            index={activeIndex}
            count={items.length}
            direction={analytics.locale === 'ar' ? 'rtl' : 'ltr'}
            labels={labels}
            onClose={() => {
              void triggerHaptic('surface');
              lightboxRef.current?.pswp?.close();
            }}
            onZoom={() => {
              void triggerHaptic('surface');
              lightboxRef.current?.pswp?.toggleZoom();
            }}
            onPrevious={() => {
              void triggerHaptic('control');
              lightboxRef.current?.pswp?.prev();
            }}
            onNext={() => {
              void triggerHaptic('control');
              lightboxRef.current?.pswp?.next();
            }}
          />
        </Suspense>
      ) : null}
    </section>
  );
}
