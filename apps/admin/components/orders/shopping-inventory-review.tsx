'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useRef, useState } from 'react';

import { buildShoppingListDraftRequest } from './orders-shopping-list';
import { requestJson } from '../../lib/admin-api';
import type { ShoppingListSourceMode } from '../../lib/shopping-list-drafts';
import type { ShoppingListAllocationReview } from '../../lib/shopping-list-stock-allocations';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { NativeSelect, NativeSelectOption } from '../ui/native-select';

const copy = {
  en: {
    title: 'Review previous stock deductions',
    description:
      'Assign the quantities already deducted to their orders or manual additions. Saving this review does not change stock.',
    choose: 'Product and shopping list',
    order: 'Order',
    required: 'Order quantity',
    current: 'Already accounted for',
    assigned: 'Deducted in this list',
    manual: 'Manual additions',
    recorded: 'Recorded deduction',
    total: 'Assigned total',
    save: 'Save attribution',
    saving: 'Saving…',
    loading: 'Loading…',
    empty: 'All previous deductions have been reviewed.',
    close: 'Close',
    reload: 'Reload',
    error: 'Unable to save. Retry with the same quantities or reload to check the saved result.',
  },
  fr: {
    title: 'Vérifier les déductions de stock précédentes',
    description:
      'Attribuez les quantités déjà déduites aux commandes ou aux ajouts manuels. Enregistrer cette vérification ne modifie pas le stock.',
    choose: 'Produit et liste d’achats',
    order: 'Commande',
    required: 'Quantité commandée',
    current: 'Déjà comptabilisé',
    assigned: 'Déduit dans cette liste',
    manual: 'Ajouts manuels',
    recorded: 'Déduction enregistrée',
    total: 'Total attribué',
    save: 'Enregistrer l’attribution',
    saving: 'Enregistrement…',
    loading: 'Chargement…',
    empty: 'Toutes les déductions précédentes ont été vérifiées.',
    close: 'Fermer',
    reload: 'Recharger',
    error:
      'Enregistrement impossible. Réessayez avec les mêmes quantités ou rechargez pour vérifier le résultat enregistré.',
  },
  ar: {
    title: 'مراجعة خصومات المخزون السابقة',
    description:
      'وزّع الكميات المخصومة سابقًا على الطلبات أو الإضافات اليدوية. حفظ المراجعة لا يغيّر المخزون.',
    choose: 'المنتج وقائمة المشتريات',
    order: 'الطلب',
    required: 'الكمية المطلوبة',
    current: 'المحتسب سابقًا',
    assigned: 'المخصوم في هذه القائمة',
    manual: 'إضافات يدوية',
    recorded: 'الخصم المسجّل',
    total: 'مجموع التوزيع',
    save: 'حفظ التوزيع',
    saving: 'جارٍ الحفظ…',
    loading: 'جارٍ التحميل…',
    empty: 'تمت مراجعة جميع الخصومات السابقة.',
    close: 'إغلاق',
    reload: 'إعادة التحميل',
    error: 'تعذّر الحفظ. أعد المحاولة بالكميات نفسها أو أعد التحميل للتحقق من النتيجة المحفوظة.',
  },
};

export function shoppingInventoryReviewLabel(locale: string) {
  return copy[locale === 'ar' ? 'ar' : locale === 'fr' ? 'fr' : 'en'].title;
}

