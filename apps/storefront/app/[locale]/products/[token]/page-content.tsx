import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound, permanentRedirect } from 'next/navigation';
import { Fragment, Suspense } from 'react';
import { ZodError } from 'zod';

import { PageShell } from '@/components/page-shell';
import { ProductActions } from '@/components/product-actions';
import { ProductMedia } from '@/components/product-media';
import { ProductTelemetry } from '@/components/product-telemetry';
import { ProductTrustSignal } from '@/components/product-trust-signal';
import { SimilarProducts } from '@/components/similar-products';
import { StorefrontImage } from '@/components/storefront-image';
import { SimilarProductsSkeleton } from '@/components/storefront-skeletons';
import { StructuredData } from '@/components/structured-data';
import { isLocale, type Locale } from '@/i18n/config';
import { buildProductCategoryBreadcrumbs } from '@/lib/product-breadcrumbs';
import { isDisplayableProductImageUrl } from '@/lib/product-images';
import {
  formatProductPrice,
  getLocalizedProductCopy,
  hasProductDiscount,
  parseProductPrice,
} from '@/lib/product-presentation';
import { buildProductStructuredData, getProductPath } from '@/lib/product-seo';
import { captureProductPageException } from '@/lib/sentry';
import {
  fetchStorefrontProductPromo,
  getStorefrontCatalogMeta,
  getStorefrontProductDetail,
  getStorefrontSettings,
} from '@/lib/storefront-api';
import { isStorefrontUpstreamError } from '@/lib/storefront-upstream';
import { defaultStorefrontSettingsResponse } from '@bric/storefront-core/contracts';

export type ProductPageProps = {
  params: Promise<{ locale: string; token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function resolveProductPageParams(params: ProductPageProps['params']) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  return { locale, token };
}

async function ProductUnavailable({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'ProductDetail' });
  return (
    <PageShell locale={locale}>
      <section className="product-state" aria-labelledby="product-unavailable-title">
        <span className="product-state-icon" aria-hidden="true">
          !
        </span>
        <p className="eyebrow">{t('unavailableEyebrow')}</p>
        <h1 id="product-unavailable-title">{t('unavailableTitle')}</h1>
        <p>{t('unavailableDescription')}</p>
        <a href={`/${locale}/products`} className="button button-primary">
          {t('backToProducts')}
        </a>
      </section>
    </PageShell>
  );
}

