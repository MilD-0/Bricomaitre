'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  History,
  MapPin,
  Package,
  Printer,
  RefreshCw,
  Save,
  Search,
  Send,
  Trash2,
  Truck,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { cn } from '../lib/utils';
import { toast } from '../lib/toast';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Checkbox } from './ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from './ui/empty';
import { Field, FieldDescription, FieldGroup, FieldLabel } from './ui/field';
import { Input } from './ui/input';
import { PendingInline, sectionTransitionProps, SurfacePendingOverlay } from './ui/motion';
import { NativeSelect, NativeSelectOption } from './ui/native-select';
import { Skeleton } from './ui/skeleton';
import { Switch } from './ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Textarea } from './ui/textarea';
import { TablePaginationControls } from './table-pagination-controls';

type PaginationMeta = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

type EcotrackCatalogResponse = {
  wilayas: Array<{ wilayaId: number; name: string }>;
  communes: Array<{ communeId: number; wilayaId: number; name: string; postalCode: string | null; hasStopDesk: boolean }>;
  serviceFees: Array<{ serviceType: string; wilayaId: number; homeFee: string; stopDeskFee: string }>;
  weightFees: Array<{ serviceType: string; homeSurcharge: string; stopDeskSurcharge: string; perAdditionalKg: string; startsAtKg: string }>;
  lastSync: Record<string, unknown> | null;
};

type EcotrackStatusSummary = {
  currentStatus: string;
  driverPhone: string | null;
  estimatedFee: number | null;
  deskPhone: string | null;
  deskCommune: string | null;
  deskMapLink: string | null;
  deskAddress: string | null;
  lastStatusSyncedAt: string | null;
  lastTrackingSyncedAt: string | null;
  lastMajSyncedAt: string | null;
  isStatusStale: boolean;
  isTrackingStale: boolean;
  isMajStale: boolean;
};

type EcotrackMajEntry = {
  id: number;
  remarque: string;
  station: string | null;
  livreur: string | null;
  remoteCreatedAt: string;
};

type EcotrackTrackingEvent = {
  id: number;
  eventDate: string;
  eventTime: string;
  status: string;
  scanLocation: string | null;
};

type OrderProductSummary = {
  title: string;
  quantity: number;
  lineTotal: number;
};

type EcotrackShipmentListItem = {
  orderId: number;
  reference: string;
  trackingNumber: string;
  createdAt: string;
  updatedAt: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  phoneNumber1: string;
  phoneNumber2: string | null;
  delivery: 0 | 1;
  deliveryLabel: 'home' | 'office';
  state: number | null;
  stateName: string | null;
  city: string | null;
  homeAddress: string | null;
  orderProducts: OrderProductSummary[];
  productSubtotal: number;
  deliveryFee: number;
  totalAmount: number;
  note: string | null;
  status: EcotrackStatusSummary;
  canEdit: boolean;
  canDelete: boolean;
  canDispatch: boolean;
  canAddMaj: boolean;
  canAskReturn: boolean;
  canPrintLabel: boolean;
};

type EcotrackShipmentDetail = EcotrackShipmentListItem & {
  majEntries: EcotrackMajEntry[];
  trackingEvents: EcotrackTrackingEvent[];
};

type EcotrackShipmentsResponse = {
  items: EcotrackShipmentListItem[];
  writable: boolean;
  pagination: PaginationMeta;
};

type EcotrackShipmentDetailResponse = {
  item: EcotrackShipmentDetail;
};

type SortKey = 'createdAt' | 'trackingNumber' | 'clientName' | 'currentStatus' | 'lastStatusSyncedAt';
type SortDirection = 'asc' | 'desc';

type OrdersEcotrackManagerProps = {
  initialOrders?: EcotrackShipmentsResponse;
  initialCatalog?: EcotrackCatalogResponse;
};

type EditDialogState = {
  orderId: number;
  firstName: string;
  lastName: string;
  phoneNumber1: string;
  phoneNumber2: string;
  delivery: 0 | 1;
  state: string;
  city: string;
  homeAddress: string;
  note: string;
};

type DispatchDialogState = {
  orderIds: number[];
  label: string;
  count: number;
  askCollection: boolean;
};

type DeleteDialogState = {
  orderId: number;
  fullName: string;
};

type MajDialogState = {
  orderId: number;
  fullName: string;
  content: string;
};

const ECOTRACK_STATUSES = [
  'prete_a_expedier',
  'en_ramassage',
  'en_preparation_stock',
  'vers_hub',
  'en_hub',
  'vers_wilaya',
  'en_preparation',
  'en_livraison',
  'suspendu',
  'livre_non_encaisse',
  'encaisse_non_paye',
  'paiements_prets',
  'paye_et_archive',
  'retour_chez_livreur',
  'retour_transit_entrepot',
  'retour_en_traitement',
  'retour_recu',
  'retour_archive',
  'annule',
] as const;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text || response.statusText;

    try {
      const payload = JSON.parse(text) as { error?: string };
      message = payload.error || message;
    } catch {}

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

async function requestPdf(url: string, init?: RequestInit) {
  const response = await fetch(url, init);

  if (!response.ok) {
    const text = await response.text();
    let message = text || response.statusText;

    try {
      const payload = JSON.parse(text) as { error?: string };
      message = payload.error || message;
    } catch {}

    throw new Error(message);
  }

  return response.blob();
}

