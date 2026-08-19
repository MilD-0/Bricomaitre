'use client';

import { Package, PhoneCall, Plus, Search, Trash2 } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { requestJson as request } from '../../lib/admin-api';
import type { EcotrackCatalogResponse } from '../../lib/ecotrack-admin-contracts';
import type { OrderRecord } from '../../lib/orders';
import { parseNumericAmount } from '../../lib/orders';
import { splitOrderFullNameDraft } from '../../lib/order-presentation';
import { toast } from '../../lib/toast';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { NativeSelect, NativeSelectOption } from '../ui/native-select';
import { Spinner } from '../ui/spinner';
import { Textarea } from '../ui/textarea';
import type { ProductSearchItem, ProductSearchResponse } from './order-products-editor';

type CreateResponse = {
  ok: true;
  item: OrderRecord;
  duplicateCandidates: Array<{ id: number; createdAt: string }>;
};

export function OrderSalesDesk({
  catalog,
  writable,
  onOpenOrder,
  onCreated,
}: {
  catalog?: EcotrackCatalogResponse;
  writable: boolean;
  onOpenOrder: (id: number) => void;
  onCreated: (order: OrderRecord) => Promise<void>;
}) {
  const t = useTranslations('salesDesk');
  const [createOpen, setCreateOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [delivery, setDelivery] = useState<0 | 1>(0);
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [products, setProducts] = useState<ProductSearchItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const deferredSearch = useDeferredValue(productSearch.trim());
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreateResponse | null>(null);
  const productSearchQuery = useQuery({
    queryKey: ['sales-desk-product-search', deferredSearch],
    enabled: createOpen && deferredSearch.length > 0,
    queryFn: () =>
      request<ProductSearchResponse>(
        `/api/products?page=1&limit=8&search=${encodeURIComponent(deferredSearch)}`,
      ),
    staleTime: 30_000,
  });
  const communes = useMemo(
    () => catalog?.communes.filter((commune) => String(commune.wilayaId) === state) ?? [],
    [catalog?.communes, state],
  );

  function reset() {
    setFullName('');
    setPhone('');
    setDelivery(0);
    setState('');
    setCity('');
    setAddress('');
    setNote('');
    setProducts([]);
    setProductSearch('');
    setCreated(null);
  }

  async function createOrder() {
    const name = splitOrderFullNameDraft(fullName);
    setSaving(true);
    try {
      const response = await request<CreateResponse>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          firstName: name.firstName,
          lastName: name.lastName,
          email: null,
          phoneNumber1: phone,
          phoneNumber2: null,
          cartProducts: products.map((product) => String(product.id)),
          delivery,
          state: state ? Number(state) : null,
          city: city || null,
          homeAddress: delivery === 0 ? address || null : null,
          note: note || null,
          promoCode: null,
          visitId: null,
          journeyId: null,
          sessionId: null,
        }),
      });
      setCreated(response);
      await onCreated(response.item);
      toast.success(t('created', { id: response.item.id }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('createError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" disabled={!writable} onClick={() => setCreateOpen(true)}>
        <PhoneCall className="size-4" />
        {t('newOrder')}
      </Button>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) reset();
        }}
      >
        <DialogContent className="h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] max-w-none overflow-y-auto rounded-xl p-4 sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-[1.5rem] sm:p-6">
          <DialogHeader>
            <DialogTitle>{t('newOrderTitle')}</DialogTitle>
            <DialogDescription>{t('newOrderDescription')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              {t('customerName')}
              <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t('phone')}
              <Input
                value={phone}
                inputMode="tel"
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t('delivery')}
              <NativeSelect
                value={String(delivery)}
                onChange={(event) => setDelivery(Number(event.target.value) as 0 | 1)}
              >
                <NativeSelectOption value="0">{t('home')}</NativeSelectOption>
                <NativeSelectOption value="1">{t('office')}</NativeSelectOption>
              </NativeSelect>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t('wilaya')}
              <NativeSelect
                value={state}
                onChange={(event) => {
                  setState(event.target.value);
                  setCity('');
                }}
              >
                <NativeSelectOption value="">{t('selectWilaya')}</NativeSelectOption>
                {catalog?.wilayas.map((wilaya) => (
                  <NativeSelectOption key={wilaya.wilayaId} value={wilaya.wilayaId}>
                    {wilaya.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t('commune')}
              <NativeSelect value={city} onChange={(event) => setCity(event.target.value)}>
                <NativeSelectOption value="">{t('selectCommune')}</NativeSelectOption>
                {communes.map((commune) => (
                  <NativeSelectOption key={commune.communeId} value={commune.communeId}>
                    {commune.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            {delivery === 0 ? (
              <label className="grid gap-1.5 text-sm font-medium">
                {t('address')}
                <Input value={address} onChange={(event) => setAddress(event.target.value)} />
              </label>
            ) : null}
          </div>

          <section className="space-y-3 border-y border-border/70 py-4">
            <h3 className="font-semibold">{t('products')}</h3>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground" />
              <Input
                className="ps-9"
                value={productSearch}
                placeholder={t('searchProducts')}
                onChange={(event) => setProductSearch(event.target.value)}
              />
              {deferredSearch ? (
                <div className="absolute inset-x-0 top-12 z-20 max-h-64 overflow-y-auto rounded-xl border bg-popover shadow-lg">
                  {productSearchQuery.isFetching ? (
                    <p className="p-3 text-sm text-muted-foreground">{t('searching')}</p>
                  ) : null}
                  {productSearchQuery.data?.items.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      className="flex w-full items-center gap-3 border-b px-3 py-2 text-start last:border-0 hover:bg-muted"
                      onClick={() => {
                        setProducts((current) => [...current, product]);
                        setProductSearch('');
                      }}
                    >
                      <Package className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{product.title}</span>
                      <span className="text-sm font-medium">
                        {parseNumericAmount(product.price)}
                      </span>
                      <Plus className="size-4" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {products.map((product, index) => (
              <div
                key={`${product.id}-${index}`}
                className="flex items-center gap-3 border-t border-border/55 py-2 first:border-t-0"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{product.title}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="size-8 p-0"
                  aria-label={t('removeProduct')}
                  onClick={() =>
                    setProducts((current) => current.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </section>
          <label className="grid gap-1.5 text-sm font-medium">
            {t('note')}
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </label>

          {created?.duplicateCandidates.length ? (
            <aside className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              <strong>{t('duplicateWarning')}</strong>
              <ul className="mt-2 space-y-1">
                {created.duplicateCandidates.map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      className="underline"
                      onClick={() => onOpenOrder(candidate.id)}
                    >
                      #{candidate.id} · {new Date(candidate.createdAt).toLocaleString()}
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}

          <DialogFooter className="sticky -bottom-4 -mx-4 border-t border-border/60 bg-[var(--glass-surface)] px-4 py-3 backdrop-blur-xl sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {t('close')}
            </Button>
            {created ? (
              <Button
                type="button"
                onClick={() => {
                  onOpenOrder(created.item.id);
                  setCreateOpen(false);
                }}
              >
                {t('openCreated')}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={saving || !fullName.trim() || !phone.trim() || products.length === 0}
                onClick={() => void createOrder()}
              >
                {saving ? <Spinner className="size-4" /> : null}
                {t('create')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
