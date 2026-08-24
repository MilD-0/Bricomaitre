'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  History,
  MoreHorizontal,
  RefreshCw,
  Search,
  Send,
  Truck,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';

import { requestJson } from '../../lib/admin-api';
import type {
  EcotrackShipmentDetailResponse,
  EcotrackShipmentListItem,
  EcotrackShipmentSortDirection,
  EcotrackShipmentSortKey,
} from '../../lib/ecotrack-admin-contracts';
import { formatOrderPhoneForDisplay } from '../../lib/order-presentation';
import { cn } from '../../lib/utils';
import { AdminAiAskButton } from '../admin-ai-ask-button';
import { SearchField } from '../search-field';
import { SplitActionButton, type SplitActionOption } from '../split-action-button';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '../ui/empty';
import { Input } from '../ui/input';
import { PendingInline } from '../ui/motion';
import { NativeSelect, NativeSelectOption } from '../ui/native-select';
import { ScrollableRegion } from '../ui/scrollable-region';
import { Skeleton } from '../ui/skeleton';
import { Switch } from '../ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { WorkspacePagination } from '../ui/workspace-pagination';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceToolbar,
} from '../ui/workspace';
import {
  formatEcotrackDateTime,
  formatEcotrackMoney,
  getTrackingHistoryStatusKey,
} from './orders-ecotrack-presentation';
import { EcotrackStatusBadge } from './orders-ecotrack-status';

type WorkspaceVariant = 2 | 3 | 4;

type RowActionModel = {
  primary: {
    label: string;
    icon: ReactNode;
    onPrimaryClick: () => void | Promise<void>;
  };
  options: SplitActionOption[];
};

type Pagination = {
  page: number;
  totalPages: number;
  total: number;
};

export type OrdersEcotrackWorkspaceProps = {
  variant: WorkspaceVariant;
  locale: string;
  items: EcotrackShipmentListItem[];
  pagination: Pagination;
  writable: boolean;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  search: string;
  scanQuery: string;
  statusFilter: string;
  staleOnly: boolean;
  sortKey: EcotrackShipmentSortKey;
  sortDirection: EcotrackShipmentSortDirection;
  statuses: readonly string[];
  selectedIds: number[];
  inspectedIds: number[];
  scanPending: boolean;
  onSearchChange: (value: string) => void;
  onScanQueryChange: (value: string) => void;
  onScanSubmit: () => void;
  onStatusChange: (value: string) => void;
  onStaleOnlyChange: (value: boolean) => void;
  onSortKeyChange: (value: EcotrackShipmentSortKey) => void;
  onSortDirectionChange: (value: EcotrackShipmentSortDirection) => void;
  onPageChange: (page: number) => void;
  onToggleSelected: (orderId: number, selected: boolean) => void;
  onToggleVisible: (selected: boolean) => void;
  onInspect: (orderId: number) => void;
  onRefreshVisible: () => void;
  onRefreshSelected: () => void;
  onPrintSelected: () => void;
  onClearSelection: () => void;
  onDispatchReady: () => void;
  onDispatchSelected: () => void;
  onShowSelectedHistory: () => void;
  buildRowActionModel: (item: EcotrackShipmentListItem, expanded: boolean) => RowActionModel;
};

const stageDefinitions = [
  {
    key: 'ready',
    labelStatus: 'prete_a_expedier',
    statuses: new Set([
      'prete_a_expedier',
      'en_ramassage',
      'en_preparation_stock',
      'en_preparation',
    ]),
  },
  {
    key: 'transit',
    labelStatus: 'vers_hub',
    statuses: new Set(['vers_hub', 'en_hub', 'vers_wilaya']),
  },
  {
    key: 'delivery',
    labelStatus: 'en_livraison',
    statuses: new Set(['en_livraison', 'suspendu']),
  },
  {
    key: 'settlement',
    labelStatus: 'livre_non_encaisse',
    statuses: new Set([
      'livre_non_encaisse',
      'encaisse_non_paye',
      'paiements_prets',
      'paye_et_archive',
    ]),
  },
  {
    key: 'returns',
    labelStatus: 'retour_chez_livreur',
    statuses: new Set([
      'retour_chez_livreur',
      'retour_transit_entrepot',
      'retour_en_traitement',
      'retour_recu',
      'retour_archive',
      'annule',
    ]),
  },
] as const;

