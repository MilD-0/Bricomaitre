'use client';

import AutoScroll from 'embla-carousel-auto-scroll';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CatalogCard, type CatalogProduct } from '@/components/catalog-card';
import { StorefrontImage } from '@/components/storefront-image';
import type { Locale } from '@/i18n/config';
import { getBrandPath, getCategoryPath } from '@/lib/taxonomy-routes';
import type { StorefrontHomepageResponse } from '@bric/storefront-core/contracts';

type Product = CatalogProduct;
type Category = StorefrontHomepageResponse['categories'][number];
type Brand = StorefrontHomepageResponse['brands'][number];
const touchCarouselOptions = { align: 'start' as const, dragFree: true };

function Controls({
  api,
  locale,
  label,
}: {
  api: ReturnType<typeof useEmblaCarousel>[1];
  locale: Locale;
  label: string;
}) {
  const [canScrollPrevious, setCanScrollPrevious] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  useEffect(() => {
    if (!api) return;
    const update = () => {
      const viewport = api.rootNode();
      const hasOverflow = viewport.scrollWidth > viewport.clientWidth + 1;
      setCanScrollPrevious(hasOverflow && api.canScrollPrev());
      setCanScrollNext(hasOverflow && api.canScrollNext());
    };
    update();
    api.on('select', update);
    api.on('reInit', update);
    return () => {
      api.off('select', update);
      api.off('reInit', update);
    };
  }, [api]);

  if (!canScrollPrevious && !canScrollNext) return null;

  return (
    <div className="home-carousel-controls" aria-label={label}>
      <button
        type="button"
        onClick={() => api?.scrollPrev()}
        disabled={!canScrollPrevious}
        aria-label={locale === 'ar' ? 'السابق' : 'Précédent'}
      >
        {locale === 'ar' ? <ChevronRight /> : <ChevronLeft />}
      </button>
      <button
        type="button"
        onClick={() => api?.scrollNext()}
        disabled={!canScrollNext}
        aria-label={locale === 'ar' ? 'التالي' : 'Suivant'}
      >
        {locale === 'ar' ? <ChevronLeft /> : <ChevronRight />}
      </button>
    </div>
  );
}