export function ShoppingInventoryReviewDialog({
  open,
  onOpenChange,
  sourceMode,
  orderIds,
  onReviewed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceMode: ShoppingListSourceMode;
  orderIds: number[];
  onReviewed: () => Promise<void>;
}) {
  const locale = useLocale();
  const t = copy[locale === 'ar' ? 'ar' : locale === 'fr' ? 'fr' : 'en'];
  const [selected, setSelected] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);
  const query = useQuery({
    queryKey: ['shopping-inventory-review', sourceMode, orderIds],
    enabled: open,
    queryFn: () => {
      const lookup = buildShoppingListDraftRequest(sourceMode, orderIds);
      return requestJson<ShoppingListAllocationReview>(
        lookup.init?.method === 'POST'
          ? '/api/orders/shopping-list-draft/review/lookup'
          : lookup.url.replace('/shopping-list-draft?', '/shopping-list-draft/review?'),
        lookup.init,
      );
    },
  });
  const choices =
    query.data?.reviews.flatMap((review) =>
      review.products.map((product) => ({
        key: `${review.scopeKey}:${product.productId}`,
        review,
        product,
      })),
    ) ?? [];
  const choice = choices.find((item) => item.key === selected) ?? choices[0];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] space-y-5 overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <p>{t.loading}</p>
        ) : query.error ? (
          <div role="alert">
            <p>{query.error.message}</p>
            <Button onClick={() => void query.refetch()}>{t.reload}</Button>
          </div>
        ) : choice ? (
          <>
            <label className="block space-y-2">
              <span className="block text-sm font-medium">{t.choose}</span>
              <NativeSelect
                value={choice.key}
                onChange={(event) => setSelected(event.target.value)}
              >
                {choices.map((item) => (
                  <NativeSelectOption key={item.key} value={item.key}>
                    {item.product.title} · {item.review.title}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <ReviewProductForm
              key={`${choice.key}:${choice.review.revision}:${reloadVersion}`}
              review={choice.review}
              product={choice.product}
              t={t}
              onReload={async () => {
                await query.refetch();
                setReloadVersion((version) => version + 1);
              }}
              onSaved={async () => {
                await query.refetch();
                await onReviewed();
              }}
            />
          </>
        ) : (
          <p role="status">{t.empty}</p>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.close}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Review = ShoppingListAllocationReview['reviews'][number];

function ReviewProductForm({
  review,
  product,
  t,
  onSaved,
  onReload,
}: {
  review: Review;
  product: Review['products'][number];
  t: typeof copy.en;
  onSaved: () => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [manual, setManual] = useState('0');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef<string | null>(null);
  const values = product.orders.map((order) => ({
    orderId: order.orderId,
    quantity: Number(quantities[order.orderId] ?? '0'),
  }));
  const total = values.reduce((sum, row) => sum + row.quantity, Number(manual));
  const valid =
    [...values.map((row) => row.quantity), Number(manual)].every(
      (value) => Number.isInteger(value) && value >= 0 && value <= 999999,
    ) && total === product.recordedQuantity;
  async function save() {
    if (!valid || pending) return;
    setPending(true);
    setError('');
    try {
      await requestJson('/api/orders/shopping-list-draft/review', {
        method: 'POST',
        body: JSON.stringify({
          scopeKey: review.scopeKey,
          revision: review.revision,
          productId: product.productId,
          requestId: (requestId.current ??= crypto.randomUUID()),
          orders: values,
          manualQuantity: Number(manual),
        }),
      });
      await onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t.error);
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p>
        {t.recorded}: <strong>{product.recordedQuantity}</strong>
      </p>
      <fieldset disabled={pending || Boolean(error)} className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-start">
                <th className="p-2 text-start">{t.order}</th>
                <th className="p-2 text-end">{t.required}</th>
                <th className="p-2 text-end">{t.current}</th>
                <th className="p-2 text-end">{t.assigned}</th>
              </tr>
            </thead>
            <tbody>
              {product.orders.map((order) => (
                <tr key={order.orderId} className="border-b">
                  <td className="p-2">#{order.orderId}</td>
                  <td className="p-2 text-end">{order.requiredQuantity}</td>
                  <td className="p-2 text-end">{order.currentAppliedQuantity}</td>
                  <td className="w-36 p-2">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      max="999999"
                      aria-label={`${t.assigned} · #${order.orderId}`}
                      value={quantities[order.orderId] ?? ''}
                      placeholder="0"
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [order.orderId]: event.target.value,
                        }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>{t.manual}</span>
          <Input
            className="w-32"
            type="number"
            min="0"
            step="1"
            max="999999"
            value={manual}
            onChange={(event) => setManual(event.target.value)}
          />
        </label>
      </fieldset>
      <p aria-live="polite">
        {t.total}: {Number.isFinite(total) ? total : '—'} / {product.recordedQuantity}
      </p>
      {error ? (
        <div role="alert" className="space-y-2">
          <p>{error}</p>
          <Button type="button" variant="outline" onClick={() => void onReload()}>
            {t.reload}
          </Button>
        </div>
      ) : null}
      <Button type="submit" disabled={!valid || pending}>
        {pending ? t.saving : t.save}
      </Button>
    </form>
  );
}
