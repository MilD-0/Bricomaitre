import type { StorefrontProductsResponse } from '@bric/storefront-core/contracts';

import { StorefrontImage } from '@/components/storefront-image';
import type { Locale } from '@/i18n/config';
import { isDisplayableProductImageUrl } from '@/lib/product-images';
import { formatProductPrice, parseProductPrice } from '@/lib/product-presentation';

export type CatalogProduct = StorefrontProductsResponse['items'][number];

export type CatalogCardLabels = {
  inStock: string;
  outOfStock: string;
  priceOnRequest: string;
  viewProduct: string;
};

export function getCatalogProductToken(product: CatalogProduct) {
  return product.slug || product.mongoId || String(product.id);
}

export function getCatalogProductTitle(product: CatalogProduct, locale: Locale) {
  return locale === 'ar' && product.titleAr?.trim() ? product.titleAr.trim() : product.title.trim();
}

export function CatalogCard({
  product,
  locale,
  position,
  brandName,
  categoryName,
  labels,
  eagerImage = position <= 3,
}: {
  product: CatalogProduct;
  locale: Locale;
  position: number;
  brandName?: string | null;
  categoryName?: string | null;
  labels: CatalogCardLabels;
  eagerImage?: boolean;
}) {
  const token = getCatalogProductToken(product);
  const title = getCatalogProductTitle(product, locale);
  const image = product.images.find((url) => isDisplayableProductImageUrl(url)) ?? null;
  const price = product.price ? parseProductPrice(product.price) : 0;
  const oldPrice = product.oldPrice ? parseProductPrice(product.oldPrice) : 0;
  const discount = price > 0 && oldPrice > price ? Math.round((1 - price / oldPrice) * 100) : 0;
  const firstViewportImage = eagerImage;

  return (
    <article className="catalog-card">
      <a
        href={`/${locale}/products/${encodeURIComponent(token)}`}
        className="catalog-card-link"
        data-catalog-product
        data-product-id={product.id}
        data-product-slug={token}
        data-category-id={product.categoryId ?? undefined}
        data-brand-id={product.brandId ?? undefined}
        data-position={position}
      >
        <div className="catalog-card-media">
          {image ? (
            <StorefrontImage
              src={image}
              alt=""
              width={420}
              height={420}
              sizes="(max-width: 520px) 46vw, (max-width: 900px) 30vw, 260px"
              loading={firstViewportImage ? 'eager' : 'lazy'}
              fetchPriority={firstViewportImage ? 'high' : 'auto'}
              quality={60}
            />
          ) : <span className="catalog-card-placeholder" aria-hidden="true">BRICO</span>}
          {discount > 0 ? <span className="catalog-discount">−{discount}%</span> : null}
          {!product.inStock ? <span className="catalog-unavailable-badge">{labels.outOfStock}</span> : null}
        </div>
        <div className="catalog-card-body">
          {brandName || categoryName ? <p>{brandName ?? categoryName}</p> : null}
          <h2>{title}</h2>
          <span className={product.inStock ? 'catalog-stock catalog-stock-in' : 'catalog-stock catalog-stock-out'}>
            <i aria-hidden="true" />
            {product.inStock ? labels.inStock : labels.outOfStock}
          </span>
          <div className="catalog-card-footer">
            <div className="catalog-card-price">
              {product.price ? <strong className="catalog-card-current-price">{formatProductPrice(product.price, locale)}</strong> : <strong className="catalog-card-price-request">{labels.priceOnRequest}</strong>}
              {discount > 0 && product.oldPrice ? <del className="catalog-card-compare-price">{formatProductPrice(product.oldPrice, locale)}</del> : null}
            </div>
            <span className="catalog-card-action">
              {labels.viewProduct}
              <span aria-hidden="true">{locale === 'ar' ? '←' : '→'}</span>
            </span>
          </div>
        </div>
      </a>
    </article>
  );
}