export function HomepageCategoryCarousel({
  categories,
  locale,
}: {
  categories: Category[];
  locale: Locale;
}) {
  const [ref, api] = useEmblaCarousel({
    ...touchCarouselOptions,
    direction: locale === 'ar' ? 'rtl' : 'ltr',
  });
  return (
    <div className="home-carousel-wrap">
      <Controls
        api={api}
        locale={locale}
        label={locale === 'ar' ? 'أزرار الفئات' : 'Contrôles des catégories'}
      />
      <div className="home-category-carousel" ref={ref}>
        <div>
          {categories.map((category) => (
            <a key={category.id} href={getCategoryPath(locale, category)}>
              <span>
                {category.image ? (
                  <StorefrontImage
                    src={category.image}
                    alt=""
                    width={220}
                    height={170}
                    sizes="180px"
                    quality={60}
                    fetchPriority="low"
                  />
                ) : (
                  <span className="catalog-card-placeholder" aria-hidden="true">
                    BRICO
                  </span>
                )}
              </span>
              <strong>
                {locale === 'ar' && category.nameAr ? category.nameAr : category.name}
              </strong>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HomepageProductCarousel({
  products,
  locale,
  brands,
  categories,
  featuredGroupId,
  eagerImages = false,
}: {
  products: Product[];
  locale: Locale;
  brands: Brand[];
  categories: Category[];
  featuredGroupId?: number;
  eagerImages?: boolean;
}) {
  const [ref, api] = useEmblaCarousel({
    ...touchCarouselOptions,
    direction: locale === 'ar' ? 'rtl' : 'ltr',
  });
  const [loadedProducts, setLoadedProducts] = useState(products);
  const [nextPage, setNextPage] = useState(2);
  const [total, setTotal] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingRef = useRef(false);
  const initialProductIds = useMemo(
    () => products.map((product) => product.id).join(','),
    [products],
  );

  useEffect(() => {
    queueMicrotask(() => {
      setLoadedProducts(products);
      setNextPage(2);
      setTotal(null);
      setLoadingMore(false);
    });
    loadingRef.current = false;
  }, [featuredGroupId, initialProductIds, products]);

  const loadNextPage = useCallback(async () => {
    if (
      !featuredGroupId ||
      loadingRef.current ||
      (total !== null && loadedProducts.length >= total)
    )
      return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const response = await fetch(
        `/api/homepage/groups/${featuredGroupId}?page=${nextPage}&limit=12`,
        { headers: { accept: 'application/json' } },
      );
      if (!response.ok) return;
      const payload = (await response.json()) as { items?: Product[]; total?: number };
      if (!Array.isArray(payload.items)) return;
      const nextItems = payload.items;
      setLoadedProducts((current) => {
        const byId = new Map(current.map((product) => [product.id, product]));
        nextItems.forEach((product) => byId.set(product.id, product));
        return [...byId.values()];
      });
      setTotal(typeof payload.total === 'number' ? payload.total : null);
      setNextPage((current) => current + 1);
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [featuredGroupId, loadedProducts.length, nextPage, total]);

  useEffect(() => {
    if (!api || !featuredGroupId) return;
    const loadWhenNearEnd = () => {
      if (api.selectedScrollSnap() >= Math.max(0, api.scrollSnapList().length - 2))
        void loadNextPage();
    };
    api.on('select', loadWhenNearEnd);
    api.on('reInit', loadWhenNearEnd);
    return () => {
      api.off('select', loadWhenNearEnd);
      api.off('reInit', loadWhenNearEnd);
    };
  }, [api, featuredGroupId, loadNextPage]);

  const brandById = new Map(brands.map((item) => [item.id, item.name]));
  const categoryById = new Map(
    categories.map((item) => [item.id, locale === 'ar' && item.nameAr ? item.nameAr : item.name]),
  );
  const labels =
    locale === 'ar'
      ? {
          inStock: 'متوفر',
          outOfStock: 'غير متوفر',
          priceOnRequest: 'السعر عند الطلب',
          viewProduct: 'عرض',
        }
      : {
          inStock: 'En stock',
          outOfStock: 'Indisponible',
          priceOnRequest: 'Prix sur demande',
          viewProduct: 'Voir',
        };
  return (
    <div className="home-carousel-wrap">
      <Controls
        api={api}
        locale={locale}
        label={locale === 'ar' ? 'أزرار المنتجات' : 'Contrôles des produits'}
      />
      <div className="home-product-carousel" ref={ref}>
        <div>
          {loadedProducts.map((product, index) => (
            <div key={product.id}>
              <CatalogCard
                product={product}
                locale={locale}
                position={index + 1}
                eagerImage={eagerImages && index < 4}
                brandName={product.brandId ? brandById.get(product.brandId) : null}
                categoryName={product.categoryId ? categoryById.get(product.categoryId) : null}
                labels={labels}
              />
            </div>
          ))}
        </div>
      </div>
      {loadingMore ? (
        <span className="home-carousel-loading" aria-live="polite">
          {locale === 'ar' ? 'جار التحميل…' : 'Chargement…'}
        </span>
      ) : null}
    </div>
  );
}

export function HomepageBrandCarousel({ brands, locale }: { brands: Brand[]; locale: Locale }) {
  const displayedBrands = useMemo(
    () => [...brands].sort((a, b) => Number(b.featured) - Number(a.featured)).slice(0, 24),
    [brands],
  );
  const [ref, api] = useEmblaCarousel(
    { loop: true, dragFree: true, watchDrag: false, direction: locale === 'ar' ? 'rtl' : 'ltr' },
    [
      AutoScroll({
        playOnInit: false,
        startDelay: 0,
        speed: 1.25,
        direction: locale === 'ar' ? 'backward' : 'forward',
        stopOnFocusIn: false,
        stopOnInteraction: false,
        stopOnMouseEnter: false,
      }),
    ],
  );
  useEffect(() => {
    if (!api) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const synchronizeMotion = () => {
      const autoScroll = api.plugins().autoScroll;
      if (preference.matches) autoScroll.stop();
      else autoScroll.play();
    };
    synchronizeMotion();
    preference.addEventListener('change', synchronizeMotion);
    return () => {
      preference.removeEventListener('change', synchronizeMotion);
      api.plugins().autoScroll.stop();
    };
  }, [api]);
  if (brands.length === 0) return null;
  // Embla can only honor `loop` when the slides are wide enough to cover its
  // loop points. Keep a generous minimum for wide desktop displays instead of
  // allowing the plugin to silently fall back to a finite, one-step track.
  const repeats = Math.max(1, Math.ceil(24 / displayedBrands.length));
  const loopBrands = Array.from({ length: repeats }, () => displayedBrands).flat();
  return (
    <div className="home-brand-carousel" ref={ref}>
      <div>
        {loopBrands.map((brand, index) => {
          const repeatedCopy = index >= displayedBrands.length;
          return (
            <a
              key={`${brand.id}-${index}`}
              href={getBrandPath(locale, brand)}
              aria-label={brand.name}
              aria-hidden={repeatedCopy || undefined}
              tabIndex={repeatedCopy ? -1 : undefined}
            >
              {brand.image ? (
                <StorefrontImage
                  src={brand.image}
                  alt={brand.name}
                  width={190}
                  height={100}
                  sizes="150px"
                  quality={60}
                  fetchPriority="low"
                />
              ) : (
                <strong className="home-brand-name">{brand.name}</strong>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}
