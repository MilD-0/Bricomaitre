'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { toast } from '../lib/toast';
import { Button } from './ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from './ui/empty';
import { Skeleton } from './ui/skeleton';
import { TablePaginationControls } from './table-pagination-controls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

type ManualOrderRow = {
  id: string;
  tracking: string;
  customerName: string;
  wilaya: string;
  amountCollected: number;
  netRevenue: number;
  profit: number;
  createdAt: string;
  products: Array<{ title: string; quantity: number }>;
};

function request<T>(url: string, init?: RequestInit): Promise<T> {
  return fetch(url, init).then(async (response) => {
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.error ?? 'Request failed');
    }
    return body as T;
  });
}
type PaginationMeta = { page: number; limit: number; totalItems: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean };
type ManualOrderHistoryResponse = { data: ManualOrderRow[]; pagination: PaginationMeta };

function ManualOrderHistorySkeleton() {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-border/70">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead><Skeleton className="h-4 w-20" /></TableHead>
            <TableHead><Skeleton className="h-4 w-24" /></TableHead>
            <TableHead><Skeleton className="h-4 w-20" /></TableHead>
            <TableHead><Skeleton className="h-4 w-16" /></TableHead>
            <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={index}>
              <TableCell>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </TableCell>
              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
              <TableCell><Skeleton className="h-9 w-20 rounded-md" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ManualOrderHistory() {
  const t = useTranslations('statsDashboard.manualOrders');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const historyQuery = useQuery({
    queryKey: ['manual-orders', page],
    queryFn: () => request<ManualOrderHistoryResponse>(`/api/stats/manual-order?page=${page}&limit=10`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => request(`/api/stats/manual-order/${id}`, { method: 'DELETE' }),
    onMutate: () => {
      const toastId = toast.loading(t('notifications.delete.loading'));
      return { toastId };
    },
    onSuccess: async (_, id, context) => {
      toast.success(t('notifications.delete.success', { id }), { id: context?.toastId });
      await queryClient.invalidateQueries({ queryKey: ['manual-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['stats-dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['action-history'] });
    },
    onError: (error, _, context) => {
      toast.error(error instanceof Error ? error.message : t('notifications.delete.error'), { id: context?.toastId });
    },
  });

  const rows = historyQuery.data?.data ?? [];
  const isLoading = historyQuery.isPending && rows.length === 0;
  const totalPages = historyQuery.data?.pagination?.totalPages ?? 1;

  useEffect(() => {
    const currentPage = historyQuery.data?.pagination?.page;
    if (!historyQuery.isFetching && currentPage && currentPage !== page) {
      setPage(currentPage);
    }
  }, [historyQuery.data?.pagination?.page, historyQuery.isFetching, page]);

  if (isLoading) {
    return <ManualOrderHistorySkeleton />;
  }

  if (rows.length === 0) {
    return (
      <Empty className="border-none">
        <EmptyHeader>
          <EmptyTitle>{t('history.emptyTitle')}</EmptyTitle>
          <EmptyDescription>{t('history.emptyDescription')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded-[1.5rem] border border-border/70">
        <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('history.columns.tracking')}</TableHead>
            <TableHead>{t('history.columns.details')}</TableHead>
            <TableHead>{t('history.columns.finances')}</TableHead>
            <TableHead>{t('history.columns.date')}</TableHead>
            <TableHead>{t('history.columns.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <div>
                  <p className="font-medium">{row.tracking}</p>
                  <p className="text-xs text-muted-foreground">{row.customerName || '—'}</p>
                </div>
              </TableCell>
              <TableCell>
                <div>
                  <p>{row.wilaya || '—'}</p>
                  <p className="text-xs text-muted-foreground">{row.products.map((product) => `${product.title} x${product.quantity}`).join(', ')}</p>
                </div>
              </TableCell>
              <TableCell>
                <div>
                  <p>{row.amountCollected.toFixed(0)}</p>
                  <p className={row.profit >= 0 ? 'text-emerald-600 text-xs' : 'text-rose-600 text-xs'}>{row.profit.toFixed(0)}</p>
                </div>
              </TableCell>
              <TableCell>{new Date(row.createdAt).toLocaleDateString()}</TableCell>
              <TableCell>
                <Button type="button" size="sm" variant="outline" onClick={() => deleteMutation.mutate(row.id)} disabled={deleteMutation.isPending}>
                  {t('history.delete')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        </Table>
      </div>

      <TablePaginationControls className="mt-4 rounded-[1.5rem] border" currentPage={historyQuery.data?.pagination?.page ?? page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
