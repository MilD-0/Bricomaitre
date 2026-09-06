'use client';

import useEmblaCarousel from 'embla-carousel-react';
import { getImageProps } from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { StorefrontHomepageResponse } from '@bric/storefront-core/contracts';

type Banner = StorefrontHomepageResponse['banners'][number];

function BannerImage({
  banner,
  priority,
  onReady,
  alt,
}: {
  banner: Banner;
  priority: boolean;
  onReady: () => void;
  alt: string;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const reportedReady = useRef(false);
  const landscape = banner.imageUrlLandscape || banner.imageUrl;
  const portrait = banner.imageUrlPortrait || banner.imageUrl;
  const markReady = useCallback(() => {
    if (reportedReady.current) return;
    reportedReady.current = true;
    onReady();
  }, [onReady]);
  const common = { alt, width: 1920, height: 720, quality: 75 };
  const landscapeSvg = landscape.toLowerCase().includes('.svg');
  const portraitSvg = portrait.toLowerCase().includes('.svg');
  const { props: landscapeProps } = getImageProps({
    ...common,
    src: landscape,
    sizes: '(max-width: 620px) 0px, 100vw',
    loading: priority ? 'eager' : 'lazy',
    fetchPriority: priority ? 'high' : 'low',
    unoptimized: landscapeSvg,
  });
  const { props: portraitProps } = getImageProps({
    ...common,
    src: portrait,
    width: 760,
    height: 920,
    sizes: '(max-width: 620px) 100vw, 0px',
    loading: priority ? 'eager' : 'lazy',
    fetchPriority: priority ? 'high' : 'low',
    unoptimized: portraitSvg,
  });
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) markReady();
  }, [markReady]);
  return (
    <>
      {priority ? (
        <>
          <link
            rel="preload"
            as="image"
            href={portraitProps.src}
            imageSrcSet={portraitProps.srcSet}
            imageSizes={portraitProps.sizes}
            media="(max-width: 620px)"
            fetchPriority="high"
          />
          <link
            rel="preload"
            as="image"
            href={landscapeProps.src}
            imageSrcSet={landscapeProps.srcSet}
            imageSizes={landscapeProps.sizes}
            media="not all and (max-width: 620px)"
            fetchPriority="high"
          />
        </>
      ) : null}
      <span className="home-banner-picture">
        <picture>
          <source
            media="(max-width: 620px)"
            srcSet={portraitProps.srcSet ?? portraitProps.src}
            sizes={portraitProps.sizes}
          />
          <img
            {...landscapeProps}
            alt={alt}
            ref={imageRef}
            onLoad={markReady}
            onError={markReady}
          />
        </picture>
      </span>
    </>
  );
}

export function HomepageBannerCarousel({
  banners,
  locale,
}: {
  banners: Banner[];
  locale: 'fr' | 'ar';
}) {
  const [viewportRef, api] = useEmblaCarousel({
    loop: banners.length > 1,
    direction: locale === 'ar' ? 'rtl' : 'ltr',
    duration: 28,
  });
  const [heroReady, setHeroReady] = useState(false);
  const [canAutoplay, setCanAutoplay] = useState(false);
  const markLoaded = useCallback((index: number) => {
    if (index === 0) setHeroReady(true);
    if (index === 1) setCanAutoplay(true);
  }, []);

  useEffect(() => {
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const compactViewport =
      typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 620px)').matches;
    if (!api || !canAutoplay || banners.length < 2 || reducedMotion || compactViewport) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') api.scrollNext();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [api, banners.length, canAutoplay]);

  if (banners.length === 0) return null;
  return (
    <section
      className="home-banner"
      aria-label={locale === 'ar' ? 'العروض الحالية' : 'Offres du moment'}
    >
      <div className="home-banner-viewport" dir={locale === 'ar' ? 'rtl' : 'ltr'} ref={viewportRef}>
        <div className="home-banner-track">
          {banners.map((banner, index) => {
            const label = locale === 'ar' && banner.titleAr ? banner.titleAr : banner.title;
            return (
              <div className="home-banner-slide" key={banner.id}>
                <a
                  href={
                    banner.productId
                      ? `/${locale}/products/${banner.productId}`
                      : `/${locale}/products`
                  }
                  aria-label={label}
                >
                  {index === 0 || heroReady ? (
                    <BannerImage
                      banner={banner}
                      alt={label}
                      priority={index === 0}
                      onReady={() => markLoaded(index)}
                    />
                  ) : (
                    <span className="home-banner-picture" />
                  )}
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
