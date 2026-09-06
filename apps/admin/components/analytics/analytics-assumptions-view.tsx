'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, Plus, Settings2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';

import type { AnalyticsPayload } from '../../lib/analytics';
import { AdminApiError, requestJson as request } from '../../lib/admin-api';
import { analyticsFocusAiSurfaceDetails } from '../../lib/admin-ai-live-surface-details';
import { toast } from '../../lib/toast';
import { useAdminAiSurfaceDetails } from '../admin-ai-surface-context';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { NativeSelect } from '../ui/native-select';
import { SidePanel } from '../ui/side-panel';
import { AnalyticsTableHead as TableHead } from './analytics-presentation';
import {
  formatDate,
  formatDzd as formatMoney,
  formatNumber,
  formatPercent,
} from './analytics-format';
import type { AnalyticsCopy } from './analytics-copy';
import { ReturnEvidence } from './analytics-fulfillment-view';
import { type DataOf, DenseTable, MetricStrip, Section } from './analytics-workspace-primitives';

function nullableField(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function assumptionSourceLabel(copy: AnalyticsCopy, value: string | null | undefined) {
  if (value === 'automatic' || value === 'default' || value === 'manual' || value === 'missing') {
    return copy.assumptions[value];
  }
  return copy.assumptions.missing;
}

export function AssumptionsView({
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
  return (
    <>
      <MetricStrip metrics={data.metrics} copy={copy} locale={locale} />
      <Section title={copy.sections.planningReturns}>
        <ReturnEvidence returns={data.returns} copy={copy} locale={locale} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={data.returns.mature.ratePct == null || settingsMutation.isPending}
            onClick={() => {
              const value = data.returns.mature.ratePct;
              if (value != null) {
                setSettingsDraft((current) => ({ ...current, returnRate: String(value) }));
                settingsMutation.mutate(value);
              }
            }}
          >
            {copy.returnCopy.useMature}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={data.returns.allTerminal.ratePct == null || settingsMutation.isPending}
            onClick={() => {
              const value = data.returns.allTerminal.ratePct;
              if (value != null) {
                setSettingsDraft((current) => ({ ...current, returnRate: String(value) }));
                settingsMutation.mutate(value);
              }
            }}
          >
            {copy.returnCopy.useTerminal}
          </Button>
        </div>
      </Section>
      <div className="grid xl:grid-cols-[minmax(20rem,0.75fr)_minmax(0,1.25fr)]">
        <Section title={copy.labels.economicControls}>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {copy.assumptions.fx}
              </span>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={fxRate}
                onChange={(event) =>
                  setSettingsDraft((current) => ({ ...current, fxRate: event.target.value }))
                }
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {copy.assumptions.defaultReturn}
              </span>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={returnRate}
                onChange={(event) =>
                  setSettingsDraft((current) => ({ ...current, returnRate: event.target.value }))
                }
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {copy.assumptions.restFrom}
              </span>
              <Input
                type="date"
                value={restFrom}
                onChange={(event) =>
                  setSettingsDraft((current) => ({ ...current, restFrom: event.target.value }))
                }
              />
            </label>
            <Button
              disabled={settingsMutation.isPending || !Number(fxRate)}
              onClick={() => settingsMutation.mutate(undefined)}
            >
              {settingsMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Settings2 className="size-4" />
              )}
              {copy.save}
            </Button>
          </div>
        </Section>
        <Section
          title={copy.sections.operatingCosts}
          analyticsFocus={{
            dimension: 'operating_costs',
            identifiers: editingCostId ? [String(editingCostId)] : [],
          }}
          action={
            <Button size="sm" variant="outline" disabled={costFormLocked} onClick={openNewCost}>
              <Plus className="size-3.5" />
              {copy.assumptions.newCost}
            </Button>
          }
        >
          {showCostForm ? (
            <div className="mb-5 grid gap-3 border-y border-border/60 bg-muted/10 py-4 sm:grid-cols-2 lg:grid-cols-3">
              {costRetryRequired ? (
                <p
                  role="status"
                  className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3"
                >
                  {copy.assumptions.costRetryRequired}
                </p>
              ) : null}
              <label>
                <span className="mb-1 block text-xs text-muted-foreground">
                  {copy.columns.name}
                </span>
                <Input
                  disabled={costFormLocked}
                  value={costDraft.name}
                  onChange={(event) =>
                    setCostDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label>
                <span className="mb-1 block text-xs text-muted-foreground">
                  {copy.assumptions.amount}
                </span>
                <Input
                  disabled={costFormLocked}
                  type="number"
                  min="0"
                  value={costDraft.amountDzd}
                  onChange={(event) =>
                    setCostDraft((current) => ({ ...current, amountDzd: event.target.value }))
                  }
                />
              </label>
              <label>
                <span className="mb-1 block text-xs text-muted-foreground">
                  {copy.labels.period}
                </span>
                <NativeSelect
                  disabled={costFormLocked}
                  value={costDraft.period}
                  onChange={(event) =>
                    setCostDraft((current) => ({
                      ...current,
                      period: event.target.value as 'monthly' | 'once',
                    }))
                  }
                >
                  <option value="monthly">{copy.assumptions.monthly}</option>
                  <option value="once">{copy.assumptions.once}</option>
                </NativeSelect>
              </label>
              <label>
                <span className="mb-1 block text-xs text-muted-foreground">
                  {copy.assumptions.start}
                </span>
                <Input
                  disabled={costFormLocked}
                  type="date"
                  value={costDraft.startDate}
                  onChange={(event) =>
                    setCostDraft((current) => ({ ...current, startDate: event.target.value }))
                  }
                />
              </label>
              <label>
                <span className="mb-1 block text-xs text-muted-foreground">
                  {copy.assumptions.end}
                </span>
                <Input
                  disabled={costFormLocked}
                  type="date"
                  value={costDraft.endDate}
                  onChange={(event) =>
                    setCostDraft((current) => ({ ...current, endDate: event.target.value }))
                  }
                />
              </label>
              <div className="flex items-end gap-2">
                <Button
                  disabled={
                    costMutation.isPending || !costDraft.name.trim() || !Number(costDraft.amountDzd)
                  }
                  onClick={() => costMutation.mutate()}
                >
                  {copy.save}
                </Button>
                <Button
                  variant="outline"
                  disabled={costFormLocked}
                  onClick={() => {
                    if (costSubmission.current || costMutation.isPending) return;
                    setShowCostForm(false);
                    setEditingCostId(null);
                  }}
                >
                  {copy.cancel}
                </Button>
              </div>
            </div>
          ) : null}
          <DenseTable>
            <TableHead>
              <tr>
                <th className="px-3 py-2 text-start">{copy.columns.name}</th>
                <th className="px-3 py-2 text-start">{copy.labels.period}</th>
                <th className="px-3 py-2 text-end">{copy.assumptions.amount}</th>
                <th className="px-3 py-2 text-start">{copy.columns.date}</th>
                <th className="w-12 px-3 py-2" />
              </tr>
            </TableHead>
            <tbody className="divide-y divide-border/45">
              {data.costs.map((cost) => (
                <tr
                  key={cost.id ?? `${cost.name}-${cost.startDate}`}
                  className={cost.id ? 'cursor-pointer hover:bg-muted/25' : undefined}
                  onClick={() => openCost(cost)}
                >
                  <td className="px-3 py-2.5 font-medium">{cost.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {copy.assumptions[cost.period]}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {formatMoney(locale, cost.amountDzd)}
                  </td>
                  <td className="px-3 py-2.5">
                    {formatDate(locale, cost.startDate, { long: true })}
                    {cost.endDate ? ` – ${formatDate(locale, cost.endDate, { long: true })}` : ''}
                  </td>
                  <td className="px-3 py-2.5 text-end">
                    {cost.id ? (
                      <button
                        type="button"
                        aria-label={`${copy.delete} ${cost.name}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (window.confirm(`${copy.delete} ${cost.name}?`))
                            deleteCostMutation.mutate(cost.id!);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </DenseTable>
        </Section>
      </div>
      <Section
        title={copy.sections.dailyOverrides}
        analyticsFocus={{
          dimension: 'daily_assumptions',
          identifiers: selectedDay ? [selectedDay.date] : [],
        }}
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              window.open(
                `/api/stats/profit-tracker/export.csv?${exportParams.toString()}`,
                '_self',
              );
            }}
          >
            <Download className="size-3.5" />
            {copy.export}
          </Button>
        }
      >
        <DenseTable>
          <TableHead>
            <tr>
              <th className="px-3 py-2 text-start">{copy.columns.date}</th>
              <th className="px-3 py-2 text-end">{copy.columns.grossProfit}</th>
              <th className="px-3 py-2 text-start">{copy.columns.source}</th>
              <th className="px-3 py-2 text-end">{copy.labels.returnPercent}</th>
              <th className="px-3 py-2 text-start">{copy.columns.source}</th>
              <th className="px-3 py-2 text-end">{copy.assumptions.confirmed}</th>
              <th className="px-3 py-2 text-start">{copy.columns.source}</th>
              <th className="px-3 py-2 text-start">{copy.columns.note}</th>
            </tr>
          </TableHead>
          <tbody className="divide-y divide-border/45">
            {data.days.slice(0, 120).map((day) => (
              <tr
                key={day.date}
                className="cursor-pointer hover:bg-muted/25"
                onClick={() => openDayOverride(day)}
              >
                <td className="px-3 py-2.5 font-medium">
                  {formatDate(locale, day.date, { long: true })}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatMoney(locale, day.grossProfitDzd)}
                </td>
                <td className="px-3 py-2.5 text-xs capitalize text-muted-foreground">
                  {assumptionSourceLabel(copy, day.grossProfitSource)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatPercent(locale, day.returnRatePct)}
                </td>
                <td className="px-3 py-2.5 text-xs capitalize text-muted-foreground">
                  {assumptionSourceLabel(copy, day.returnRateSource)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {formatNumber(locale, day.confirmedOrders)}
                </td>
                <td className="px-3 py-2.5 text-xs capitalize text-muted-foreground">
                  {assumptionSourceLabel(copy, day.confirmedOrdersSource)}
                </td>
                <td className="max-w-56 truncate px-3 py-2.5 text-muted-foreground">
                  {day.note || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </DenseTable>
      </Section>
      <Section title={copy.sections.formula}>
        <div className="divide-y divide-border/50 border-y border-border/60 font-mono text-xs">
          {Object.entries(data.formula).map(([key, value]) => (
            <div key={key} className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]">
              <span className="font-sans font-medium text-foreground">
                {key === 'adCost'
                  ? copy.columns.adCost
                  : key === 'adjustedProfit'
                    ? copy.columns.adjustedProfit
                    : key === 'netProfit'
                      ? copy.columns.netProfit
                      : key === 'profitX'
                        ? copy.columns.profitX
                        : copy.columns.trueProfit}
              </span>
              <code className="overflow-x-auto text-muted-foreground">{value}</code>
            </div>
          ))}
        </div>
      </Section>
      <SidePanel
        open={Boolean(selectedDay)}
        onOpenChange={(open) => {
          if (!open) setSelectedDate(null);
        }}
        title={`${copy.assumptions.newOverride} · ${formatDate(locale, selectedDate, { long: true })}`}
        description={copy.labels.blankFieldsDefer}
        closeLabel={copy.close}
        footer={
          <div className="flex w-full flex-wrap justify-between gap-2">
            <Button
              variant="outline"
              disabled={!selectedDayHasManualOverride || resetDayMutation.isPending}
              onClick={() => resetDayMutation.mutate()}
            >
              {copy.reset}
            </Button>
            <Button disabled={dayMutation.isPending} onClick={() => dayMutation.mutate()}>
              {copy.save}
            </Button>
          </div>
        }
      >
        <div className="space-y-5 p-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {copy.assumptions.gross}
            </span>
            <Input
              type="number"
              value={dayDraft.grossProfitDzd}
              placeholder={
                selectedDay?.grossProfitDzd == null ? '' : String(selectedDay.grossProfitDzd)
              }
              onChange={(event) =>
                setDayDraft((current) => ({ ...current, grossProfitDzd: event.target.value }))
              }
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {copy.assumptions.returnRate}
            </span>
            <Input
              type="number"
              min="0"
              max="100"
              value={dayDraft.returnRatePct}
              placeholder={
                selectedDay?.returnRatePct == null ? '' : String(selectedDay.returnRatePct)
              }
              onChange={(event) =>
                setDayDraft((current) => ({ ...current, returnRatePct: event.target.value }))
              }
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {copy.assumptions.confirmed}
            </span>
            <Input
              type="number"
              min="0"
              step="1"
              value={dayDraft.confirmedOrders}
              placeholder={
                selectedDay?.confirmedOrders == null ? '' : String(selectedDay.confirmedOrders)
              }
              onChange={(event) =>
                setDayDraft((current) => ({ ...current, confirmedOrders: event.target.value }))
              }
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {copy.assumptions.notes}
            </span>
            <textarea
              className="min-h-28 w-full rounded-xl border border-input/20 bg-input px-3 py-2 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-ring/20"
              value={dayDraft.note}
              onChange={(event) =>
                setDayDraft((current) => ({ ...current, note: event.target.value }))
              }
            />
          </label>
        </div>
      </SidePanel>
    </>
  );
}