type SplitActionOption = {
  key: string;
  label: string;
  onSelect: () => void | Promise<void>;
  disabled?: boolean;
};

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full max-w-sm">
      <Input className="pl-10" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function SplitActionButton({
  label,
  icon,
  onPrimaryClick,
  primaryVariant = 'outline',
  primaryDisabled = false,
  options,
}: {
  label: string;
  icon?: React.ReactNode;
  onPrimaryClick: () => void | Promise<void>;
  primaryVariant?: 'default' | 'outline';
  primaryDisabled?: boolean;
  options: SplitActionOption[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (options.length === 0) {
    return (
      <Button
        type="button"
        size="sm"
        variant={primaryVariant}
        disabled={primaryDisabled}
        onClick={() => void onPrimaryClick()}
      >
        {icon}
        {label}
      </Button>
    );
  }

  return (
    <div ref={containerRef} className="relative inline-flex">
      <Button
        type="button"
        size="sm"
        variant={primaryVariant}
        disabled={primaryDisabled}
        className="rounded-r-none border-r border-border/70"
        onClick={() => void onPrimaryClick()}
      >
        {icon}
        {label}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={primaryVariant}
        aria-label={`${label} menu`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-l-none px-3"
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronDown className="size-4" />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 min-w-48 rounded-2xl border border-border/70 bg-background p-1 shadow-[var(--shadow-vapor)]"
        >
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              role="menuitem"
              disabled={option.disabled}
              className={cn(
                'flex w-full rounded-xl px-3 py-2 text-left text-sm transition-colors',
                option.disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted/60',
              )}
              onClick={() => {
                setOpen(false);
                void option.onSelect();
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatPhoneForDisplay(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return '';
  }

  return trimmed.startsWith('0') ? trimmed : `0${trimmed}`;
}

function openPdfBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

function formatDateTime(locale: string, value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatMoney(locale: string, value: number | null | undefined) {
  if (value == null) {
    return '0.00';
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 2,
  }).format(value);
}

function getDeliveryLabelKey(value: 0 | 1) {
  return value === 1 ? 'ordersManager.delivery.office' : 'ordersManager.delivery.home';
}

function getTrackingHistoryStatusLabel(
  status: string,
  t: ReturnType<typeof useTranslations>,
) {
  const normalized = status.trim().toLowerCase();
  const knownStatuses = new Set([
    'order_information_received_by_carrier',
    'picked',
    'accepted_by_carrier',
    'dispatched_to_driver',
    'attempt_delivery',
    'return_asked',
    'return_in_transit',
    'return_received',
    'livred',
    'encaissed',
    'payed',
  ]);

  if (!knownStatuses.has(normalized)) {
    return status;
  }

  return t(`ordersEcotrackManager.historyStatuses.${normalized}`);
}

function StatusBadge({
  locale,
  status,
  t,
}: {
  locale: string;
  status: EcotrackStatusSummary;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{t(`ordersEcotrackManager.statuses.${status.currentStatus}`)}</Badge>
        {(status.isStatusStale || status.isTrackingStale || status.isMajStale) ? (
          <Badge variant="outline">{t('ordersEcotrackManager.staleBadge')}</Badge>
        ) : null}
      </div>
      {status.driverPhone ? (
        <p className="text-sm text-muted-foreground">
          {t('ordersEcotrackManager.driverPhone')}: {formatPhoneForDisplay(status.driverPhone)}
        </p>
      ) : null}
      {status.estimatedFee !== null ? (
        <p className="text-sm text-muted-foreground">
          {t('ordersEcotrackManager.estimatedFee')}: {formatMoney(locale, status.estimatedFee)}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t('ordersEcotrackManager.lastSync')}: {formatDateTime(locale, status.lastStatusSyncedAt) ?? t('ordersEcotrackManager.neverSynced')}
      </p>
    </div>
  );
}

function ShipmentHistoryPanel({
  locale,
  orderId,
  enabled,
}: {
  locale: string;
  orderId: number;
  enabled: boolean;
}) {
  const t = useTranslations();
  const detailQuery = useQuery({
    queryKey: ['ecotrack-shipment-detail', orderId],
    queryFn: () => requestJson<EcotrackShipmentDetailResponse>(`/api/orders/ecotrack/shipments/${orderId}`),
    enabled,
    staleTime: 30_000,
  });

  if (!enabled) {
    return null;
  }

  if (detailQuery.isPending) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-16 w-full" />
        </Card>
        <Card className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-16 w-full" />
        </Card>
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data?.item) {
    return (
      <Empty className="rounded-[1rem] border border-dashed border-border/70 bg-muted/10">
        <EmptyHeader>
          <EmptyTitle>{t('ordersEcotrackManager.history.title')}</EmptyTitle>
          <EmptyDescription>{detailQuery.error instanceof Error ? detailQuery.error.message : t('ordersEcotrackManager.history.empty')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const item = detailQuery.data.item;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Card className="flex flex-col gap-3 border border-border/70 bg-background/90 shadow-none">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t('ordersEcotrackManager.summaryTitle')}</h3>
          <Badge variant="outline">{t(`ordersEcotrackManager.statuses.${item.status.currentStatus}`)}</Badge>
        </div>
        <div className="grid gap-2 text-sm text-muted-foreground">
          <p>{t('ordersEcotrackManager.lastSync')}: {formatDateTime(locale, item.status.lastStatusSyncedAt) ?? t('ordersEcotrackManager.neverSynced')}</p>
          <p>{t('ordersEcotrackManager.lastTrackingSync')}: {formatDateTime(locale, item.status.lastTrackingSyncedAt) ?? t('ordersEcotrackManager.neverSynced')}</p>
          <p>{t('ordersEcotrackManager.lastMajSync')}: {formatDateTime(locale, item.status.lastMajSyncedAt) ?? t('ordersEcotrackManager.neverSynced')}</p>
          {item.status.driverPhone ? <p>{t('ordersEcotrackManager.driverPhone')}: {formatPhoneForDisplay(item.status.driverPhone)}</p> : null}
          {item.status.deskPhone ? <p>{t('ordersEcotrackManager.deskPhone')}: {formatPhoneForDisplay(item.status.deskPhone)}</p> : null}
          {item.status.deskCommune ? <p>{t('ordersEcotrackManager.deskCommune')}: {item.status.deskCommune}</p> : null}
          {item.status.deskAddress ? <p>{t('ordersEcotrackManager.deskAddress')}: {item.status.deskAddress}</p> : null}
          {item.status.estimatedFee !== null ? <p>{t('ordersEcotrackManager.estimatedFee')}: {formatMoney(locale, item.status.estimatedFee)}</p> : null}
        </div>
      </Card>

      <div className="grid gap-4">
        <Card className="border border-border/70 bg-background/90 shadow-none">
          <div className="mb-3 flex items-center gap-2">
            <History />
            <h3 className="text-sm font-semibold">{t('ordersEcotrackManager.history.majTitle')}</h3>
          </div>
          <div className="flex flex-col gap-3">
            {item.majEntries.length === 0 ? <p className="text-sm text-muted-foreground">{t('ordersEcotrackManager.history.emptyMaj')}</p> : null}
            {item.majEntries.map((entry) => (
              <div key={entry.id} className="rounded-[1rem] border border-border/70 bg-muted/10 p-3 text-sm">
                <p className="font-medium">{entry.remarque}</p>
                <p className="mt-1 text-muted-foreground">{formatDateTime(locale, entry.remoteCreatedAt) ?? entry.remoteCreatedAt}</p>
                {(entry.station || entry.livreur) ? (
                  <p className="mt-1 text-muted-foreground">
                    {[entry.station, entry.livreur].filter(Boolean).join(' • ')}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </Card>

        <Card className="border border-border/70 bg-background/90 shadow-none">
          <div className="mb-3 flex items-center gap-2">
            <Truck />
            <h3 className="text-sm font-semibold">{t('ordersEcotrackManager.history.timelineTitle')}</h3>
          </div>
          <div className="flex flex-col gap-3">
            {item.trackingEvents.length === 0 ? <p className="text-sm text-muted-foreground">{t('ordersEcotrackManager.history.emptyTimeline')}</p> : null}
            {item.trackingEvents.map((entry) => (
              <div key={entry.id} className="rounded-[1rem] border border-border/70 bg-muted/10 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{getTrackingHistoryStatusLabel(entry.status, t)}</Badge>
                  <span className="text-muted-foreground">{entry.eventDate} {entry.eventTime}</span>
                </div>
                {entry.scanLocation ? <p className="mt-2 text-muted-foreground">{entry.scanLocation}</p> : null}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function OrdersEcotrackTableSkeleton() {
  return (
    <div className="hidden overflow-x-auto lg:block">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: 8 }).map((_, index) => (
              <TableHead key={index}><Skeleton className="h-4 w-24" /></TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, rowIndex) => (
            <TableRow key={rowIndex}>
              {Array.from({ length: 8 }).map((__, cellIndex) => (
                <TableCell key={cellIndex}><Skeleton className="h-16 w-full" /></TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function OrdersEcotrackMobileSkeleton() {
  return (
    <div className="grid gap-4 p-4 lg:hidden">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="flex flex-col gap-3 border border-border/70 bg-background/90 shadow-none">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-20 w-full" />
        </Card>
      ))}
    </div>
  );
}

export function OrdersEcotrackManager({
  initialOrders,
  initialCatalog,
}: OrdersEcotrackManagerProps) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(initialOrders?.pagination.page ?? 1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [staleOnly, setStaleOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [expandedIds, setExpandedIds] = useState<number[]>([]);
  const [editDialog, setEditDialog] = useState<EditDialogState | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
  const [dispatchDialog, setDispatchDialog] = useState<DispatchDialogState | null>(null);
  const [majDialog, setMajDialog] = useState<MajDialogState | null>(null);
  const [isFilterPending, startFilterTransition] = useTransition();
  const autoRefreshKeyRef = useRef<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const deferredStatusFilter = useDeferredValue(statusFilter);
  const deferredStaleOnly = useDeferredValue(staleOnly);
  const [initialOrdersUpdatedAt] = useState(() => (initialOrders ? Date.now() : 0));
  const [initialCatalogUpdatedAt] = useState(() => (initialCatalog ? Date.now() : 0));

  const shipmentsQuery = useQuery({
    queryKey: ['ecotrack-shipments', page, deferredSearch, deferredStatusFilter, deferredStaleOnly, sortKey, sortDirection],
    queryFn: () => requestJson<EcotrackShipmentsResponse>(
      `/api/orders/ecotrack/shipments?page=${page}&limit=25&search=${encodeURIComponent(deferredSearch)}&status=${encodeURIComponent(deferredStatusFilter)}&staleOnly=${deferredStaleOnly ? 'true' : 'false'}&sortKey=${sortKey}&sortDirection=${sortDirection}`,
    ),
    initialData: initialOrders,
    initialDataUpdatedAt: initialOrdersUpdatedAt,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const catalogQuery = useQuery({
    queryKey: ['ecotrack-catalog'],
    queryFn: () => requestJson<EcotrackCatalogResponse>('/api/ecotrack/catalog'),
    initialData: initialCatalog,
    initialDataUpdatedAt: initialCatalogUpdatedAt,
    staleTime: 300_000,
  });

  const invalidateShipmentQueries = async (orderId?: number) => {
    await queryClient.invalidateQueries({ queryKey: ['ecotrack-shipments'] });
    if (orderId) {
      await queryClient.invalidateQueries({ queryKey: ['ecotrack-shipment-detail', orderId] });
    }
  };

  const refreshManyMutation = useMutation({
    mutationFn: async ({ orderIds, silent }: { orderIds: number[]; silent?: boolean }) => {
      return requestJson<{ ok: true; items: EcotrackShipmentDetail[] }>('/api/orders/ecotrack/shipments/refresh', {
        method: 'POST',
        body: JSON.stringify({ orderIds }),
      });
    },
    onMutate: (variables) => ({
      toastId: variables.silent ? null : toast.loading(t('ordersEcotrackManager.notifications.refresh.loading')),
    }),
    onSuccess: async (_response, variables, context) => {
      if (!variables.silent && context?.toastId) {
        toast.success(t('ordersEcotrackManager.notifications.refresh.success'), { id: context.toastId });
      }
      await invalidateShipmentQueries();
    },
    onError: (error, variables, context) => {
      if (!variables.silent && context?.toastId) {
        toast.error(error.message || t('ordersEcotrackManager.notifications.refresh.error'), { id: context.toastId });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ orderId, payload }: { orderId: number; payload: Record<string, unknown> }) => requestJson<{ ok: true; item: EcotrackShipmentDetail }>(`/api/orders/ecotrack/shipments/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
    onMutate: () => ({ toastId: toast.loading(t('ordersEcotrackManager.notifications.update.loading')) }),
    onSuccess: async (_response, variables, context) => {
      toast.success(t('ordersEcotrackManager.notifications.update.success'), { id: context?.toastId });
      setEditDialog(null);
      await invalidateShipmentQueries(variables.orderId);
    },
    onError: (error, _variables, context) => {
      toast.error(error.message || t('ordersEcotrackManager.notifications.update.error'), { id: context?.toastId });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (orderId: number) => requestJson<{ ok: true }>(`/api/orders/ecotrack/shipments/${orderId}`, { method: 'DELETE' }),
    onMutate: () => ({ toastId: toast.loading(t('ordersEcotrackManager.notifications.delete.loading')) }),
    onSuccess: async (_response, orderId, context) => {
      toast.success(t('ordersEcotrackManager.notifications.delete.success'), { id: context?.toastId });
      setDeleteDialog(null);
      setSelectedIds((current) => current.filter((entry) => entry !== orderId));
      setExpandedIds((current) => current.filter((entry) => entry !== orderId));
      await invalidateShipmentQueries(orderId);
      await queryClient.invalidateQueries({ queryKey: ['orders-table'] });
    },
    onError: (error, _variables, context) => {
      toast.error(error.message || t('ordersEcotrackManager.notifications.delete.error'), { id: context?.toastId });
    },
  });

  const dispatchMutation = useMutation({
    mutationFn: async ({ orderIds, askCollection }: { orderIds: number[]; askCollection: boolean }) => {
      const results: Array<{ orderId: number; ok: boolean; error?: string }> = [];

      for (const orderId of orderIds) {
        try {
          await requestJson<{ ok: true; item: EcotrackShipmentDetail }>(`/api/orders/ecotrack/shipments/${orderId}/dispatch`, {
            method: 'POST',
            body: JSON.stringify({ askCollection }),
          });
          results.push({ orderId, ok: true });
        } catch (error) {
          results.push({ orderId, ok: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }

      const failed = results.filter((entry) => !entry.ok);
      if (failed.length === orderIds.length) {
        throw new Error(failed[0]?.error ?? t('ordersEcotrackManager.notifications.dispatch.error'));
      }

      return {
        results,
        failed,
      };
    },
    onMutate: () => ({ toastId: toast.loading(t('ordersEcotrackManager.notifications.dispatch.loading')) }),
    onSuccess: async (response, variables, context) => {
      if (response.failed.length > 0) {
        toast.success(t('ordersEcotrackManager.notifications.dispatch.partial', {
          successCount: variables.orderIds.length - response.failed.length,
          failedCount: response.failed.length,
        }), { id: context?.toastId });
      } else {
        toast.success(t('ordersEcotrackManager.notifications.dispatch.success'), { id: context?.toastId });
      }
      setDispatchDialog(null);
      await invalidateShipmentQueries();
      await queryClient.invalidateQueries({ queryKey: ['orders-table'] });
    },
    onError: (error, _variables, context) => {
      toast.error(error.message || t('ordersEcotrackManager.notifications.dispatch.error'), { id: context?.toastId });
    },
  });

  const majMutation = useMutation({
    mutationFn: ({ orderId, content }: { orderId: number; content: string }) => requestJson<{ ok: true; item: EcotrackShipmentDetail }>(`/api/orders/ecotrack/shipments/${orderId}/maj`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
    onMutate: () => ({ toastId: toast.loading(t('ordersEcotrackManager.notifications.maj.loading')) }),
    onSuccess: async (_response, variables, context) => {
      toast.success(t('ordersEcotrackManager.notifications.maj.success'), { id: context?.toastId });
      setMajDialog(null);
      await invalidateShipmentQueries(variables.orderId);
    },
    onError: (error, _variables, context) => {
      toast.error(error.message || t('ordersEcotrackManager.notifications.maj.error'), { id: context?.toastId });
    },
  });

  const returnMutation = useMutation({
    mutationFn: (orderId: number) => requestJson<{ ok: true; item: EcotrackShipmentDetail }>(`/api/orders/ecotrack/shipments/${orderId}/return`, { method: 'POST' }),
    onMutate: () => ({ toastId: toast.loading(t('ordersEcotrackManager.notifications.return.loading')) }),
    onSuccess: async (_response, orderId, context) => {
      toast.success(t('ordersEcotrackManager.notifications.return.success'), { id: context?.toastId });
      await invalidateShipmentQueries(orderId);
    },
    onError: (error, _orderId, context) => {
      toast.error(error.message || t('ordersEcotrackManager.notifications.return.error'), { id: context?.toastId });
    },
  });

  const bulkLabelsMutation = useMutation({
    mutationFn: async (orderIds: number[]) => requestPdf('/api/orders/ecotrack/shipments/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderIds }),
    }),
    onMutate: () => ({ toastId: toast.loading(t('ordersEcotrackManager.notifications.labels.loading')) }),
    onSuccess: (blob, _orderIds, context) => {
      openPdfBlob(blob);
      toast.success(t('ordersEcotrackManager.notifications.labels.success'), { id: context?.toastId });
    },
    onError: (error, _orderIds, context) => {
      toast.error(error.message || t('ordersEcotrackManager.notifications.labels.error'), { id: context?.toastId });
    },
  });

  const items = shipmentsQuery.data?.items ?? [];
  const writable = shipmentsQuery.data?.writable ?? false;
  const pagination = shipmentsQuery.data?.pagination ?? {
    page: 1,
    limit: 25,
    totalItems: 0,
    totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
  };
  const selectedShipments = useMemo(() => {
    const selectedIdSet = new Set(selectedIds);
    const selectedShipmentById = new Map<number, EcotrackShipmentListItem>();

    queryClient.getQueriesData<EcotrackShipmentsResponse>({ queryKey: ['ecotrack-shipments'] }).forEach(([, data]) => {
      data?.items.forEach((item) => {
        if (selectedIdSet.has(item.orderId) && !selectedShipmentById.has(item.orderId)) {
          selectedShipmentById.set(item.orderId, item);
        }
      });
    });

    return selectedIds
      .map((orderId) => selectedShipmentById.get(orderId))
      .filter((item): item is EcotrackShipmentListItem => item !== undefined);
  }, [queryClient, selectedIds, shipmentsQuery.data]);
  const visibleSelectedIds = selectedIds.filter((orderId) => items.some((item) => item.orderId === orderId));
  const allVisibleSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.orderId));
  const isInitialLoading = !shipmentsQuery.data && shipmentsQuery.isPending;
  const showRefreshingProgress = shipmentsQuery.isFetching && !isInitialLoading;

  useEffect(() => {
    if (page !== pagination.page && !shipmentsQuery.isFetching) {
      queueMicrotask(() => setPage(pagination.page));
    }
  }, [page, pagination.page, shipmentsQuery.isFetching]);

  useEffect(() => {
    const staleVisibleIds = items
      .filter((item) => item.status.isStatusStale || item.status.isTrackingStale || item.status.isMajStale)
      .map((item) => item.orderId)
      .sort((left, right) => left - right);

    if (staleVisibleIds.length === 0) {
      autoRefreshKeyRef.current = null;
      return;
    }

    const key = staleVisibleIds.join(',');
    if (autoRefreshKeyRef.current === key || refreshManyMutation.isPending) {
      return;
    }

    autoRefreshKeyRef.current = key;
    refreshManyMutation.mutate({ orderIds: staleVisibleIds, silent: true });
  }, [items, refreshManyMutation]);

  const communeOptions = useMemo(() => {
    if (!editDialog?.state || !catalogQuery.data) {
      return [];
    }

    const wilayaId = Number.parseInt(editDialog.state, 10);
    if (!Number.isInteger(wilayaId)) {
      return [];
    }

    return catalogQuery.data.communes.filter((entry) => entry.wilayaId === wilayaId);
  }, [catalogQuery.data, editDialog?.state]);

  const handleSaveEdit = async () => {
    if (!editDialog) {
      return;
    }

    await updateMutation.mutateAsync({
      orderId: editDialog.orderId,
      payload: {
        firstName: editDialog.firstName,
        lastName: editDialog.lastName,
        phoneNumber1: editDialog.phoneNumber1,
        phoneNumber2: editDialog.phoneNumber2 || null,
        delivery: editDialog.delivery,
        state: editDialog.state ? Number.parseInt(editDialog.state, 10) : null,
        city: editDialog.city,
        homeAddress: editDialog.homeAddress,
        note: editDialog.note || null,
      },
    });
  };

  const handleBulkRefresh = async () => {
    if (selectedIds.length === 0) {
      return;
    }

    await refreshManyMutation.mutateAsync({ orderIds: selectedIds });
  };

  const dispatchableVisibleIds = items.filter((item) => item.canDispatch).map((item) => item.orderId);
  const dispatchableSelectedIds = selectedShipments.filter((item) => item.canDispatch).map((item) => item.orderId);

  const toggleHistoryForIds = (orderIds: number[]) => {
    if (orderIds.length === 0) {
      return;
    }

    setExpandedIds((current) => {
      const allExpanded = orderIds.every((orderId) => current.includes(orderId));
      return allExpanded
        ? current.filter((orderId) => !orderIds.includes(orderId))
        : [...new Set([...current, ...orderIds])];
    });
  };

  const openDispatchDialog = (orderIds: number[], label: string) => {
    if (orderIds.length === 0) {
      return;
    }

    setDispatchDialog({
      orderIds,
      label,
      count: orderIds.length,
      askCollection: false,
    });
  };

  const handleBulkLabels = async () => {
    if (selectedIds.length === 0) {
      return;
    }

    await bulkLabelsMutation.mutateAsync(selectedIds);
  };

  return (
    <>
      <motion.section
        id="orders-ecotrack"
        className="scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 shadow-sm"
        {...sectionTransitionProps}
      >
        <div className="border-b border-border/70 bg-linear-to-b from-background to-muted/20 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold">{t('nav.ecotrackShipments')}</h2>
              <PendingInline active={isFilterPending || shipmentsQuery.isFetching} label={t('labels.loading')} />
            </div>

            <div className="rounded-[1.5rem] border border-border/70 bg-background/90 p-3">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                  <SearchField
                    value={search}
                    placeholder={t('ordersEcotrackManager.searchPlaceholder')}
                    onChange={(value) => {
                      startFilterTransition(() => {
                        setPage(1);
                        setSearch(value);
                      });
                    }}
                  />
                  <NativeSelect
                    aria-label={t('ordersEcotrackManager.filters.statusLabel')}
                    className="w-full xl:w-56"
                    value={statusFilter}
                    onChange={(event) => {
                      startFilterTransition(() => {
                        setPage(1);
                        setStatusFilter(event.target.value);
                      });
                    }}
                  >
                    <NativeSelectOption value="all">{t('ordersEcotrackManager.filters.allStatuses')}</NativeSelectOption>
                    {ECOTRACK_STATUSES.map((status) => (
                      <NativeSelectOption key={status} value={status}>{t(`ordersEcotrackManager.statuses.${status}`)}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    aria-label={t('ordersEcotrackManager.filters.sortKeyLabel')}
                    className="w-full xl:w-56"
                    value={sortKey}
                    onChange={(event) => {
                      startFilterTransition(() => {
                        setPage(1);
                        setSortKey(event.target.value as SortKey);
                      });
                    }}
                  >
                    <NativeSelectOption value="createdAt">{t('ordersEcotrackManager.sort.createdAt')}</NativeSelectOption>
                    <NativeSelectOption value="trackingNumber">{t('ordersEcotrackManager.sort.trackingNumber')}</NativeSelectOption>
                    <NativeSelectOption value="clientName">{t('ordersEcotrackManager.sort.clientName')}</NativeSelectOption>
                    <NativeSelectOption value="currentStatus">{t('ordersEcotrackManager.sort.currentStatus')}</NativeSelectOption>
                    <NativeSelectOption value="lastStatusSyncedAt">{t('ordersEcotrackManager.sort.lastStatusSyncedAt')}</NativeSelectOption>
                  </NativeSelect>
                  <NativeSelect
                    aria-label={t('ordersEcotrackManager.filters.sortDirectionLabel')}
                    className="w-full xl:w-44"
                    value={sortDirection}
                    onChange={(event) => {
                      startFilterTransition(() => {
                        setPage(1);
                        setSortDirection(event.target.value as SortDirection);
                      });
                    }}
                  >
                    <NativeSelectOption value="desc">{t('ordersEcotrackManager.sort.desc')}</NativeSelectOption>
                    <NativeSelectOption value="asc">{t('ordersEcotrackManager.sort.asc')}</NativeSelectOption>
                  </NativeSelect>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline">{t('labels.bulkSelectionCount', { count: selectedIds.length })}</Badge>
                  <Field orientation="horizontal" className="gap-3">
                    <FieldLabel htmlFor="ecotrack-stale-only">{t('ordersEcotrackManager.filters.staleOnly')}</FieldLabel>
                    <Switch
                      id="ecotrack-stale-only"
                      checked={staleOnly}
                      onCheckedChange={(checked) => {
                        startFilterTransition(() => {
                          setPage(1);
                          setStaleOnly(checked);
                        });
                      }}
                    />
                  </Field>
                </div>

                <div className="flex flex-wrap gap-2">
                  <SplitActionButton
                    label={t('ordersEcotrackManager.actions.refreshVisible')}
                    icon={<RefreshCw data-icon="inline-start" />}
                    primaryDisabled={items.length === 0}
                    onPrimaryClick={() => refreshManyMutation.mutate({ orderIds: items.map((item) => item.orderId) })}
                    options={[
                      {
                        key: 'refresh-selected',
                        label: t('ordersEcotrackManager.actions.refreshSelected'),
                        disabled: selectedIds.length === 0,
                        onSelect: () => refreshManyMutation.mutate({ orderIds: selectedIds }),
                      },
                    ]}
                  />
                  <Button type="button" variant="outline" disabled={selectedIds.length === 0} onClick={() => void handleBulkLabels()}>
                    <Printer data-icon="inline-start" />
                    {t('ordersEcotrackManager.actions.printSelected')}
                  </Button>
                  <Button type="button" variant="outline" disabled={selectedIds.length === 0} onClick={() => setSelectedIds([])}>
                    {t('ordersEcotrackManager.actions.clearSelection')}
                  </Button>
                  <SplitActionButton
                    label={t('ordersEcotrackManager.actions.dispatchReady')}
                    icon={<Send data-icon="inline-start" />}
                    primaryDisabled={dispatchableVisibleIds.length === 0 || !writable}
                    onPrimaryClick={() => openDispatchDialog(dispatchableVisibleIds, t('ordersEcotrackManager.actions.dispatchReady'))}
                    options={[
                      {
                        key: 'dispatch-selected',
                        label: t('ordersEcotrackManager.actions.dispatchSelected'),
                        disabled: dispatchableSelectedIds.length === 0 || !writable,
                        onSelect: () => openDispatchDialog(dispatchableSelectedIds, t('ordersEcotrackManager.actions.dispatchSelected')),
                      },
                    ]}
                  />
                  <SplitActionButton
                    label={t('ordersEcotrackManager.actions.showHistorySelected')}
                    icon={<History data-icon="inline-start" />}
                    primaryDisabled={selectedIds.length === 0}
                    onPrimaryClick={() => toggleHistoryForIds(selectedIds)}
                    options={[
                      {
                        key: 'history-visible',
                        label: t('ordersEcotrackManager.actions.showHistoryVisible'),
                        disabled: items.length === 0,
                        onSelect: () => toggleHistoryForIds(items.map((item) => item.orderId)),
                      },
                    ]}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative" aria-busy={showRefreshingProgress}>
          <div className={cn('transition-[opacity,filter] duration-200', showRefreshingProgress && 'opacity-70')}>
        {isInitialLoading ? (
          <>
            <OrdersEcotrackTableSkeleton />
            <OrdersEcotrackMobileSkeleton />
          </>
        ) : null}

        {!isInitialLoading ? (
          <>
            {shipmentsQuery.isError ? (
              <div className="px-4 pb-4 sm:px-5">
                <Empty className="rounded-[1.5rem] border border-dashed border-border/70 bg-muted/20">
                  <EmptyHeader>
                    <EmptyTitle>{t('ordersEcotrackManager.empty.title')}</EmptyTitle>
                    <EmptyDescription>{shipmentsQuery.error.message}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            ) : null}

            {!shipmentsQuery.isError && items.length === 0 ? (
              <div className="px-4 pb-4 sm:px-5">
                <Empty className="rounded-[1.5rem] border border-dashed border-border/70 bg-muted/20">
                  <EmptyHeader>
                    <EmptyTitle>{t('ordersEcotrackManager.empty.title')}</EmptyTitle>
                    <EmptyDescription>{t('ordersEcotrackManager.empty.description')}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            ) : null}

            {items.length > 0 ? (
              <>
                <div className="hidden overflow-x-auto lg:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-12">
                          <Checkbox
                            aria-label={t('labels.selectAll')}
                            checked={allVisibleSelected}
                            onChange={(event) => {
                              setSelectedIds((current) =>
                                event.target.checked
                                  ? [...new Set([...current, ...items.map((item) => item.orderId)])]
                                  : current.filter((id) => !items.some((item) => item.orderId === id)),
                              );
                            }}
                          />
                        </TableHead>
                        <TableHead className="min-w-44">{t('ordersEcotrackManager.columns.trackingNumber')}</TableHead>
                        <TableHead className="min-w-60">{t('ordersEcotrackManager.columns.client')}</TableHead>
                        <TableHead className="min-w-72">{t('ordersEcotrackManager.columns.address')}</TableHead>
                        <TableHead className="min-w-72">{t('ordersEcotrackManager.columns.products')}</TableHead>
                        <TableHead className="min-w-48">{t('ordersEcotrackManager.columns.amount')}</TableHead>
                        <TableHead className="min-w-56">{t('ordersEcotrackManager.columns.status')}</TableHead>
                        <TableHead className="min-w-80 text-center">{t('labels.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                  <TableBody>
                      {items.map((item) => {
                        const expanded = expandedIds.includes(item.orderId);
                        const rowActionControl = item.canDispatch ? (
                          <SplitActionButton
                            label={t('ordersEcotrackManager.actions.dispatch')}
                            icon={<Send data-icon="inline-start" />}
                            primaryDisabled={!writable}
                            onPrimaryClick={() => openDispatchDialog([item.orderId], item.fullName)}
                            options={[
                              {
                                key: 'edit',
                                label: t('actions.edit'),
                                disabled: !writable,
                                onSelect: () => setEditDialog({
                                  orderId: item.orderId,
                                  firstName: item.firstName ?? '',
                                  lastName: item.lastName ?? '',
                                  phoneNumber1: item.phoneNumber1,
                                  phoneNumber2: item.phoneNumber2 ?? '',
                                  delivery: item.delivery,
                                  state: item.state === null ? '' : String(item.state),
                                  city: item.city ?? '',
                                  homeAddress: item.homeAddress ?? '',
                                  note: item.note ?? '',
                                }),
                              },
                              {
                                key: 'delete',
                                label: t('actions.delete'),
                                disabled: !writable,
                                onSelect: () => setDeleteDialog({ orderId: item.orderId, fullName: item.fullName }),
                              },
                            ]}
                          />
                        ) : item.canAddMaj ? (
                          <SplitActionButton
                            label={t('ordersEcotrackManager.actions.maj')}
                            icon={<Package data-icon="inline-start" />}
                            primaryDisabled={!writable}
                            onPrimaryClick={() => setMajDialog({ orderId: item.orderId, fullName: item.fullName, content: '' })}
                            options={item.canAskReturn ? [{
                              key: 'return',
                              label: t('ordersEcotrackManager.actions.return'),
                              disabled: !writable,
                              onSelect: () => {
                                if (!window.confirm(t('ordersEcotrackManager.confirmations.return'))) {
                                  return;
                                }

                                returnMutation.mutate(item.orderId);
                              },
                            }] : []}
                          />
                        ) : null;

                        return (
                          <Fragment key={item.orderId}>
                            <TableRow>
                              <TableCell className="align-top">
                                <Checkbox
                                  aria-label={t('labels.selectRow', { name: item.fullName })}
                                  checked={selectedIds.includes(item.orderId)}
                                  onChange={(event) => {
                                    setSelectedIds((current) =>
                                      event.target.checked
                                        ? [...new Set([...current, item.orderId])]
                                        : current.filter((id) => id !== item.orderId),
                                    );
                                  }}
                                />
                              </TableCell>
                              <TableCell className="align-top">
                                <p className="font-semibold">{item.trackingNumber}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{t('ordersEcotrackManager.reference')}: {item.reference}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(locale, item.createdAt)}</p>
                              </TableCell>
                              <TableCell className="align-top">
                                <p className="font-semibold">{item.fullName}</p>
                                <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                                  <p>{formatPhoneForDisplay(item.phoneNumber1)}</p>
                                  {item.phoneNumber2 ? <p>{formatPhoneForDisplay(item.phoneNumber2)}</p> : null}
                                </div>
                              </TableCell>
                              <TableCell className="align-top">
                                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                                  <MapPin className="mt-0.5 shrink-0" />
                                  <div className="flex flex-col gap-1">
                                    <p className="font-medium text-foreground">{item.homeAddress || t('ordersEcotrackManager.missingValue')}</p>
                                    <p>{item.city || t('ordersEcotrackManager.missingValue')}</p>
                                    <p>{item.stateName || item.state || t('ordersEcotrackManager.missingValue')}</p>
                                    <Badge variant="outline" className="w-fit">{t(getDeliveryLabelKey(item.delivery))}</Badge>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="align-top">
                                <div className="flex flex-col gap-2">
                                  {item.orderProducts.length === 0 ? <p className="text-sm text-muted-foreground">{t('ordersEcotrackManager.history.empty')}</p> : null}
                                  {item.orderProducts.map((product, index) => (
                                    <div key={`${item.orderId}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                                      <span className="text-foreground">{product.title}</span>
                                      <Badge variant="outline">x{product.quantity}</Badge>
                                    </div>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="align-top">
                                <div className="text-sm">
                                  <p>{t('ordersEcotrackManager.amounts.subtotal')}: <span className="font-medium">{formatMoney(locale, item.productSubtotal)}</span></p>
                                  <p className="mt-1">{t('ordersEcotrackManager.amounts.deliveryFee')}: <span className="font-medium">{formatMoney(locale, item.deliveryFee)}</span></p>
                                  <p className="mt-2 font-semibold">{t('ordersEcotrackManager.amounts.total')}: {formatMoney(locale, item.totalAmount)}</p>
                                </div>
                              </TableCell>
                              <TableCell className="align-top">
                                <StatusBadge locale={locale} status={item.status} t={t} />
                              </TableCell>
                              <TableCell className="align-top">
                                <div className="flex justify-center">
                                  {rowActionControl}
                                </div>
                              </TableCell>
                            </TableRow>

                            {expanded ? (
                              <TableRow className="bg-muted/10">
                                <TableCell colSpan={8}>
                                  <ShipmentHistoryPanel locale={locale} orderId={item.orderId} enabled={expanded} />
                                </TableCell>
                              </TableRow>
                            ) : null}
                          </Fragment>
                        );
                      })}
                  </TableBody>
                  </Table>
                </div>

                <div className="grid gap-4 p-4 lg:hidden">
                  {items.map((item) => {
                    const expanded = expandedIds.includes(item.orderId);
                    const mobileActionControl = item.canDispatch ? (
                      <SplitActionButton
                        label={t('ordersEcotrackManager.actions.dispatch')}
                        icon={<Send data-icon="inline-start" />}
                        primaryDisabled={!writable}
                        onPrimaryClick={() => openDispatchDialog([item.orderId], item.fullName)}
                        options={[
                          {
                            key: 'edit',
                            label: t('actions.edit'),
                            disabled: !writable,
                            onSelect: () => setEditDialog({
                              orderId: item.orderId,
                              firstName: item.firstName ?? '',
                              lastName: item.lastName ?? '',
                              phoneNumber1: item.phoneNumber1,
                              phoneNumber2: item.phoneNumber2 ?? '',
                              delivery: item.delivery,
                              state: item.state === null ? '' : String(item.state),
                              city: item.city ?? '',
                              homeAddress: item.homeAddress ?? '',
                              note: item.note ?? '',
                            }),
                          },
                          {
                            key: 'delete',
                            label: t('actions.delete'),
                            disabled: !writable,
                            onSelect: () => setDeleteDialog({ orderId: item.orderId, fullName: item.fullName }),
                          },
                        ]}
                      />
                    ) : item.canAddMaj ? (
                      <SplitActionButton
                        label={t('ordersEcotrackManager.actions.maj')}
                        icon={<Package data-icon="inline-start" />}
                        primaryDisabled={!writable}
                        onPrimaryClick={() => setMajDialog({ orderId: item.orderId, fullName: item.fullName, content: '' })}
                        options={item.canAskReturn ? [{
                          key: 'return',
                          label: t('ordersEcotrackManager.actions.return'),
                          disabled: !writable,
                          onSelect: () => {
                            if (!window.confirm(t('ordersEcotrackManager.confirmations.return'))) {
                              return;
                            }

                            returnMutation.mutate(item.orderId);
                          },
                        }] : []}
                      />
                    ) : null;

                    return (
                      <Card key={item.orderId} className="border border-border/70 bg-background/90 shadow-none">
                        <div className="flex flex-col gap-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-col gap-2">
                              <p className="font-semibold">{item.trackingNumber}</p>
                              <p className="text-sm text-muted-foreground">{item.fullName}</p>
                            </div>
                            <Checkbox
                              aria-label={t('labels.selectRow', { name: item.fullName })}
                              checked={selectedIds.includes(item.orderId)}
                              onChange={(event) => {
                                setSelectedIds((current) =>
                                  event.target.checked
                                    ? [...new Set([...current, item.orderId])]
                                    : current.filter((id) => id !== item.orderId),
                                );
                              }}
                            />
                          </div>

                          <div className="grid gap-3 text-sm">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">{t('ordersEcotrackManager.columns.client')}</p>
                              <p className="mt-1">{item.fullName}</p>
                              <p className="text-muted-foreground">{formatPhoneForDisplay(item.phoneNumber1)}</p>
                              {item.phoneNumber2 ? <p className="text-muted-foreground">{formatPhoneForDisplay(item.phoneNumber2)}</p> : null}
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">{t('ordersEcotrackManager.columns.address')}</p>
                              <p className="mt-1">{item.homeAddress || t('ordersEcotrackManager.missingValue')}</p>
                              <p className="text-muted-foreground">{[item.city, item.stateName ?? item.state].filter(Boolean).join(', ')}</p>
                              <Badge variant="outline" className="mt-2">{t(getDeliveryLabelKey(item.delivery))}</Badge>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">{t('ordersEcotrackManager.columns.products')}</p>
                              <div className="mt-1 flex flex-col gap-1">
                                {item.orderProducts.map((product, index) => (
                                  <p key={`${item.orderId}-mobile-${index}`} className="text-muted-foreground">{product.title} x{product.quantity}</p>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">{t('ordersEcotrackManager.columns.amount')}</p>
                              <p className="mt-1 text-muted-foreground">{t('ordersEcotrackManager.amounts.subtotal')}: {formatMoney(locale, item.productSubtotal)}</p>
                              <p className="text-muted-foreground">{t('ordersEcotrackManager.amounts.deliveryFee')}: {formatMoney(locale, item.deliveryFee)}</p>
                              <p className="font-semibold">{t('ordersEcotrackManager.amounts.total')}: {formatMoney(locale, item.totalAmount)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">{t('ordersEcotrackManager.columns.status')}</p>
                              <div className="mt-2">
                                <StatusBadge locale={locale} status={item.status} t={t} />
                              </div>
                            </div>
                          </div>

                          {mobileActionControl ? <div className="flex flex-wrap gap-2">{mobileActionControl}</div> : null}

                          {expanded ? (
                            <div className="rounded-[1rem] border border-border/70 bg-muted/10 p-3">
                              <ShipmentHistoryPanel locale={locale} orderId={item.orderId} enabled={expanded} />
                            </div>
                          ) : null}
                        </div>
                      </Card>
                    );
                  })}
                </div>

                <TablePaginationControls currentPage={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
              </>
            ) : null}
          </>
        ) : null}
          </div>
          <SurfacePendingOverlay active={showRefreshingProgress} label={t('ordersEcotrackManager.loading.refreshing')} />
        </div>
      </motion.section>

      <Dialog open={editDialog !== null} onOpenChange={(open) => !open && setEditDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('ordersEcotrackManager.dialogs.editTitle')}</DialogTitle>
            <DialogDescription>{t('ordersEcotrackManager.dialogs.editDescription')}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ecotrack-edit-first-name">{t('ordersEcotrackManager.fields.firstName')}</FieldLabel>
                <Input id="ecotrack-edit-first-name" value={editDialog?.firstName ?? ''} onChange={(event) => setEditDialog((current) => (current ? { ...current, firstName: event.target.value } : current))} />
              </Field>
              <Field>
                <FieldLabel htmlFor="ecotrack-edit-last-name">{t('ordersEcotrackManager.fields.lastName')}</FieldLabel>
                <Input id="ecotrack-edit-last-name" value={editDialog?.lastName ?? ''} onChange={(event) => setEditDialog((current) => (current ? { ...current, lastName: event.target.value } : current))} />
              </Field>
              <Field>
                <FieldLabel htmlFor="ecotrack-edit-phone">{t('ordersEcotrackManager.fields.phoneNumber1')}</FieldLabel>
                <Input id="ecotrack-edit-phone" value={editDialog?.phoneNumber1 ?? ''} onChange={(event) => setEditDialog((current) => (current ? { ...current, phoneNumber1: event.target.value } : current))} />
              </Field>
              <Field>
                <FieldLabel htmlFor="ecotrack-edit-phone-2">{t('ordersEcotrackManager.fields.phoneNumber2')}</FieldLabel>
                <Input id="ecotrack-edit-phone-2" value={editDialog?.phoneNumber2 ?? ''} onChange={(event) => setEditDialog((current) => (current ? { ...current, phoneNumber2: event.target.value } : current))} />
              </Field>
              <Field>
                <FieldLabel htmlFor="ecotrack-edit-delivery">{t('ordersEcotrackManager.fields.delivery')}</FieldLabel>
                <NativeSelect id="ecotrack-edit-delivery" value={String(editDialog?.delivery ?? 0)} onChange={(event) => setEditDialog((current) => (current ? { ...current, delivery: Number.parseInt(event.target.value, 10) as 0 | 1 } : current))}>
                  <NativeSelectOption value="0">{t('ordersManager.delivery.home')}</NativeSelectOption>
                  <NativeSelectOption value="1">{t('ordersManager.delivery.office')}</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="ecotrack-edit-state">{t('ordersEcotrackManager.fields.state')}</FieldLabel>
                <NativeSelect id="ecotrack-edit-state" value={editDialog?.state ?? ''} onChange={(event) => setEditDialog((current) => (current ? { ...current, state: event.target.value, city: '' } : current))}>
                  <NativeSelectOption value="">{t('ordersEcotrackManager.fields.statePlaceholder')}</NativeSelectOption>
                  {(catalogQuery.data?.wilayas ?? []).map((wilaya) => (
                    <NativeSelectOption key={wilaya.wilayaId} value={String(wilaya.wilayaId)}>{wilaya.name}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
              <Field>
                <FieldLabel htmlFor="ecotrack-edit-city">{t('ordersEcotrackManager.fields.city')}</FieldLabel>
                {communeOptions.length > 0 ? (
                  <NativeSelect id="ecotrack-edit-city" value={editDialog?.city ?? ''} onChange={(event) => setEditDialog((current) => (current ? { ...current, city: event.target.value } : current))}>
                    <NativeSelectOption value="">{t('ordersEcotrackManager.fields.cityPlaceholder')}</NativeSelectOption>
                    {communeOptions.map((commune) => (
                      <NativeSelectOption key={commune.communeId} value={commune.name}>{commune.name}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                ) : (
                  <Input id="ecotrack-edit-city" value={editDialog?.city ?? ''} onChange={(event) => setEditDialog((current) => (current ? { ...current, city: event.target.value } : current))} />
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="ecotrack-edit-address">{t('ordersEcotrackManager.fields.homeAddress')}</FieldLabel>
                <Input id="ecotrack-edit-address" value={editDialog?.homeAddress ?? ''} onChange={(event) => setEditDialog((current) => (current ? { ...current, homeAddress: event.target.value } : current))} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="ecotrack-edit-note">{t('ordersEcotrackManager.fields.note')}</FieldLabel>
              <Textarea id="ecotrack-edit-note" value={editDialog?.note ?? ''} onChange={(event) => setEditDialog((current) => (current ? { ...current, note: event.target.value } : current))} />
              <FieldDescription>{t('ordersEcotrackManager.dialogs.editHint')}</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditDialog(null)}>{t('actions.cancel')}</Button>
            <Button type="button" onClick={() => void handleSaveEdit()} disabled={updateMutation.isPending}>
              <Save data-icon="inline-start" />
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialog !== null} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ordersEcotrackManager.dialogs.deleteTitle')}</DialogTitle>
            <DialogDescription>{t('ordersEcotrackManager.dialogs.deleteDescription', { name: deleteDialog?.fullName ?? '' })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialog(null)}>{t('actions.cancel')}</Button>
            <Button type="button" variant="destructive" onClick={() => deleteDialog && deleteMutation.mutate(deleteDialog.orderId)} disabled={deleteMutation.isPending}>
              <Trash2 data-icon="inline-start" />
              {t('actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dispatchDialog !== null} onOpenChange={(open) => !open && setDispatchDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ordersEcotrackManager.dialogs.dispatchTitle')}</DialogTitle>
            <DialogDescription>{t('ordersEcotrackManager.dialogs.dispatchDescription', { name: dispatchDialog?.label ?? '' })}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field orientation="horizontal" className="justify-between rounded-[1rem] border border-border/70 bg-muted/10 p-3">
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="ecotrack-ask-collection">{t('ordersEcotrackManager.fields.askCollection')}</FieldLabel>
                <FieldDescription>{t('ordersEcotrackManager.fields.askCollectionDescription')}</FieldDescription>
              </div>
              <Switch id="ecotrack-ask-collection" checked={dispatchDialog?.askCollection ?? false} onCheckedChange={(checked) => setDispatchDialog((current) => (current ? { ...current, askCollection: checked } : current))} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDispatchDialog(null)}>{t('actions.cancel')}</Button>
            <Button
              type="button"
              onClick={() => dispatchDialog && dispatchMutation.mutate({ orderIds: dispatchDialog.orderIds, askCollection: dispatchDialog.askCollection })}
              disabled={dispatchMutation.isPending}
            >
              <Send data-icon="inline-start" />
              {t('ordersEcotrackManager.actions.dispatch')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={majDialog !== null} onOpenChange={(open) => !open && setMajDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ordersEcotrackManager.dialogs.majTitle')}</DialogTitle>
            <DialogDescription>{t('ordersEcotrackManager.dialogs.majDescription', { name: majDialog?.fullName ?? '' })}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="ecotrack-maj-content">{t('ordersEcotrackManager.fields.majContent')}</FieldLabel>
            <Textarea id="ecotrack-maj-content" maxLength={255} value={majDialog?.content ?? ''} onChange={(event) => setMajDialog((current) => (current ? { ...current, content: event.target.value } : current))} />
            <FieldDescription>{t('ordersEcotrackManager.fields.majHint')}</FieldDescription>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMajDialog(null)}>{t('actions.cancel')}</Button>
            <Button type="button" onClick={() => majDialog && majMutation.mutate(majDialog)} disabled={majMutation.isPending || !(majDialog?.content.trim())}>
              <Package data-icon="inline-start" />
              {t('ordersEcotrackManager.actions.maj')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
