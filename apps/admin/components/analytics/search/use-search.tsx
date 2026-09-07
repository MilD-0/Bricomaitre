'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useContext, useEffect, useState } from 'react';

import { analyticsFocusAiSurfaceDetails } from '../../../lib/admin-ai-live-surface-details';
import { requestJson as request } from '../../../lib/admin-api';
import type { AnalyticsPayload } from '../../../lib/analytics';
import { toast } from '../../../lib/toast';
import { useAdminAiSurfaceDetails } from '../../admin-ai-surface-context';
import type { AnalyticsCopy } from '../analytics-copy';
import {
  AnalyticsAssistantFocusContext,
  completedTrendBuckets,
  type DataOf,
} from '../analytics-workspace-primitives';

export type SearchOpportunity = DataOf<'search'>['opportunities'][number];
export type SearchPage = DataOf<'search'>['pages'][number];

export function useSearchVisibilityView({
  data,
  filters,
  reviewClock,
  copy,
  locale,
}: {
  data: DataOf<'search'>;
  filters: AnalyticsPayload['filters'];
  reviewClock: boolean;
  copy: AnalyticsCopy;
  locale: string;
}) {
  const queryClient = useQueryClient();
  const [selectedQuery, setSelectedQuery] = useState<SearchOpportunity | null>(null);
  const [selectedPage, setSelectedPage] = useState<SearchPage | null>(null);
  const setActiveAssistantFocus = useContext(AnalyticsAssistantFocusContext)?.setActive;
  useEffect(() => {
    if (selectedQuery) {
      setActiveAssistantFocus?.({
        dimension: 'search_opportunities',
        search: selectedQuery.query,
      });
    } else if (selectedPage) {
      setActiveAssistantFocus?.({ dimension: 'search_pages', search: selectedPage.path });
    }
  }, [selectedPage, selectedQuery, setActiveAssistantFocus]);
  useAdminAiSurfaceDetails(
    analyticsFocusAiSurfaceDetails({
      dimension: selectedQuery ? 'search_opportunities' : selectedPage ? 'search_pages' : null,
      search: selectedQuery?.query ?? selectedPage?.path ?? null,
    }),
  );
  const sync = useMutation({
    mutationFn: () =>
      request<{ result: { since: string; until: string } }>('/api/stats/search-console/sync', {
        method: 'POST',
        ...(reviewClock && filters.startDate
          ? { body: JSON.stringify({ since: filters.startDate, until: filters.endDate }) }
          : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['stats-workspace', 'search'] });
      toast.success(copy.labels.googleSearchSynchronized);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : copy.labels.syncFailed),
  });
  const inspectionIssues = data.indexHealth.issues;
  const trend = completedTrendBuckets(data.trend, filters.resolvedGrain, filters.endDate);
  return {
    view: {
      data,
      copy,
      locale,
      sync,
      trend,
      selectedQuery,
      setSelectedQuery,
      selectedPage,
      setSelectedPage,
      inspectionIssues,
    } as const,
    fallback: null,
  };
}