export async function ProductPageContent({ params, searchParams }: ProductPageProps) {
  const query = (await searchParams) ?? {};
  const rawPromo = Array.isArray(query.promo) ? query.promo[0] : query.promo;
  const [{ locale, token }, requestHeaders] = await Promise.all([
    resolveProductPageParams(params),
    headers(),
  ]);
  const productPromise = getStorefrontProductDetail(token);
  const translationsPromise = getTranslations({ locale, namespace: 'ProductDetail' });
  const settingsPromise = getStorefrontSettings().catch(() => defaultStorefrontSettingsResponse);
  const categoryMetaPromise = getStorefrontCatalogMeta()
    .then((meta) => meta.categories)
    .catch(() => []);
  let response;
  try {
    response = await productPromise;
  } catch (error) {
    if (error instanceof ZodError) notFound();
    if (isStorefrontUpstreamError(error) || error instanceof Error) {
      captureProductPageException(error, {
        locale,
        requestedToken: token,
        operation: 'product-detail-read',
      });
      return ProductUnavailable({ locale });
    }
    throw error;
  }

  if (!response) notFound();
  if (response.resolution.requestedToken !== response.resolution.canonicalToken) {
    const redirectParams = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) {
      for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
        redirectParams.append(name, item);
      }
    }
    const querySuffix = redirectParams.size ? `?${redirectParams}` : '';
    permanentRedirect(
      `${getProductPath(locale, response.resolution.canonicalToken)}${querySuffix}` as Route,
    );
  }

  const product = response.item;
  const [t, contact, categoryMeta] = await Promise.all([
    translationsPromise,
    settingsPromise,
    product.category ? categoryMetaPromise : Promise.resolve([]),
  ]);
  const copy = getLocalizedProductCopy(product, locale);
  const media = product.media.filter((item) => isDisplayableProductImageUrl(item.url));
  const imageUrl = media[0]?.url ?? null;
  const brandImageUrl =
    product.brand?.image && isDisplayableProductImageUrl(product.brand.image)
      ? product.brand.image
      : null;
  const promo = rawPromo
    ? ((await fetchStorefrontProductPromo(product.id, rawPromo).catch(() => null))?.promo ?? null)
    : null;
  const price = promo?.promoPrice ?? parseProductPrice(product.price);
  const categoryBreadcrumbs = buildProductCategoryBreadcrumbs(
    product.category,
    categoryMeta,
    locale,
  );
  const analytics = {
    categoryId: product.category?.id ?? null,
    categorySlug: product.category?.slug ?? null,
    brandId: product.brand?.id ?? null,
    brandSlug: product.brand?.slug ?? null,
  };

  return (
    <PageShell locale={locale} contactSettings={contact}>
      <StructuredData
        value={buildProductStructuredData(product, locale, categoryBreadcrumbs)}
        nonce={requestHeaders.get('x-nonce') ?? undefined}
      />
      <ProductTelemetry
        locale={locale}
        productId={product.id}
        productSlug={product.canonicalToken}
        value={price}
        {...analytics}
      />

      <nav className="breadcrumbs" aria-label={t('breadcrumbs')}>
        <a href={`/${locale}`}>{t('home')}</a>
        <span aria-hidden="true">/</span>
        <a href={`/${locale}/products`}>{t('products')}</a>
        <span aria-hidden="true">/</span>
        {categoryBreadcrumbs.map((category) => (
          <Fragment key={category.id}>
            <a href={category.href}>{category.label}</a>
            <span aria-hidden="true">/</span>
          </Fragment>
        ))}
        <span aria-current="page">{copy.title}</span>
      </nav>

      <article className="product-detail">
        <ProductMedia
          items={media}
          productName={copy.title}
          analytics={{
            locale,
            productId: product.id,
            productSlug: product.canonicalToken,
            ...analytics,
          }}
          labels={{
            gallery: t('gallery'),
            image: t('image'),
            empty: t('noImage'),
            zoom: t('zoomImage'),
            closeZoom: t('closeZoom'),
            previousImage: t('previousImage'),
            nextImage: t('nextImage'),
            loadError: t('imageLoadError'),
          }}
        />

        <div className="product-summary">
          <div className="product-identity">
            {product.brand ? (
              <div
                className={`product-brand ${brandImageUrl ? 'product-brand-logo' : 'product-brand-fallback'}`}
                title={product.brand.name}
              >
                {brandImageUrl ? (
                  <StorefrontImage
                    src={brandImageUrl}
                    alt={product.brand.name}
                    width={144}
                    height={52}
                    sizes="144px"
                    quality={75}
                  />
                ) : (
                  product.brand.name
                )}
              </div>
            ) : null}
            {copy.categoryName ? (
              <span className="product-category">{copy.categoryName}</span>
            ) : null}
          </div>
          <h1>{copy.title}</h1>
          {product.sku ? <p className="product-sku">{t('sku', { sku: product.sku })}</p> : null}

          <div className="product-purchase-summary">
            <div className="product-price-block" aria-label={t('price')}>
              <strong className="product-current-price">
                {formatProductPrice(String(price), locale)}
              </strong>
              {promo || (hasProductDiscount(product) && product.oldPrice) ? (
                <del className="product-compare-price">
                  {formatProductPrice(
                    promo ? String(promo.originalPrice) : product.oldPrice!,
                    locale,
                  )}
                </del>
              ) : null}
            </div>

            <p
              className={
                product.availability.inStock
                  ? 'availability availability-in'
                  : 'availability availability-out'
              }
            >
              <span aria-hidden="true" />
              {product.availability.inStock ? t('inStock') : t('outOfStock')}
            </p>
          </div>

          {rawPromo && !promo ? <p role="status">{t('promoUnavailable')}</p> : null}
          <ProductActions
            locale={locale}
            available={product.availability.inStock}
            item={{
              productId: product.id,
              token: product.canonicalToken,
              title: copy.title,
              imageUrl,
              unitPrice: price,
              ...(promo ? { promoCode: promo.code } : {}),
              availabilityStatus: product.availability.status,
            }}
            analytics={analytics}
            labels={{
              quantity: t('quantity'),
              decrease: t('decrease'),
              increase: t('increase'),
              addToCart: t('addToCart'),
              buyNow: t('buyNow'),
              added: t('addedToCart'),
              unavailable: t('unavailableAction'),
            }}
            support={{
              contact,
              labels: {
                title: t('supportTitle'),
                description: t('supportDescription'),
                call: t('supportCall'),
              },
            }}
          />

          <ul className="product-trust" aria-label={t('trustTitle')}>
            <ProductTrustSignal icon="confirmation">{t('trustConfirmation')}</ProductTrustSignal>
            <ProductTrustSignal icon="payment">{t('trustPayment')}</ProductTrustSignal>
            <ProductTrustSignal icon="delivery">{t('trustDelivery')}</ProductTrustSignal>
          </ul>
        </div>
      </article>

      {copy.description ? (
        <section className="product-description" aria-labelledby="product-description-title">
          <p className="eyebrow">{t('detailsEyebrow')}</p>
          <h2 id="product-description-title">{t('detailsTitle')}</h2>
          <p>{copy.description}</p>
        </section>
      ) : null}

      <Suspense fallback={<SimilarProductsSkeleton />}>
        <SimilarProducts
          locale={locale}
          currentProductId={product.id}
          categoryId={product.category?.id ?? null}
          brandId={product.brand?.id ?? null}
        />
      </Suspense>
    </PageShell>
  );
}
