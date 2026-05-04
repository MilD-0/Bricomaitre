'use client';

import { useQuery } from '@tanstack/react-query';
import { Package, Search, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useDeferredValue } from 'react';

import { buildOrderProductSummaries, parseNumericAmount, type OrderRecord } from '../lib/orders';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';

export type ProductSearchItem = {
  id: number;
  title: string;
  slug?: string | null;
  price: number | string;
  images: string[];
  sku?: string | null;
  barcode?: string | null;
  mongoId?: string | null;
};

export type ProductSearchResponse = {
  items: ProductSearchItem[];
};

export type EditableOrderProduct = {
  rawValue: string;
  productId: number | null;
  slug?: string | null;
  title: string;
  unitPrice: number;
  thumbnailUrl: string | null;
  missing: boolean;
};

function findProductSummary(order: OrderRecord, rawValue: string) {
  const trimmed = rawValue.trim();
  const numericId = /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : null;

  return order.orderProducts.find((product) => product.rawValue === trimmed || (numericId !== null && product.productId === numericId)) ?? null;
}

export function buildEditableProducts(order: OrderRecord): EditableOrderProduct[] {
  return order.cartProducts.map((rawValue) => {
    const product = findProductSummary(order, rawValue);

    return {
      rawValue,
      productId: product?.productId ?? null,
      ...(product?.slug !== undefined ? { slug: product.slug } : {}),
      title: product?.title ?? rawValue,
      unitPrice: product?.unitPrice ?? 0,
      thumbnailUrl: product?.thumbnailUrl ?? null,
      missing: product?.missing ?? true,
    };
  });
}

export function summarizeEditableProducts(items: EditableOrderProduct[]) {
  return buildOrderProductSummaries(items.map((item) => item.rawValue), (rawValue) => {
    const product = items.find((entry) => entry.rawValue === rawValue.trim());

    if (!product) {
      return { missing: true };
    }

    return {
      productId: product.productId,
      ...(product.slug !== undefined ? { slug: product.slug } : {}),
      title: product.title,
      unitPrice: product.unitPrice,
      thumbnailUrl: product.thumbnailUrl,
      missing: product.missing,
    };
  });
}

export function areCartProductsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function ProductThumbnail({ src, alt }: { src: string | null; alt: string }) {
  return src ? (
    <img src={src} alt={alt} className="size-14 rounded-xl object-cover" />
  ) : (
    <div className="flex size-14 items-center justify-center rounded-xl bg-muted text-muted-foreground">
      <Package />
    </div>
  );
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T>;
}

function formatMoney(locale: string, value: number) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 2,
  }).format(value);
}

export function OrderProductsEditor({
  customerName,
  items,
  search,
  onSearchChange,
  onAddProduct,
  onIncreaseQuantity,
  onDecreaseQuantity,
  onRemoveProduct,
  footer,
}: {
  customerName: string;
  items: EditableOrderProduct[];
  search: string;
  onSearchChange: (value: string) => void;
  onAddProduct: (product: ProductSearchItem) => void;
  onIncreaseQuantity: (rawValue: string) => void;
  onDecreaseQuantity: (rawValue: string) => void;
  onRemoveProduct: (rawValue: string) => void;
  footer?: ReactNode;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const deferredSearch = useDeferredValue(search);
  const selectedProducts = summarizeEditableProducts(items);
  const searchQuery = useQuery({
    queryKey: ['order-products-search', deferredSearch],
    enabled: deferredSearch.trim().length > 0,
    queryFn: async () => {
      const response = await request<ProductSearchResponse>(`/api/products?page=1&limit=8&search=${encodeURIComponent(deferredSearch)}`);

      return response.items.map((item) => ({
        ...item,
        price: parseNumericAmount(item.price),
      }));
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t('ordersManager.products.searchTitle')}</p>
          <div className="relative w-full">
            <Input
              className="pl-10"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t('ordersManager.products.searchPlaceholder')}
              aria-label={t('ordersManager.products.searchTitle')}
            />
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        {search.trim().length ? (
          <div className="flex flex-col gap-3">
            {searchQuery.isFetching ? <p className="text-sm text-muted-foreground">{t('ordersManager.products.searchLoading')}</p> : null}
            {!searchQuery.isFetching && searchQuery.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('ordersManager.products.searchEmpty')}</p>
            ) : null}
            {searchQuery.data?.map((product) => (
              <Card key={product.id} className="flex items-center gap-3 rounded-2xl border border-border/70 p-3">
                <ProductThumbnail src={product.images[0] ?? null} alt={product.title} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{product.title}</p>
                  <p className="text-sm text-muted-foreground">{formatMoney(locale, parseNumericAmount(product.price))}</p>
                  {product.sku || product.barcode ? (
                    <p className="truncate text-xs text-muted-foreground">{[product.sku, product.barcode].filter(Boolean).join(' • ')}</p>
                  ) : null}
                </div>
                <Button type="button" size="sm" onClick={() => onAddProduct(product)}>
                  {t('ordersManager.products.add')}
                </Button>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('ordersManager.products.searchHint')}</p>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-border/70 p-4">
        <div>
          <p className="text-sm font-medium">{t('ordersManager.products.selectedTitle')}</p>
          <p className="text-xs text-muted-foreground">{customerName}</p>
          <p className="text-xs text-muted-foreground">{t('ordersManager.products.selectedDescription')}</p>
        </div>
        <div className="flex flex-col gap-3">
          {selectedProducts.length ? selectedProducts.map((product) => (
            <Card key={product.rawValue} className="rounded-2xl border border-border/70 p-3">
              <div className="flex items-start gap-3">
                <ProductThumbnail src={product.thumbnailUrl} alt={product.title} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{product.title}</p>
                  <p className="text-sm text-muted-foreground">{t('ordersManager.products.unitPrice')}: {formatMoney(locale, product.unitPrice)}</p>
                  <p className="text-sm text-muted-foreground">{t('ordersManager.products.lineTotal')}: {formatMoney(locale, product.lineTotal)}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <Badge variant="outline">{t('ordersManager.products.quantity', { count: product.quantity })}</Badge>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => onDecreaseQuantity(product.rawValue)} aria-label={t('ordersManager.products.decreaseQuantity', { title: product.title })}>
                    -
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => onIncreaseQuantity(product.rawValue)} aria-label={t('ordersManager.products.increaseQuantity', { title: product.title })}>
                    +
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => onRemoveProduct(product.rawValue)} aria-label={t('ordersManager.products.removeProduct', { title: product.title })}>
                    <X />
                  </Button>
                </div>
              </div>
            </Card>
          )) : (
            <p className="text-sm text-muted-foreground">{t('ordersManager.products.empty')}</p>
          )}
        </div>
        {footer ?? null}
      </div>
    </div>
  );
}