function ShipmentAction({ model, disabled }: { model: RowActionModel; disabled: boolean }) {
  return (
    <SplitActionButton
      size="sm"
      compactOnMobile
      label={model.primary.label}
      icon={model.primary.icon}
      primaryDisabled={disabled}
      onPrimaryClick={model.primary.onPrimaryClick}
      options={model.options}
    />
  );
}

function ShipmentIdentity({
  item,
  locale,
  compact = false,
}: {
  item: EcotrackShipmentListItem;
  locale: string;
  compact?: boolean;
}) {
  const t = useTranslations();
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-semibold">{item.trackingNumber}</span>
        <span className="shrink-0 text-[0.68rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {item.provider}
        </span>
      </div>
      <p className="mt-1 truncate text-sm text-muted-foreground">
        {item.fullName} · {formatOrderPhoneForDisplay(item.phoneNumber1)}
      </p>
      {!compact ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {t('ordersEcotrackManager.reference')} {item.reference} ·{' '}
          {formatEcotrackDateTime(locale, item.createdAt)}
        </p>
      ) : null}
    </div>
  );
}

function ShipmentInspector({
  item,
  locale,
  action,
  writable,
}: {
  item: EcotrackShipmentListItem;
  locale: string;
  action: RowActionModel;
  writable: boolean;
}) {
  const t = useTranslations();
  const detailQuery = useQuery({
    queryKey: ['ecotrack-shipment-detail', item.orderId],
    queryFn: () =>
      requestJson<EcotrackShipmentDetailResponse>(`/api/orders/ecotrack/shipments/${item.orderId}`),
    staleTime: 30_000,
  });
  const detail = detailQuery.data?.item;

  return (
    <section aria-label={t('ordersEcotrackManager.summaryTitle')} className="min-w-0">
      <header className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-primary">
            #{item.reference}
          </p>
          <h2 className="mt-1 truncate text-lg font-semibold">{item.fullName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{item.trackingNumber}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <EcotrackStatusBadge locale={locale} status={item.status} t={t} />
          <ShipmentAction
            model={action}
            disabled={(item.canDispatch || item.canAddMaj) && !writable}
          />
        </div>
      </header>

      <div className="grid border-b border-border sm:grid-cols-2">
        <div className="border-b border-border p-4 sm:border-b-0 sm:border-e">
          <h3 className="text-sm font-semibold">{t('ordersEcotrackManager.columns.client')}</h3>
          <p className="mt-2 text-sm">{item.fullName}</p>
          <p className="text-sm text-muted-foreground">
            {formatOrderPhoneForDisplay(item.phoneNumber1)}
          </p>
          {item.phoneNumber2 ? (
            <p className="text-sm text-muted-foreground">
              {formatOrderPhoneForDisplay(item.phoneNumber2)}
            </p>
          ) : null}
        </div>
        <div className="p-4">
          <h3 className="text-sm font-semibold">{t('ordersEcotrackManager.columns.address')}</h3>
          <p className="mt-2 text-sm">
            {item.homeAddress || t('ordersEcotrackManager.missingValue')}
          </p>
          <p className="text-sm text-muted-foreground">
            {[item.city, item.stateName ?? item.state].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      <div className="grid border-b border-border lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="p-4 lg:border-e lg:border-border">
          <h3 className="text-sm font-semibold">{t('ordersEcotrackManager.columns.products')}</h3>
          <div className="mt-3 divide-y divide-border">
            {item.orderProducts.map((product, index) => (
              <div key={`${item.orderId}-inspect-${index}`} className="flex gap-4 py-2 text-sm">
                <span className="min-w-0 flex-1">{product.title}</span>
                <span className="text-muted-foreground">×{product.quantity}</span>
                <span className="font-medium">
                  {formatEcotrackMoney(locale, product.lineTotal)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 text-sm">
          <p className="flex justify-between gap-3 text-muted-foreground">
            <span>{t('ordersEcotrackManager.amounts.subtotal')}</span>
            <span>{formatEcotrackMoney(locale, item.productSubtotal)}</span>
          </p>
          <p className="mt-2 flex justify-between gap-3 text-muted-foreground">
            <span>{t('ordersEcotrackManager.amounts.deliveryFee')}</span>
            <span>{formatEcotrackMoney(locale, item.deliveryFee)}</span>
          </p>
          <p className="mt-3 flex justify-between gap-3 border-t border-border pt-3 font-semibold">
            <span>{t('ordersEcotrackManager.amounts.total')}</span>
            <span>{formatEcotrackMoney(locale, item.totalAmount)}</span>
          </p>
        </div>
      </div>

      {detailQuery.isPending ? (
        <div className="grid gap-3 p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}
      {detailQuery.isError ? (
        <p className="p-4 text-sm text-destructive">{detailQuery.error.message}</p>
      ) : null}
      {detail ? (
        <div className="grid lg:grid-cols-2">
          <section className="border-b border-border p-4 lg:border-b-0 lg:border-e">
            <div className="flex items-center gap-2">
              <History className="size-4" />
              <h3 className="text-sm font-semibold">
                {t('ordersEcotrackManager.history.majTitle')}
              </h3>
            </div>
            <div className="mt-3 divide-y divide-border">
              {detail.majEntries.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">
                  {t('ordersEcotrackManager.history.emptyMaj')}
                </p>
              ) : null}
              {detail.majEntries.map((entry) => (
                <div key={entry.id} className="py-3 text-sm">
                  <p>{entry.remarque}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatEcotrackDateTime(locale, entry.remoteCreatedAt)}
                    {entry.station || entry.livreur
                      ? ` · ${[entry.station, entry.livreur].filter(Boolean).join(' · ')}`
                      : ''}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section className="p-4">
            <div className="flex items-center gap-2">
              <Truck className="size-4" />
              <h3 className="text-sm font-semibold">
                {t('ordersEcotrackManager.history.timelineTitle')}
              </h3>
            </div>
            <div className="mt-3 divide-y divide-border">
              {detail.trackingEvents.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">
                  {t('ordersEcotrackManager.history.emptyTimeline')}
                </p>
              ) : null}
              {detail.trackingEvents.map((event) => {
                const statusKey = getTrackingHistoryStatusKey(event.status);
                return (
                  <div key={event.id} className="py-3 text-sm">
                    <p>{statusKey ? t(statusKey) : event.status}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.eventDate} {event.eventTime}
                      {event.scanLocation ? ` · ${event.scanLocation}` : ''}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function EcotrackWorkspaceChrome(props: OrdersEcotrackWorkspaceProps) {
  const t = useTranslations();
  const dispatchable = props.items.filter((item) => item.canDispatch).length;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filtersOpen) return;

    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !filterRef.current?.contains(event.target)) {
        setFiltersOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFiltersOpen(false);
    };

    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [filtersOpen]);

  return (
    <>
      <WorkspaceHeader>
        <WorkspaceHeading
          title={t('nav.ecotrackShipments')}
          meta={t('ordersEcotrackManager.resultCount', { count: props.pagination.total })}
          description={<PendingInline active={props.isRefreshing} label={t('labels.loading')} />}
        />
        <WorkspaceActions>
          <AdminAiAskButton />
          <Button
            type="button"
            variant="outline"
            className="size-10 px-0 sm:h-10 sm:w-auto sm:px-4"
            aria-label={t('ordersEcotrackManager.actions.refreshVisible')}
            onClick={props.onRefreshVisible}
            disabled={!props.items.length}
          >
            <RefreshCw data-icon="inline-start" />
            <span className="hidden whitespace-nowrap sm:inline">
              {t('ordersEcotrackManager.actions.refreshVisible')}
            </span>
          </Button>
          <Button
            type="button"
            onClick={props.onDispatchReady}
            disabled={!dispatchable || !props.writable}
          >
            <Send data-icon="inline-start" />
            {t('ordersEcotrackManager.actions.dispatchReady')}
          </Button>
        </WorkspaceActions>
      </WorkspaceHeader>

      <WorkspaceToolbar
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:gap-3 xl:grid-cols-[minmax(16rem,1fr)_14rem_auto]"
        data-mobile-ecotrack-controls
      >
        <div className="col-span-2 xl:col-span-1">
          <SearchField
            value={props.search}
            placeholder={t('ordersEcotrackManager.searchPlaceholder')}
            onChange={props.onSearchChange}
          />
        </div>
        <NativeSelect
          aria-label={t('ordersEcotrackManager.filters.statusLabel')}
          value={props.statusFilter}
          onChange={(event) => props.onStatusChange(event.target.value)}
        >
          <NativeSelectOption value="all">
            {t('ordersEcotrackManager.filters.allStatuses')}
          </NativeSelectOption>
          {props.statuses.map((status) => (
            <NativeSelectOption key={status} value={status}>
              {t(`ordersEcotrackManager.statuses.${status}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <div ref={filterRef} className="relative min-w-11">
          <button
            type="button"
            aria-expanded={filtersOpen}
            className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted/50"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <MoreHorizontal className="size-4" />
            {t('ordersEcotrackManager.filters.sortKeyLabel')}
          </button>
          {filtersOpen ? (
            <div className="absolute end-0 z-30 mt-2 grid w-[min(22rem,calc(100vw-2rem))] gap-3 rounded-xl border border-border bg-background p-3 shadow-xl">
              <NativeSelect
                value={props.sortKey}
                onChange={(event) =>
                  props.onSortKeyChange(event.target.value as EcotrackShipmentSortKey)
                }
              >
                {(
                  [
                    'createdAt',
                    'trackingNumber',
                    'clientName',
                    'currentStatus',
                    'lastStatusSyncedAt',
                  ] as const
                ).map((key) => (
                  <NativeSelectOption key={key} value={key}>
                    {t(`ordersEcotrackManager.sort.${key}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect
                value={props.sortDirection}
                onChange={(event) =>
                  props.onSortDirectionChange(event.target.value as EcotrackShipmentSortDirection)
                }
              >
                <NativeSelectOption value="desc">
                  {t('ordersEcotrackManager.sort.desc')}
                </NativeSelectOption>
                <NativeSelectOption value="asc">
                  {t('ordersEcotrackManager.sort.asc')}
                </NativeSelectOption>
              </NativeSelect>
              <label className="flex items-center justify-between gap-3 text-sm">
                {t('ordersEcotrackManager.filters.staleOnly')}
                <Switch checked={props.staleOnly} onCheckedChange={props.onStaleOnlyChange} />
              </label>
            </div>
          ) : null}
        </div>
      </WorkspaceToolbar>

      <form
        className="flex gap-2 border-b border-border px-3 py-3 sm:px-4 lg:px-5"
        onSubmit={(event) => {
          event.preventDefault();
          props.onScanSubmit();
        }}
      >
        <Input
          value={props.scanQuery}
          onChange={(event) => props.onScanQueryChange(event.target.value)}
          placeholder={t('ordersEcotrackManager.fields.scanTrackingNumberPlaceholder')}
          aria-label={t('ordersEcotrackManager.fields.scanTrackingNumber')}
        />
        <Button
          type="submit"
          variant="outline"
          aria-label={t('ordersEcotrackManager.actions.scanTrackingNumber')}
          disabled={!props.scanQuery.trim() || props.scanPending || !props.writable}
        >
          <Search data-icon="inline-start" />
          <span className="hidden sm:inline">
            {t('ordersEcotrackManager.actions.scanTrackingNumber')}
          </span>
        </Button>
      </form>

      {props.selectedIds.length ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-3 py-2 sm:px-4 lg:px-5">
          <Badge>{t('labels.bulkSelectionCount', { count: props.selectedIds.length })}</Badge>
          <div className="ms-auto">
            <SplitActionButton
              size="sm"
              variant="outline"
              label={t('ordersEcotrackManager.actions.dispatchSelected')}
              icon={<Send data-icon="inline-start" />}
              onPrimaryClick={props.onDispatchSelected}
              primaryDisabled={!props.writable}
              options={[
                {
                  key: 'refresh-selected',
                  label: t('ordersEcotrackManager.actions.refreshSelected'),
                  onSelect: props.onRefreshSelected,
                },
                {
                  key: 'print-selected',
                  label: t('ordersEcotrackManager.actions.printSelected'),
                  onSelect: props.onPrintSelected,
                },
                {
                  key: 'history-selected',
                  label: t('ordersEcotrackManager.actions.showHistorySelected'),
                  onSelect: props.onShowSelectedHistory,
                },
                {
                  key: 'clear-selection',
                  label: t('ordersEcotrackManager.actions.clearSelection'),
                  onSelect: props.onClearSelection,
                },
              ]}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

function RefinedLedger(props: OrdersEcotrackWorkspaceProps) {
  const t = useTranslations();
  const allSelected =
    props.items.length > 0 && props.items.every((item) => props.selectedIds.includes(item.orderId));

  return (
    <>
      <ScrollableRegion label={t('nav.ecotrackShipments')} className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  aria-label={t('labels.selectAll')}
                  checked={allSelected}
                  onChange={(event) => props.onToggleVisible(event.target.checked)}
                />
              </TableHead>
              <TableHead>{t('ordersEcotrackManager.columns.trackingNumber')}</TableHead>
              <TableHead>{t('ordersEcotrackManager.columns.address')}</TableHead>
              <TableHead>{t('ordersEcotrackManager.columns.products')}</TableHead>
              <TableHead>{t('ordersEcotrackManager.columns.amount')}</TableHead>
              <TableHead>{t('ordersEcotrackManager.columns.status')}</TableHead>
              <TableHead className="w-32 text-end">{t('labels.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.items.map((item) => {
              const expanded = props.inspectedIds.includes(item.orderId);
              const action = props.buildRowActionModel(item, expanded);
              return (
                <Fragment key={item.orderId}>
                  <TableRow className={cn(expanded && 'bg-muted/20')}>
                    <TableCell>
                      <Checkbox
                        aria-label={t('labels.selectRow', { name: item.fullName })}
                        checked={props.selectedIds.includes(item.orderId)}
                        onChange={(event) =>
                          props.onToggleSelected(item.orderId, event.target.checked)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="block w-full text-start"
                        onClick={() => props.onInspect(item.orderId)}
                      >
                        <ShipmentIdentity item={item} locale={props.locale} />
                      </button>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">
                        {[item.city, item.stateName ?? item.state].filter(Boolean).join(' · ')}
                      </p>
                      <p className="mt-1 max-w-64 truncate text-xs text-muted-foreground">
                        {item.homeAddress}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="max-w-72 truncate text-sm">
                        {item.orderProducts
                          .map((product) => `${product.title} ×${product.quantity}`)
                          .join(' · ')}
                      </p>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatEcotrackMoney(props.locale, item.totalAmount)}
                    </TableCell>
                    <TableCell>
                      <EcotrackStatusBadge locale={props.locale} status={item.status} t={t} />
                    </TableCell>
                    <TableCell className="text-end">
                      <ShipmentAction
                        model={action}
                        disabled={(item.canDispatch || item.canAddMaj) && !props.writable}
                      />
                    </TableCell>
                  </TableRow>
                  {expanded ? (
                    <TableRow>
                      <TableCell colSpan={7} className="p-0">
                        <ShipmentInspector
                          item={item}
                          locale={props.locale}
                          action={action}
                          writable={props.writable}
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </ScrollableRegion>
      <div className="divide-y divide-border lg:hidden">
        {props.items.map((item) => {
          const expanded = props.inspectedIds.includes(item.orderId);
          const action = props.buildRowActionModel(item, expanded);
          return (
            <div key={item.orderId}>
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 px-3 py-4 sm:gap-3 sm:px-4">
                <Checkbox
                  aria-label={t('labels.selectRow', { name: item.fullName })}
                  checked={props.selectedIds.includes(item.orderId)}
                  onChange={(event) => props.onToggleSelected(item.orderId, event.target.checked)}
                />
                <button
                  type="button"
                  className="min-w-0 text-start"
                  onClick={() => props.onInspect(item.orderId)}
                >
                  <ShipmentIdentity item={item} locale={props.locale} />
                  <div className="mt-2 flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                    <Badge
                      variant="outline"
                      className="max-w-full truncate whitespace-nowrap normal-case tracking-normal"
                      title={t(`ordersEcotrackManager.statuses.${item.status.currentStatus}`)}
                    >
                      {t(`ordersEcotrackManager.statuses.${item.status.currentStatus}`)}
                    </Badge>
                    <span className="text-sm font-semibold">
                      {formatEcotrackMoney(props.locale, item.totalAmount)}
                    </span>
                  </div>
                </button>
                <ShipmentAction
                  model={action}
                  disabled={(item.canDispatch || item.canAddMaj) && !props.writable}
                />
              </div>
              {expanded ? (
                <ShipmentInspector
                  item={item}
                  locale={props.locale}
                  action={action}
                  writable={props.writable}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

function SplitDesk(props: OrdersEcotrackWorkspaceProps) {
  const t = useTranslations();
  const activeId = props.inspectedIds.at(-1) ?? props.items[0]?.orderId;
  const active = props.items.find((item) => item.orderId === activeId) ?? props.items[0];
  const mobileActiveId = props.inspectedIds.at(-1);

  return (
    <>
      <div className="hidden min-h-[38rem] xl:grid xl:grid-cols-[minmax(20rem,0.72fr)_minmax(0,1.28fr)]">
        <div className="border-e border-border">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
            <Checkbox
              aria-label={t('labels.selectAll')}
              checked={
                props.items.length > 0 &&
                props.items.every((item) => props.selectedIds.includes(item.orderId))
              }
              onChange={(event) => props.onToggleVisible(event.target.checked)}
            />
            <span className="px-3">{t('ordersEcotrackManager.columns.trackingNumber')}</span>
            <span>{t('ordersEcotrackManager.columns.amount')}</span>
          </div>
          <div className="divide-y divide-border">
            {props.items.map((item) => {
              const selected = active?.orderId === item.orderId;
              return (
                <div
                  key={item.orderId}
                  className={cn(
                    'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3',
                    selected && 'bg-primary/8',
                  )}
                >
                  <Checkbox
                    aria-label={t('labels.selectRow', { name: item.fullName })}
                    checked={props.selectedIds.includes(item.orderId)}
                    onChange={(event) => props.onToggleSelected(item.orderId, event.target.checked)}
                  />
                  <button
                    type="button"
                    className="min-w-0 text-start"
                    onClick={() => props.onInspect(item.orderId)}
                  >
                    <ShipmentIdentity item={item} locale={props.locale} compact />
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="outline">
                        {t(`ordersEcotrackManager.statuses.${item.status.currentStatus}`)}
                      </Badge>
                      {item.status.isStatusStale ? (
                        <Badge variant="outline">{t('ordersEcotrackManager.staleBadge')}</Badge>
                      ) : null}
                    </div>
                  </button>
                  <div className="text-end">
                    <p className="text-sm font-semibold">
                      {formatEcotrackMoney(props.locale, item.totalAmount)}
                    </p>
                    <ChevronRight className="ms-auto mt-2 size-4 text-muted-foreground" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="min-w-0 bg-muted/5">
          {active ? (
            <ShipmentInspector
              item={active}
              locale={props.locale}
              action={props.buildRowActionModel(active, true)}
              writable={props.writable}
            />
          ) : null}
        </div>
      </div>

      <div className="xl:hidden">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
          <Checkbox
            aria-label={t('labels.selectAll')}
            checked={
              props.items.length > 0 &&
              props.items.every((item) => props.selectedIds.includes(item.orderId))
            }
            onChange={(event) => props.onToggleVisible(event.target.checked)}
          />
          <span className="px-3">{t('ordersEcotrackManager.columns.trackingNumber')}</span>
        </div>
        <div className="divide-y divide-border">
          {props.items.map((item) => {
            const selected = mobileActiveId === item.orderId;
            const action = props.buildRowActionModel(item, selected);
            return (
              <Fragment key={item.orderId}>
                <div
                  className={cn(
                    'grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-3 py-3',
                    selected && 'bg-primary/8',
                  )}
                >
                  <Checkbox
                    aria-label={t('labels.selectRow', { name: item.fullName })}
                    checked={props.selectedIds.includes(item.orderId)}
                    onChange={(event) => props.onToggleSelected(item.orderId, event.target.checked)}
                  />
                  <button
                    type="button"
                    className="min-w-0 text-start"
                    onClick={() => props.onInspect(item.orderId)}
                  >
                    <ShipmentIdentity item={item} locale={props.locale} compact />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {t(`ordersEcotrackManager.statuses.${item.status.currentStatus}`)}
                      </Badge>
                      <span className="text-sm font-semibold">
                        {formatEcotrackMoney(props.locale, item.totalAmount)}
                      </span>
                    </div>
                  </button>
                  <ShipmentAction
                    model={action}
                    disabled={(item.canDispatch || item.canAddMaj) && !props.writable}
                  />
                </div>
                {selected ? (
                  <ShipmentInspector
                    item={item}
                    locale={props.locale}
                    action={action}
                    writable={props.writable}
                  />
                ) : null}
              </Fragment>
            );
          })}
        </div>
      </div>
    </>
  );
}

function StatusBoard(props: OrdersEcotrackWorkspaceProps) {
  const t = useTranslations();
  const activeId = props.inspectedIds.at(-1);
  const active = props.items.find((item) => item.orderId === activeId);

  return (
    <>
      <div className="grid divide-y divide-border xl:grid-cols-5 xl:divide-x xl:divide-y-0 rtl:xl:divide-x-reverse">
        {stageDefinitions.map((stage) => {
          const stageItems = props.items.filter((item) =>
            stage.statuses.has(item.status.currentStatus as never),
          );
          return (
            <section key={stage.key} className="min-w-0">
              <header className="flex items-center justify-between border-b border-border px-3 py-3">
                <h2 className="text-sm font-semibold">
                  {t(`ordersEcotrackManager.statuses.${stage.labelStatus}`)}
                </h2>
                <Badge variant="outline">{stageItems.length}</Badge>
              </header>
              <div className="divide-y divide-border">
                {stageItems.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">—</p>
                ) : null}
                {stageItems.map((item) => {
                  const action = props.buildRowActionModel(item, activeId === item.orderId);
                  return (
                    <Fragment key={item.orderId}>
                      <div
                        className={cn(
                          'group px-3 py-3',
                          activeId === item.orderId && 'bg-primary/8',
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <Checkbox
                            aria-label={t('labels.selectRow', { name: item.fullName })}
                            checked={props.selectedIds.includes(item.orderId)}
                            onChange={(event) =>
                              props.onToggleSelected(item.orderId, event.target.checked)
                            }
                          />
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-start"
                            onClick={() => props.onInspect(item.orderId)}
                          >
                            <p className="truncate text-sm font-semibold">{item.fullName}</p>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {item.trackingNumber}
                            </p>
                            <p className="mt-2 text-sm font-medium">
                              {formatEcotrackMoney(props.locale, item.totalAmount)}
                            </p>
                          </button>
                          <ShipmentAction
                            model={action}
                            disabled={(item.canDispatch || item.canAddMaj) && !props.writable}
                          />
                        </div>
                      </div>
                      {activeId === item.orderId ? (
                        <div className="xl:hidden">
                          <ShipmentInspector
                            item={item}
                            locale={props.locale}
                            action={action}
                            writable={props.writable}
                          />
                        </div>
                      ) : null}
                    </Fragment>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {active ? (
        <div className="hidden border-t border-border xl:block">
          <ShipmentInspector
            item={active}
            locale={props.locale}
            action={props.buildRowActionModel(active, true)}
            writable={props.writable}
          />
        </div>
      ) : null}
    </>
  );
}

export function OrdersEcotrackWorkspace(props: OrdersEcotrackWorkspaceProps) {
  const t = useTranslations();

  return (
    <WorkspaceFrame data-ecotrack-variant={props.variant}>
      <EcotrackWorkspaceChrome {...props} />
      {props.isInitialLoading ? (
        <div className="grid gap-3 py-6">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}
      {!props.isInitialLoading && props.error ? (
        <Empty className="my-6 border border-dashed border-border">
          <EmptyHeader>
            <EmptyTitle>{t('ordersEcotrackManager.empty.title')}</EmptyTitle>
            <EmptyDescription>{props.error}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {!props.isInitialLoading && !props.error && props.items.length === 0 ? (
        <Empty className="my-6 border border-dashed border-border">
          <EmptyHeader>
            <EmptyTitle>{t('ordersEcotrackManager.empty.title')}</EmptyTitle>
            <EmptyDescription>{t('ordersEcotrackManager.empty.description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {props.items.length ? (
        <div className={cn('transition-opacity', props.isRefreshing && 'opacity-65')}>
          {props.variant === 2 ? (
            <RefinedLedger {...props} />
          ) : props.variant === 3 ? (
            <SplitDesk {...props} />
          ) : (
            <StatusBoard {...props} />
          )}
        </div>
      ) : null}
      {props.items.length ? (
        <WorkspacePagination
          currentPage={props.pagination.page}
          totalPages={props.pagination.totalPages}
          pending={props.isRefreshing}
          onPageChange={props.onPageChange}
        />
      ) : null}
    </WorkspaceFrame>
  );
}
