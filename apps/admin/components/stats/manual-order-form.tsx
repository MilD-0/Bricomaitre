'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { requestJson as request } from '../../lib/admin-api';
import { toast } from '../../lib/toast';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';

type ProductRow = {
  id: number;
  title: string;
  sku: string | null;
  price: string;
  purchasePrice: string | null;
  categoryId: number | null;
  brandId: number | null;
};

type SelectedProduct = {
  id: string;
  title: string;
  sku: string | null;
  price: number;
  cost: number;
  categoryId: string | null;
  brandId: string | null;
  quantity: number;
};

export function ManualOrderForm({
  mode = 'dialog',
  open,
  onOpenChange,
}: {
  mode?: 'dialog' | 'inline';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations('statsDashboard.manualOrders');
  const queryClient = useQueryClient();
  const [tracking, setTracking] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [wilaya, setWilaya] = useState('');
  const [commune, setCommune] = useState('');
  const [deliveryType, setDeliveryType] = useState('');
  const [amountCollected, setAmountCollected] = useState('');
  const [deliveredAt, setDeliveredAt] = useState('');
  const [encaissedAt, setEncaissedAt] = useState('');
  const [createdAt, setCreatedAt] = useState('');
  const [search, setSearch] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [fees, setFees] = useState({
    livraison: '',
    poids: '',
    extra: '',
    sms: '',
    stockage: '',
    commission: '',
  });

  const productsQuery = useQuery({
    queryKey: ['manual-order-products'],
    queryFn: () => request<{ items: ProductRow[] }>('/api/products'),
    staleTime: 60_000,
  });

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = productsQuery.data?.items ?? [];
    if (!term) return rows.slice(0, 12);
    return rows
      .filter(
        (row) => row.title.toLowerCase().includes(term) || row.sku?.toLowerCase().includes(term),
      )
      .slice(0, 12);
  }, [productsQuery.data?.items, search]);

  const createMutation = useMutation({
    mutationFn: () =>
      request('/api/stats/manual-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracking,
          customerName,
          wilaya,
          commune,
          amountCollected: Number(amountCollected || 0),
          deliveryType,
          deliveredAt: deliveredAt || null,
          encaissedAt: encaissedAt || null,
          createdAt: createdAt || null,
          products: selectedProducts.map((product) => ({
            productId: product.id,
            title: product.title,
            sku: product.sku,
            price: product.price,
            cost: product.cost,
            categoryId: product.categoryId,
            brandId: product.brandId,
            quantity: product.quantity,
          })),
          feeBreakdown: {
            livraison: Number(fees.livraison || 0),
            poids: Number(fees.poids || 0),
            extra: Number(fees.extra || 0),
            sms: Number(fees.sms || 0),
            stockage: Number(fees.stockage || 0),
            commission: Number(fees.commission || 0),
          },
        }),
      }),
    onMutate: () => {
      const toastId = toast.loading(t('notifications.create.loading'));
      return { toastId };
    },
    onSuccess: async (_, __, context) => {
      toast.success(t('notifications.create.success'), { id: context?.toastId });
      await queryClient.invalidateQueries({ queryKey: ['stats-dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['manual-orders'] });
      onOpenChange?.(false);
      setTracking('');
      setCustomerName('');
      setWilaya('');
      setCommune('');
      setDeliveryType('');
      setAmountCollected('');
      setDeliveredAt('');
      setEncaissedAt('');
      setCreatedAt('');
      setSelectedProducts([]);
      setFees({ livraison: '', poids: '', extra: '', sms: '', stockage: '', commission: '' });
    },
    onError: (error, __, context) => {
      toast.error(error instanceof Error ? error.message : t('notifications.create.error'), {
        id: context?.toastId,
      });
    },
  });

  const addProduct = (row: ProductRow) => {
    setSelectedProducts((current) => {
      const existing = current.find((item) => item.id === String(row.id));
      if (existing) {
        return current.map((item) =>
          item.id === String(row.id) ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...current,
        {
          id: String(row.id),
          title: row.title,
          sku: row.sku,
          price: Number(row.price ?? 0),
          cost: Number(row.purchasePrice ?? 0),
          categoryId: row.categoryId ? String(row.categoryId) : null,
          brandId: row.brandId ? String(row.brandId) : null,
          quantity: 1,
        },
      ];
    });
  };

  const totalProductCost = selectedProducts.reduce(
    (sum, product) => sum + product.cost * product.quantity,
    0,
  );
  const totalFees = Object.values(fees).reduce((sum, value) => sum + Number(value || 0), 0);
  const profit = Number(amountCollected || 0) - totalFees - totalProductCost;

  const content = (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          value={tracking}
          onChange={(event) => setTracking(event.target.value)}
          placeholder={t('fields.tracking')}
        />
        <Input
          value={customerName}
          onChange={(event) => setCustomerName(event.target.value)}
          placeholder={t('fields.customerName')}
        />
        <Input
          value={wilaya}
          onChange={(event) => setWilaya(event.target.value)}
          placeholder={t('fields.wilaya')}
        />
        <Input
          value={commune}
          onChange={(event) => setCommune(event.target.value)}
          placeholder={t('fields.commune')}
        />
        <Input
          value={deliveryType}
          onChange={(event) => setDeliveryType(event.target.value)}
          placeholder={t('fields.deliveryType')}
        />
        <Input
          type="number"
          value={amountCollected}
          onChange={(event) => setAmountCollected(event.target.value)}
          placeholder={t('fields.amountCollected')}
        />
        <Input
          type="date"
          value={createdAt}
          onChange={(event) => setCreatedAt(event.target.value)}
          aria-label={t('fields.createdAt')}
        />
        <Input
          type="date"
          value={deliveredAt}
          onChange={(event) => setDeliveredAt(event.target.value)}
          aria-label={t('fields.deliveredAt')}
        />
        <Input
          type="date"
          value={encaissedAt}
          onChange={(event) => setEncaissedAt(event.target.value)}
          aria-label={t('fields.encaissedAt')}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-border/70 p-4">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('fields.productSearch')}
          />
          <div className="mt-3 grid max-h-64 gap-2 overflow-auto">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2 text-left hover:bg-muted"
                onClick={() => addProduct(product)}
              >
                <div>
                  <p className="font-medium">{product.title}</p>
                  <p className="text-xs text-muted-foreground">{product.sku || '—'}</p>
                </div>
                <Plus className="size-4" />
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 p-4">
          <div className="grid gap-3">
            {selectedProducts.map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2"
              >
                <div>
                  <p className="font-medium">{product.title}</p>
                  <p className="text-xs text-muted-foreground">{product.sku || '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="size-9"
                    variant="outline"
                    onClick={() =>
                      setSelectedProducts((current) =>
                        current.map((item) =>
                          item.id === product.id
                            ? { ...item, quantity: Math.max(1, item.quantity - 1) }
                            : item,
                        ),
                      )
                    }
                  >
                    <Minus className="size-4" />
                  </Button>
                  <span className="w-6 text-center">{product.quantity}</span>
                  <Button
                    type="button"
                    size="sm"
                    className="size-9"
                    variant="outline"
                    onClick={() =>
                      setSelectedProducts((current) =>
                        current.map((item) =>
                          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
                        ),
                      )
                    }
                  >
                    <Plus className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="size-9"
                    variant="ghost"
                    onClick={() =>
                      setSelectedProducts((current) =>
                        current.filter((item) => item.id !== product.id),
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {Object.keys(fees).map((key) => (
              <Input
                key={key}
                type="number"
                value={fees[key as keyof typeof fees]}
                onChange={(event) =>
                  setFees((current) => ({ ...current, [key]: event.target.value }))
                }
                placeholder={t(`fees.${key}`)}
              />
            ))}
          </div>

          <div className="mt-4 grid gap-2 text-sm">
            <p>
              {t('summary.productCost')}: {totalProductCost.toFixed(0)}
            </p>
            <p>
              {t('summary.totalFees')}: {totalFees.toFixed(0)}
            </p>
            <p>
              {t('summary.profit')}: {profit.toFixed(0)}
            </p>
          </div>
        </div>
      </div>
    </>
  );

  if (mode === 'inline') {
    return (
      <Card className="rounded-[2rem] border-border/60 bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">{t('title')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
          </div>
          {content}
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !tracking}
            >
              {t('actions.create')}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  const isDialogOpen = open ?? false;
  const handleDialogOpenChange = onOpenChange ?? (() => undefined);

  return (
    <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {content}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !tracking}
          >
            {t('actions.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
