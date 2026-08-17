'use client';

import { AlertCircle, Calendar, Layers, MousePointer, Target, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';

import type { StatsDashboardData } from '../../lib/stats';
import { cn } from '../../lib/utils';
import { formatNumber, formatPercent, MetricCard } from './stats-dashboard-primitives';

export function WebsiteMetricCards({
  stats,
  className,
}: {
  stats: StatsDashboardData;
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations('statsDashboard');
  const cards = useMemo(
    () => [
      {
        title: t('website.cards.sessions'),
        value: formatNumber(locale, stats.website.sessions),
        accent: 'bg-[hsl(var(--chart-1))]',
        icon: Calendar,
      },
      {
        title: t('website.cards.pageViews'),
        value: formatNumber(locale, stats.website.pageViews),
        accent: 'bg-[hsl(var(--chart-2))]',
        icon: Layers,
      },
      {
        title: t('website.cards.engagementRate'),
        value: formatPercent(locale, stats.website.engagementRate),
        accent: 'bg-[hsl(var(--chart-3))]',
        icon: MousePointer,
      },
      {
        title: t('website.cards.purchaseRate'),
        value: formatPercent(locale, stats.website.sessionConversionRate),
        accent: 'bg-[hsl(var(--chart-4))]',
        icon: Target,
      },
      {
        title: t('website.cards.returningJourneys'),
        value: formatNumber(locale, stats.website.returningJourneys),
        accent: 'bg-[hsl(var(--chart-2))]',
        icon: Users,
      },
      {
        title: t('website.cards.errorRate'),
        value: formatPercent(locale, stats.website.errorRate),
        accent: 'bg-[hsl(var(--chart-5))]',
        icon: AlertCircle,
      },
    ],
    [locale, stats, t],
  );

  return (
    <div className={cn('grid gap-4 md:grid-cols-2 xl:grid-cols-3', className)}>
      {cards.map((item) => (
        <MetricCard key={item.title} {...item} />
      ))}
    </div>
  );
}
