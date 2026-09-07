'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { analyticsFocusAiSurfaceDetails } from '../../../lib/admin-ai-live-surface-details';
import { AdminApiError, requestJson as request } from '../../../lib/admin-api';
import type { AnalyticsPayload } from '../../../lib/analytics';
import { toast } from '../../../lib/toast';
import { useAdminAiSurfaceDetails } from '../../admin-ai-surface-context';
import type { AnalyticsCopy } from '../analytics-copy';
import { type DataOf } from '../analytics-workspace-primitives';

function nullableField(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function assumptionSourceLabel(copy: AnalyticsCopy, value: string | null | undefined) {
  if (value === 'automatic' || value === 'default' || value === 'manual' || value === 'missing') {
    return copy.assumptions[value];
  }
  return copy.assumptions.missing;
}

export function useAssumptionsView({
  data,
  filters,
  copy,
  locale,
}: {
  data: DataOf<'assumptions'>;
  filters: AnalyticsPayload['filters'];
  copy: AnalyticsCopy;
  locale: string;
}) {
  const queryClient = useQueryClient();
  const [settingsDraft, setSettingsDraft] = useState(() => ({
    fxRate: String(data.settings.fxRate),
    returnRate: String(data.settings.defaultReturnRate),
    restFrom: data.settings.restFrom ?? '',
  }));
  const { fxRate, returnRate, restFrom } = settingsDraft;
  const [showCostForm, setShowCostForm] = useState(false);
  const [editingCostId, setEditingCostId] = useState<number | null>(null);
  const costSubmission = useRef<{ body: string; uncertain: boolean } | null>(null);
  const [costRetryRequired, setCostRetryRequired] = useState(false);
  const [costDraft, setCostDraft] = useState({
    name: '',
    amountDzd: '',
    period: 'monthly' as 'monthly' | 'once',
    startDate: filters.endDate,
    endDate: '',
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selectedDay = data.days.find((day) => day.date === selectedDate) ?? null;
  useAdminAiSurfaceDetails(
    analyticsFocusAiSurfaceDetails({
      dimension: selectedDay ? 'daily_assumptions' : null,
      identifiers: selectedDay ? [selectedDay.date] : [],
    }),
  );
  const selectedDayHasManualOverride = Boolean(
    selectedDay &&
    (selectedDay.grossProfitSource === 'manual' ||
      selectedDay.returnRateSource === 'manual' ||
      selectedDay.confirmedOrdersSource === 'manual' ||
      selectedDay.note?.trim()),
  );
  const [dayDraft, setDayDraft] = useState({
    grossProfitDzd: '',
    returnRatePct: '',
    confirmedOrders: '',
    note: '',
  });

  function openDayOverride(selected: DataOf<'assumptions'>['days'][number]) {
    setSelectedDate(selected.date);
    setDayDraft({
      grossProfitDzd:
        selected.grossProfitSource === 'manual' && selected.grossProfitDzd != null
          ? String(selected.grossProfitDzd)
          : '',
      returnRatePct:
        selected.returnRateSource === 'manual' && selected.returnRatePct != null
          ? String(selected.returnRatePct)
          : '',
      confirmedOrders:
        selected.confirmedOrdersSource === 'manual' && selected.confirmedOrders != null
          ? String(selected.confirmedOrders)
          : '',
      note: selected.note ?? '',
    });
  }

  function openNewCost() {
    if (costSubmission.current || costMutation.isPending) return;
    setEditingCostId(null);
    setCostDraft({
      name: '',
      amountDzd: '',
      period: 'monthly',
      startDate: filters.endDate,
      endDate: '',
    });
    setShowCostForm(true);
  }

  function openCost(cost: DataOf<'assumptions'>['costs'][number]) {
    if (!cost.id || costSubmission.current || costMutation.isPending) return;
    setEditingCostId(cost.id);
    setCostDraft({
      name: cost.name,
      amountDzd: String(cost.amountDzd),
      period: cost.period,
      startDate: cost.startDate,
      endDate: cost.endDate ?? '',
    });
    setShowCostForm(true);
  }

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['stats-workspace'] });
  }

  const settingsMutation = useMutation({
    mutationFn: (override?: number) =>
      request('/api/stats/profit-tracker/settings', {
        method: 'PUT',
        body: JSON.stringify({
          fxRate: Number(fxRate),
          defaultReturnRate: override ?? Number(returnRate),
          restFrom: restFrom || null,
        }),
      }),
    onSuccess: async () => {
      toast.success(copy.labels.assumptionsSaved);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const costMutation = useMutation({
    mutationFn: () => {
      const input = {
        name: costDraft.name,
        amountDzd: Number(costDraft.amountDzd),
        period: costDraft.period,
        startDate: costDraft.startDate,
        endDate: costDraft.endDate || null,
      };
      if (editingCostId) {
        return request(`/api/stats/profit-tracker/costs/${editingCostId}`, {
          method: 'PUT',
          body: JSON.stringify(input),
        });
      }
      // Retry the same operation after an uncertain response, even if a stale
      // event attempts to change the draft before the disabled controls render.
      costSubmission.current ??= {
        body: JSON.stringify({ ...input, requestId: crypto.randomUUID() }),
        uncertain: false,
      };
      return request('/api/stats/profit-tracker/costs', {
        method: 'POST',
        body: costSubmission.current.body,
      });
    },
    onSuccess: async () => {
      toast.success(
        editingCostId ? copy.labels.operatingCostUpdated : copy.labels.operatingCostAdded,
      );
      setShowCostForm(false);
      costSubmission.current = null;
      setCostRetryRequired(false);
      setEditingCostId(null);
      setCostDraft({
        name: '',
        amountDzd: '',
        period: 'monthly',
        startDate: filters.endDate,
        endDate: '',
      });
      await invalidate();
    },
    onError: (error: Error) => {
      if (costSubmission.current) {
        const rejectedBeforeMutation =
          error instanceof AdminApiError && [400, 401, 403, 404, 422, 429].includes(error.status);
        if (!costSubmission.current.uncertain && rejectedBeforeMutation) {
          costSubmission.current = null;
        } else {
          costSubmission.current.uncertain = true;
          setCostRetryRequired(true);
        }
      }
      toast.error(error.message);
    },
  });
  const costFormLocked = costMutation.isPending || costRetryRequired;
  const deleteCostMutation = useMutation({
    mutationFn: (id: number) =>
      request(`/api/stats/profit-tracker/costs/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(copy.labels.operatingCostRemoved);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const dayMutation = useMutation({
    mutationFn: () =>
      request('/api/stats/profit-tracker/days', {
        method: 'POST',
        body: JSON.stringify({
          date: selectedDate,
          grossProfitDzd: nullableField(dayDraft.grossProfitDzd),
          returnRatePct: nullableField(dayDraft.returnRatePct),
          confirmedOrders: nullableField(dayDraft.confirmedOrders),
          note: dayDraft.note.trim() || null,
        }),
      }),
    onSuccess: async () => {
      toast.success(copy.labels.dailyOverrideSaved);
      setSelectedDate(null);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const resetDayMutation = useMutation({
    mutationFn: () =>
      request(`/api/stats/profit-tracker/days/${selectedDate}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(copy.labels.dailyValuesReset);
      setSelectedDate(null);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const exportParams = new URLSearchParams({ range: filters.range, endDate: filters.endDate });
  if (filters.startDate) exportParams.set('startDate', filters.startDate);
  return {
    view: {
      data,
      copy,
      locale,
      settingsMutation,
      setSettingsDraft,
      fxRate,
      returnRate,
      restFrom,
      editingCostId,
      costFormLocked,
      openNewCost,
      showCostForm,
      costRetryRequired,
      costDraft,
      setCostDraft,
      costMutation,
      costSubmission,
      setShowCostForm,
      setEditingCostId,
      openCost,
      deleteCostMutation,
      selectedDay,
      exportParams,
      openDayOverride,
      setSelectedDate,
      selectedDate,
      selectedDayHasManualOverride,
      resetDayMutation,
      dayMutation,
      dayDraft,
      setDayDraft,
    } as const,
    fallback: null,
  };
}
