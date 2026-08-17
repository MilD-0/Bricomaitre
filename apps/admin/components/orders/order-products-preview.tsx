'use client';

/* eslint-disable @next/next/no-img-element -- Operational order thumbnails can come from legacy arbitrary origins and are not page-critical media. */

import type { Dispatch, SetStateAction } from 'react';

import type { OrderProductSummary } from '../../lib/orders';
import { formatOrderProductLabel, getOrderProductHoverKey } from '../../lib/order-presentation';
import { Badge } from '../ui/badge';

const DEFAULT_STOREFRONT_BASE_URL = 'https://bricomaitre.com';

function getStorefrontProductHref(product: OrderProductSummary) {
  const token = product.slug ?? product.productId;
  if (!token) {
    return null;
  }

  const configuredBaseUrl = process.env.NEXT_PUBLIC_STOREFRONT_BASE_URL?.trim();
  const baseUrl = (configuredBaseUrl || DEFAULT_STOREFRONT_BASE_URL).replace(/\/+$/, '');
  return `${baseUrl}/products/${encodeURIComponent(String(token))}`;
}

export function OrderProductsPreview({
  orderId,
  products,
  emptyLabel,
  hoveredProductKey,
  onHoverChange,
  formatMoney,
  limit,
}: {
  orderId: number;
  products: OrderProductSummary[];
  emptyLabel: string;
  hoveredProductKey: string | null;
  onHoverChange: Dispatch<SetStateAction<string | null>>;
  formatMoney: (value: number) => string;
  limit?: number;
}) {
  if (products.length === 0) {
    return <span className="text-sm text-muted-foreground">{emptyLabel}</span>;
  }

  const visibleProducts = limit ? products.slice(0, limit) : products;

  return (
    <>
      {visibleProducts.map((product) => {
        const hoverKey = getOrderProductHoverKey(orderId, product);
        const previewVisible = hoveredProductKey === hoverKey && Boolean(product.thumbnailUrl);
        const storefrontHref = getStorefrontProductHref(product);
        const productLabel = formatOrderProductLabel(product, formatMoney);

        return (
          <div
            key={hoverKey}
            className="relative inline-flex"
            onMouseEnter={() => onHoverChange(hoverKey)}
            onMouseLeave={() => onHoverChange((current) => (current === hoverKey ? null : current))}
          >
            {storefrontHref ? (
              <a
                href={storefrontHref}
                target="_blank"
                rel="noreferrer"
                className="max-w-full truncate rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                onClick={(event) => event.stopPropagation()}
              >
                <Badge
                  variant="outline"
                  className="max-w-full truncate hover:bg-primary/10 hover:text-primary"
                >
                  {productLabel}
                </Badge>
              </a>
            ) : (
              <Badge variant="outline" className="max-w-full truncate">
                {productLabel}
              </Badge>
            )}
            {previewVisible ? (
              <div className="pointer-events-none absolute left-0 top-full z-10 mt-2 w-40 overflow-hidden rounded-2xl border border-border/70 bg-background shadow-lg">
                <img
                  src={product.thumbnailUrl ?? ''}
                  alt={`${product.title} thumbnail`}
                  className="aspect-square w-full object-cover"
                />
              </div>
            ) : null}
          </div>
        );
      })}
      {limit && products.length > limit ? (
        <Badge variant="outline">+{products.length - limit}</Badge>
      ) : null}
    </>
  );
}
