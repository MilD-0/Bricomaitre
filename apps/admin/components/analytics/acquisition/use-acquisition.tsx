'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useContext, useEffect, useState } from 'react';

import { analyticsFocusAiSurfaceDetails } from '../../../lib/admin-ai-live-surface-details';
import { requestJson as request } from '../../../lib/admin-api';
import type { AnalyticsEntityLevel, AnalyticsPayload } from '../../../lib/analytics';
import { toast } from '../../../lib/toast';
import { useAdminAiSurfaceDetails } from '../../admin-ai-surface-context';
import type { AnalyticsCopy } from '../analytics-copy';
import {
  AnalyticsAssistantFocusContext,
  type DataOf,
  splitPartialSeries,
} from '../analytics-workspace-primitives';

export function useAcquisitionView({
  data,
  filters,
  copy,
  locale,
}: {
  data: DataOf<'acquisition'>;
  filters: AnalyticsPayload['filters'];
  copy: AnalyticsCopy;
  locale: string;
}) {
  const queryClient = useQueryClient();
  const [level, setLevel] = useState<AnalyticsEntityLevel>('adset');
  const entityKey = level === 'campaign' ? 'campaigns' : level === 'adset' ? 'adsets' : 'ads';
  const entities = data.entities[entityKey];
  const daily = data.entityDaily[entityKey];
  const [selectionByLevel, setSelectionByLevel] = useState<Record<AnalyticsEntityLevel, string[]>>(
    () => ({
      campaign: data.entities.campaigns.slice(0, 3).map((entity) => entity.id),
      adset: data.entities.adsets.slice(0, 3).map((entity) => entity.id),
      ad: data.entities.ads.slice(0, 3).map((entity) => entity.id),
    }),
  );
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const inspected = entities.find((entity) => entity.id === inspectedId) ?? null;
  const availableIds = new Set(entities.map((entity) => entity.id));
  const selectedForLevel = selectionByLevel[level].filter((id) => availableIds.has(id));
  const selectedIds = selectedForLevel.length
    ? selectedForLevel
    : entities.slice(0, 3).map((entity) => entity.id);
  const selectedIdsKey = selectedIds.join('|');
  const setActiveAssistantFocus = useContext(AnalyticsAssistantFocusContext)?.setActive;
  useEffect(() => {
    setActiveAssistantFocus?.({
      dimension: entityKey,
      search: inspected?.name ?? null,
      identifiers: inspected ? [inspected.id] : selectedIdsKey.split('|').filter(Boolean),
    });
  }, [entityKey, inspected, selectedIdsKey, setActiveAssistantFocus]);
  useAdminAiSurfaceDetails(
    analyticsFocusAiSurfaceDetails({
      dimension: entityKey,
      search: inspected?.name ?? null,
      identifiers: inspected ? [inspected.id] : selectedIds,
    }),
  );

  function setSelectedIds(update: (current: string[]) => string[]) {
    setSelectionByLevel((current) => ({ ...current, [level]: update(selectedIds) }));
  }

  const comparison = (() => {
    const byDate = new Map<string, Record<string, string | number>>();
    for (const row of daily) {
      if (!selectedIds.includes(row.id)) continue;
      const current = byDate.get(row.day) ?? { day: row.day };
      const index = selectedIds.indexOf(row.id);
      current[`series${index}`] = row.adCostDzd;
      byDate.set(row.day, current);
    }
    return [...byDate.values()].sort((left, right) =>
      String(left.day).localeCompare(String(right.day)),
    );
  })();
  const campaignNames = new Map(
    data.entities.campaigns.map((campaign) => [campaign.id, campaign.name]),
  );
  const maturationCampaigns = data.breakdowns.maturation.slice(0, 5);
  const maturationChart = [0, 3, 7, 14, 21].map((day) => ({
    day,
    ...Object.fromEntries(
      maturationCampaigns.map((campaign, index) => [
        `series${index}`,
        campaign.points.find((point) => point.day === day)?.paidRatePct ?? null,
      ]),
    ),
  }));
  const profitSeries = splitPartialSeries(
    data.profitSeries as Array<Record<string, string | number | boolean | null>>,
    ['profitXBeforeReturns', 'profitX'],
  );

  const syncMutation = useMutation({
    mutationFn: () =>
      request('/api/stats/profit-tracker/fetch-meta', {
        method: 'POST',
        body: JSON.stringify({ since: filters.startDate, until: filters.endDate }),
      }),
    onSuccess: async () => {
      toast.success(copy.labels.metaInsightsSynchronized);
      await queryClient.invalidateQueries({ queryKey: ['stats-workspace'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return {
    view: {
      data,
      copy,
      locale,
      profitSeries,
      maturationCampaigns,
      campaignNames,
      maturationChart,
      entityKey,
      inspected,
      selectedIds,
      level,
      setLevel,
      setInspectedId,
      syncMutation,
      entities,
      comparison,
      setSelectedIds,
    } as const,
    fallback: null,
  };
}
