'use client';

import { ArchiveRestore } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

import type { ArchivedProduct } from '../../lib/product-archive';
import { toast } from '../../lib/toast';
import { Button } from '../ui/button';

export function ProductArchive({ initialProducts }: { initialProducts: ArchivedProduct[] }) {
  const t = useTranslations('productArchive');
  const [products, setProducts] = useState(initialProducts);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  async function restore(productId: number) {
    setRestoringId(productId);
    const toastId = toast.loading(t('restoring'));
    try {
      const response = await fetch(`/api/products/${productId}/restore`, { method: 'POST' });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || t('restoreError'));
      setProducts((current) => current.filter((product) => product.id !== productId));
      toast.success(t('restored'), { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('restoreError'), { id: toastId });
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t('description')}</p>
      </header>

      {products.length === 0 ? (
        <p className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {t('empty')}
        </p>
      ) : (
        <div className="divide-y rounded-2xl border bg-card shadow-sm">
          {products.map((product) => (
            <article
              key={product.id}
              className="flex flex-wrap items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{product.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  #{product.id}
                  {product.sku ? ` · SKU ${product.sku}` : ''}
                  {product.barcode ? ` · ${product.barcode}` : ''}
                  {` · ${new Date(product.archivedAt).toLocaleDateString()}`}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={restoringId !== null}
                onClick={() => void restore(product.id)}
              >
                <ArchiveRestore className="size-4" aria-hidden="true" />
                {restoringId === product.id ? t('restoring') : t('restore')}
              </Button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
