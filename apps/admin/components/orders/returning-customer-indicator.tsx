'use client';

import { useQuery } from '@tanstack/react-query';
import { BadgeCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { requestJson as request } from '../../lib/admin-api';

type CustomerCompletionSummary = { completedOrderCount: number };

export function ReturningCustomerIndicator({ orderId }: { orderId: number }) {
  const t = useTranslations('salesDesk.customer');
  const query = useQuery({
    queryKey: ['returning-customer', orderId],
    queryFn: () => request<CustomerCompletionSummary>(`/api/orders/${orderId}/customer`),
    staleTime: 60_000,
  });
  const count = query.data?.completedOrderCount ?? 0;

  if (count === 0) return null;

  return (
    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
      <BadgeCheck className="size-3.5" aria-hidden="true" />
      {count === 1 ? t('returningCustomer') : t('returningCustomerCount', { count })}
    </p>
  );
}
