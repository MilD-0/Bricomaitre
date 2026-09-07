'use client';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { NativeSelect } from '../../ui/native-select';
import { formatDate, formatDzd as formatMoney } from '../analytics-format';
import { AnalyticsTableHead as TableHead } from '../analytics-presentation';
import { DenseTable, Section } from '../analytics-workspace-primitives';
import type { AssumptionsViewView } from './assumptions-view';
export function OperatingCosts({
  copy,
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
  data,
  openCost,
  locale,
  deleteCostMutation,
}: Pick<
  Parameters<typeof AssumptionsViewView>[0],
  | 'copy'
  | 'editingCostId'
  | 'costFormLocked'
  | 'openNewCost'
  | 'showCostForm'
  | 'costRetryRequired'
  | 'costDraft'
  | 'setCostDraft'
  | 'costMutation'
  | 'costSubmission'
  | 'setShowCostForm'
  | 'setEditingCostId'
  | 'data'
  | 'openCost'
  | 'locale'
  | 'deleteCostMutation'
>) {
  return (
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
            <p role="status" className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
              {copy.assumptions.costRetryRequired}
            </p>
          ) : null}
          <label>
            <span className="mb-1 block text-xs text-muted-foreground">{copy.columns.name}</span>
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
            <span className="mb-1 block text-xs text-muted-foreground">{copy.labels.period}</span>
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
            <span className="mb-1 block text-xs text-muted-foreground">{copy.assumptions.end}</span>
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
              <td className="px-3 py-2.5 font-medium">
                {cost.id ? (
                  <button
                    type="button"
                    disabled={costFormLocked}
                    className="text-start underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    onClick={(event) => {
                      event.stopPropagation();
                      openCost(cost);
                    }}
                  >
                    {cost.name}
                  </button>
                ) : (
                  cost.name
                )}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">{copy.assumptions[cost.period]}</td>
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
  );
}
