'use client';
import { MoreHorizontal, RefreshCw, Search, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type {
  EcotrackShipmentSortDirection,
  EcotrackShipmentSortKey,
} from '../../../lib/ecotrack-admin-contracts';
import { SearchField } from '../../search-field';
import { SplitActionButton } from '../../split-action-button';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { PendingInline } from '../../ui/motion';
import { NativeSelect } from '../../ui/native-select';
import { Switch } from '../../ui/switch';
import {
  WorkspaceActions,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceToolbar,
} from '../../ui/workspace';
import { type OrdersEcotrackWorkspaceProps } from './contract';

export function EcotrackWorkspaceChrome(props: OrdersEcotrackWorkspaceProps) {
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
          <option value="all">{t('ordersEcotrackManager.filters.allStatuses')}</option>
          {props.statuses.map((status) => (
            <option key={status} value={status}>
              {t(`ordersEcotrackManager.statuses.${status}`)}
            </option>
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
                  <option key={key} value={key}>
                    {t(`ordersEcotrackManager.sort.${key}`)}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                value={props.sortDirection}
                onChange={(event) =>
                  props.onSortDirectionChange(event.target.value as EcotrackShipmentSortDirection)
                }
              >
                <option value="desc">{t('ordersEcotrackManager.sort.desc')}</option>
                <option value="asc">{t('ordersEcotrackManager.sort.asc')}</option>
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
