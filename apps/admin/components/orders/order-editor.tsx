'use client';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { requestJson as request } from '../../lib/admin-api';
import type { EcotrackCatalogResponse } from '../../lib/ecotrack-admin-contracts';
import { getOrderStatusLabelKey, type OrderPatch, type OrderRecord } from '../../lib/orders';
import { cn } from '../../lib/utils';
import { OrderEditorBodyView } from './editor/editor-view';
import { useOrderEditorBody } from './editor/use-editor';
import { formatOrderDate, orderStatusTone } from './orders-workspace-presenters';
export function OrderEditorBody(...args: Parameters<typeof useOrderEditorBody>) {
  const model = useOrderEditorBody(...args);
  if (model.view === null) return model.fallback;
  return <OrderEditorBodyView {...model.view} />;
}

export function OrderEditor({
  order,
  catalog,
  writable,
  pending,
  onSave,
}: {
  order: OrderRecord | null;
  catalog?: EcotrackCatalogResponse;
  writable: boolean;
  pending: boolean;
  onSave: (order: OrderRecord, patch: OrderPatch) => Promise<OrderRecord | null>;
}) {
  const locale = useLocale();
  const t = useTranslations();
  const detailQuery = useQuery({
    queryKey: ['orders-workspace-detail', order?.id],
    enabled: Boolean(order),
    queryFn: () => request<OrderDetailResponse>(`/api/orders/${order?.id}`),
    initialData: order ? { ok: true, item: order } : undefined,
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
  });
  const detail = detailQuery.data?.item ?? order;

  if (!detail) {
    return (
      <div className="grid min-h-80 place-items-center px-6 text-center text-sm text-muted-foreground">
        {t('adminWorkspace.orders.selectOrder')}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {detailQuery.isError ? (
        <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:px-5">
          {detailQuery.error.message}
        </p>
      ) : null}
      <header className="border-b border-border/60 bg-card/45 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-primary">#{detail.id}</p>
            <h2 className="mt-1 truncate text-xl font-semibold tracking-[var(--type-tracking-n020)]">
              {detail.fullName}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatOrderDate(locale, detail.createdAt, true)}
            </p>
          </div>
          <span className="mt-1 flex shrink-0 items-center gap-2 rounded-full bg-background px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-vapor)]">
            <span className={cn('size-2 rounded-full', orderStatusTone(detail.inHouseStatus))} />
            {t(`ordersManager.status.${getOrderStatusLabelKey(detail.inHouseStatus)}`)}
          </span>
        </div>
      </header>
      <OrderEditorBody
        key={detail.id}
        order={detail}
        catalog={catalog}
        writable={writable}
        pending={pending}
        onSave={onSave}
      />
    </div>
  );
}
type OrderDetailResponse = { ok: true; item: OrderRecord };
