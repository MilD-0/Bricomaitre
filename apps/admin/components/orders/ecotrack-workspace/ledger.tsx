'use client';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';
import { cn } from '../../../lib/utils';
import { Badge } from '../../ui/badge';
import { Checkbox } from '../../ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '../../ui/empty';
import { ScrollableRegion } from '../../ui/scrollable-region';
import { Skeleton } from '../../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableRow } from '../../ui/table';
import { WorkspaceFrame } from '../../ui/workspace';
import { WorkspacePagination } from '../../ui/workspace-pagination';
import { EcotrackRecovery } from '../ecotrack-recovery';
import { EcotrackStatusBadge } from '../ecotrack-status-badge';
import { formatEcotrackMoney } from '../orders-ecotrack-presentation';
import { EcotrackWorkspaceChrome } from './chrome';
import { type OrdersEcotrackWorkspaceProps } from './contract';
import { ShipmentAction, ShipmentIdentity, ShipmentInspector } from './inspector';

function RefinedLedger(props: OrdersEcotrackWorkspaceProps) {
  const t = useTranslations();
  const allSelected =
    props.items.length > 0 && props.items.every((item) => props.selectedIds.includes(item.orderId));

  return (
    <>
      <ScrollableRegion label={t('nav.ecotrackShipments')} className="hidden lg:block">
        <Table>
          <thead>
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
          </thead>
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

export function OrdersEcotrackWorkspace(props: OrdersEcotrackWorkspaceProps) {
  const t = useTranslations();

  return (
    <WorkspaceFrame>
      <EcotrackWorkspaceChrome {...props} />
      {props.writable ? <EcotrackRecovery /> : null}
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
          <RefinedLedger {...props} />
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
