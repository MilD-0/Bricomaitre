'use client';
import { Download, Loader2, Settings2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { SidePanel } from '../../ui/side-panel';
import {
  formatDate,
  formatDzd as formatMoney,
  formatNumber,
  formatPercent,
} from '../analytics-format';
import { ReturnEvidence } from '../analytics-fulfillment-view';
import { AnalyticsTableHead as TableHead } from '../analytics-presentation';
import { DenseTable, MetricStrip, Section } from '../analytics-workspace-primitives';
import { OperatingCosts } from './operating-costs';
import { type useAssumptionsView, assumptionSourceLabel } from './use-assumptions';

export function AssumptionsViewView({
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
}: NonNullable<ReturnType<typeof useAssumptionsView>['view']>) {
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
        <OperatingCosts
          copy={copy}
          editingCostId={editingCostId}
          costFormLocked={costFormLocked}
          openNewCost={openNewCost}
          showCostForm={showCostForm}
          costRetryRequired={costRetryRequired}
          costDraft={costDraft}
          setCostDraft={setCostDraft}
          costMutation={costMutation}
          costSubmission={costSubmission}
          setShowCostForm={setShowCostForm}
          setEditingCostId={setEditingCostId}
          data={data}
          openCost={openCost}
          locale={locale}
          deleteCostMutation={deleteCostMutation}
        />
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
                  <button
                    type="button"
                    className="text-start underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    onClick={(event) => {
                      event.stopPropagation();
                      openDayOverride(day);
                    }}
                  >
                    {formatDate(locale, day.date, { long: true })}
                  </button>
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
