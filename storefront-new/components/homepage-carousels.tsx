'use client';

import AutoScroll from 'embla-carousel-auto-scroll';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { StorefrontHomepageResponse } from '@bric/storefront-core/contracts';
import { CatalogCard } from '@/components/catalog-card';
import { StorefrontImage } from '@/components/storefront-image';
import type { Locale } from '@/i18n/config';

type Product = StorefrontHomepageResponse['topProducts'][number];
type Category = StorefrontHomepageResponse['categories'][number];
type Brand = StorefrontHomepageResponse['brands'][number];

function Controls({ api, locale, label }: { api: ReturnType<typeof useEmblaCarousel>[1]; locale: Locale; label: string }) {
  return <div className="home-carousel-controls" aria-label={label}><button type="button" onClick={() => api?.scrollPrev()} aria-label={locale === 'ar' ? 'السابق' : 'Précédent'}>{locale === 'ar' ? <ChevronRight /> : <ChevronLeft />}</button><button type="button" onClick={() => api?.scrollNext()} aria-label={locale === 'ar' ? 'التالي' : 'Suivant'}>{locale === 'ar' ? <ChevronLeft /> : <ChevronRight />}</button></div>;
}

export function HomepageCategoryCarousel({ categories, locale }: { categories: Category[]; locale: Locale }) {
  const [ref, api] = useEmblaCarousel({ align: 'start', dragFree: true, direction: locale === 'ar' ? 'rtl' : 'ltr' });
  return <div className="home-carousel-wrap"><Controls api={api} locale={locale} label={locale === 'ar' ? 'أزرار الفئات' : 'Contrôles des catégories'} /><div className="home-category-carousel" ref={ref}><div>{categories.map((category) => <a key={category.id} href={`/${locale}/products?category=${category.id}`}><span>{category.image ? <StorefrontImage src={category.image} alt="" width={220} height={170} sizes="180px" quality={60} /> : <span className="catalog-card-placeholder">BRICO</span>}</span><strong>{locale === 'ar' && category.nameAr ? category.nameAr : category.name}</strong></a>)}</div></div></div>;
}

export function HomepageProductCarousel({ products, locale, brands, categories }: { products: Product[]; locale: Locale; brands: Brand[]; categories: Category[] }) {
  const [ref, api] = useEmblaCarousel({ align: 'start', dragFree: true, direction: locale === 'ar' ? 'rtl' : 'ltr' });
  const brandById = new Map(brands.map((item) => [item.id, item.name])); const categoryById = new Map(categories.map((item) => [item.id, locale === 'ar' && item.nameAr ? item.nameAr : item.name]));
  const labels = locale === 'ar' ? { inStock: 'متوفر', outOfStock: 'غير متوفر', priceOnRequest: 'السعر عند الطلب', viewProduct: 'عرض' } : { inStock: 'En stock', outOfStock: 'Indisponible', priceOnRequest: 'Prix sur demande', viewProduct: 'Voir' };
  return <div className="home-carousel-wrap"><Controls api={api} locale={locale} label={locale === 'ar' ? 'أزرار المنتجات' : 'Contrôles des produits'} /><div className="home-product-carousel" ref={ref}><div>{products.map((product, index) => <div key={product.id}><CatalogCard product={product} locale={locale} position={index + 1} brandName={product.brandId ? brandById.get(product.brandId) : null} categoryName={product.categoryId ? categoryById.get(product.categoryId) : null} labels={labels} /></div>)}</div></div></div>;
}

export function HomepageBrandCarousel({ brands, locale }: { brands: Brand[]; locale: Locale }) {
  const [ref] = useEmblaCarousel(
    { loop: true, dragFree: true, watchDrag: false, direction: locale === 'ar' ? 'rtl' : 'ltr' },
    [AutoScroll({
      playOnInit: true,
      startDelay: 0,
      speed: 1.25,
      direction: locale === 'ar' ? 'backward' : 'forward',
      stopOnFocusIn: false,
      stopOnInteraction: false,
      stopOnMouseEnter: false,
    })],
  );
  if (brands.length === 0) return null;
  // Embla can only honor `loop` when the slides are wide enough to cover its
  // loop points. Keep a generous minimum for wide desktop displays instead of
  // allowing the plugin to silently fall back to a finite, one-step track.
  const repeats = Math.max(1, Math.ceil(24 / brands.length));
  const loopBrands = Array.from({ length: repeats }, () => brands).flat();
  return <div className="home-brand-carousel" ref={ref}><div>{loopBrands.map((brand, index) => <a key={`${brand.id}-${index}`} href={`/${locale}/products?brand=${brand.id}`} aria-label={brand.name}><StorefrontImage src={brand.image!} alt={brand.name} width={190} height={100} sizes="150px" quality={60} /></a>)}</div></div>;
}
