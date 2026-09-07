'use client';

import { z } from 'zod';
import { storefrontOrderCreateSchema } from '@bric/storefront-core/order-domain';
import { Package, PhoneCall, Plus, Search, Trash2 } from 'lucide-react';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { AdminApiError, requestJson as request } from '../../lib/admin-api';
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
import { NativeSelect } from '../ui/native-select';
import { Spinner } from '../ui/spinner';
import { Textarea } from '../ui/textarea';
import type { ProductSearchItem, ProductSearchResponse } from './order-products-editor';

type CreateResponse = {
  ok: true;
  item: OrderRecord;
  duplicateCandidates: Array<{ id: number; createdAt: string }>;
};

const storedPhoneAttemptSchema = z.object({
  requestId: z.string().uuid(),
  body: z.string(),
  products: z.array(
    z.object({
      id: z.number().int().positive(),
      title: z.string(),
      price: z.union([z.string(), z.number()]),
      images: z.array(z.string()),
    }),
  ),
});

export function OrderSalesDesk({
  catalog,
  operatorId,
  writable,
  onOpenOrder,
  onCreated,
}: {
  catalog?: EcotrackCatalogResponse;
  operatorId?: string;
  writable: boolean;
  onOpenOrder: (id: number) => void;
  onCreated: (order: OrderRecord) => Promise<void>;
}) {
  const t = useTranslations('salesDesk');
  const storageKey = operatorId ? `bric:phone-order-attempt:${operatorId}` : null;
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
  const attemptRef = useRef<{ requestId: string; body: string } | null>(null);
  const [unresolved, setUnresolved] = useState(false);
  const [created, setCreated] = useState<CreateResponse | null>(null);
  const productSearchQuery = useQuery({
    queryKey: ['sales-desk-product-search', deferredSearch],
    enabled: createOpen && deferredSearch.length > 0,
    queryFn: () =>
      request<ProductSearchResponse>(
        `/api/orders/product-options?limit=8&search=${encodeURIComponent(deferredSearch)}`,
      ),
    staleTime: 30_000,
  });
  const communes = useMemo(
    () => catalog?.communes.filter((commune) => String(commune.wilayaId) === state) ?? [],
    [catalog?.communes, state],
  );

  function clearStoredAttempt() {
    if (storageKey) {
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        /* Storage may be unavailable. */
      }
    }
  }

  function openCreate() {
    if (!attemptRef.current && storageKey) {
      try {
        const raw = window.sessionStorage.getItem(storageKey);
        if (raw) {
          const stored = storedPhoneAttemptSchema.parse(JSON.parse(raw));
          const body = JSON.parse(stored.body);
          const data = storefrontOrderCreateSchema.parse(body);
          if (body.requestId !== stored.requestId) throw new Error('Invalid saved attempt');
          attemptRef.current = { requestId: stored.requestId, body: stored.body };
          setFullName([data.firstName, data.lastName].filter(Boolean).join(' '));
          setPhone(data.phoneNumber1);
          setDelivery(data.delivery);
          setState(data.state == null ? '' : String(data.state));
          setCity(data.city ?? '');
          setAddress(data.homeAddress ?? '');
          setNote(data.note ?? '');
          setProducts(stored.products);
          setUnresolved(true);
        }
      } catch {
        clearStoredAttempt();
      }
    }
    setCreateOpen(true);
  }

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
    attemptRef.current = null;
    clearStoredAttempt();
    setUnresolved(false);
  }

  function closeCreate() {
    if (saving) return;
    setCreateOpen(false);
    if (!attemptRef.current || created) reset();
  }

  function openOrder(id: number) {
    closeCreate();
    onOpenOrder(id);
  }

  async function createOrder() {
    const name = splitOrderFullNameDraft(fullName);
    if (saving) return;
    setSaving(true);
    try {
      const requestId = attemptRef.current?.requestId ?? crypto.randomUUID();
      const body =
        attemptRef.current?.body ??
        JSON.stringify({
          requestId,
          firstName: name.firstName,
          lastName: name.lastName,
          phoneNumber1: phone,
          cartProducts: products.map((product) => String(product.id)),
          delivery,
          state: state ? Number(state) : null,
          city: city || null,
          homeAddress: delivery === 0 ? address || null : null,
          note: note || null,
        });
      attemptRef.current = { requestId, body };
      if (storageKey) {
        try {
          window.sessionStorage.setItem(storageKey, JSON.stringify({ requestId, body, products }));
        } catch {
          /* The in-memory attempt still supports retry. */
        }
      }
      const response = await request<CreateResponse>('/api/orders', {
        method: 'POST',
        body,
      });
      setCreated(response);
      clearStoredAttempt();
      setUnresolved(false);
      toast.success(t('created', { id: response.item.id }));
      try {
        await onCreated(response.item);
      } catch {
        toast.error(t('refreshError'));
      }
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 400) {
        attemptRef.current = null;
        clearStoredAttempt();
        setUnresolved(false);
      } else {
        setUnresolved(true);
      }
      toast.error(error instanceof Error ? error.message : t('createError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" disabled={!writable} onClick={openCreate}>
        <PhoneCall className="size-4" />
        {t('newOrder')}
      </Button>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (saving) return;
          if (open) setCreateOpen(true);
          else closeCreate();
        }}
      >
        <DialogContent className="h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] max-w-none overflow-y-auto rounded-xl p-4 sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-[var(--shape-radius-overlay)] sm:p-6">
          <DialogHeader>
            <DialogTitle>{t('newOrderTitle')}</DialogTitle>
            <DialogDescription>{t('newOrderDescription')}</DialogDescription>
          </DialogHeader>
          <fieldset
            disabled={saving || unresolved || created !== null}
            className="min-w-0 space-y-4"
          >
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
                  <option value="0">{t('home')}</option>
                  <option value="1">{t('office')}</option>
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
                  <option value="">{t('selectWilaya')}</option>
                  {catalog?.wilayas.map((wilaya) => (
                    <option key={wilaya.wilayaId} value={wilaya.wilayaId}>
                      {wilaya.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                {t('commune')}
                <NativeSelect value={city} onChange={(event) => setCity(event.target.value)}>
                  <option value="">{t('selectCommune')}</option>
                  {communes.map((commune) => (
                    <option key={commune.communeId} value={commune.communeId}>
                      {commune.name}
                    </option>
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
                      setProducts((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
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
          </fieldset>
          {unresolved ? (
            <p role="status" className="text-sm">
              {t('retryUnconfirmed')}
            </p>
          ) : null}

          {created?.duplicateCandidates.length ? (
            <aside className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              <strong>{t('duplicateWarning')}</strong>
              <ul className="mt-2 space-y-1">
                {created.duplicateCandidates.map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      className="underline"
                      onClick={() => openOrder(candidate.id)}
                    >
                      #{candidate.id} · {new Date(candidate.createdAt).toLocaleString()}
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}

          <DialogFooter className="sticky -bottom-4 -mx-4 border-t border-border/60 bg-[var(--glass-surface)] px-4 py-3 backdrop-blur-xl sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
            <Button type="button" variant="outline" disabled={saving} onClick={closeCreate}>
              {t('close')}
            </Button>
            {created ? (
              <Button
                type="button"
                onClick={() => {
                  openOrder(created.item.id);
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
