'use client';

import { useSyncExternalStore } from 'react';

import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { NativeSelect, NativeSelectOption } from '../ui/native-select';

type AnalyticsRange = '7d' | '14d' | '30d' | '90d' | 'year' | 'all' | 'custom';
type AnalyticsGrain = 'auto' | 'day' | 'week' | 'month';

const ranges: AnalyticsRange[] = ['7d', '14d', '30d', '90d', 'year', 'all', 'custom'];
const grains: AnalyticsGrain[] = ['auto', 'day', 'week', 'month'];

export function AnalyticsRangeControls({
  range,
  grain,
  customStart,
  customEnd,
  maxEndDate,
  rangeLabels,
  grainLabels,
  applyLabel,
  ariaLabels,
  namePrefix,
  onRangeChange,
  onGrainChange,
  onCustomStartChange,
  onCustomEndChange,
  onApplyCustom,
}: {
  range: AnalyticsRange;
  grain: AnalyticsGrain;
  customStart: string;
  customEnd: string;
  maxEndDate: string;
  rangeLabels: Record<AnalyticsRange, string>;
  grainLabels: Record<AnalyticsGrain, string>;
  applyLabel: string;
  ariaLabels: {
    range: string;
    grain: string;
    startDate: string;
    endDate: string;
  };
  namePrefix: string;
  onRangeChange: (range: AnalyticsRange) => void;
  onGrainChange: (grain: AnalyticsGrain) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  onApplyCustom: () => void;
}) {
  // Server-rendered controls must not accept changes before React attaches handlers.
  const interactive = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const customRangeIsValid = Boolean(customStart) && Boolean(customEnd) && customStart <= customEnd;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="hidden flex-wrap gap-1 lg:flex">
        {ranges.map((option) => (
          <button
            key={option}
            type="button"
            disabled={!interactive}
            aria-pressed={range === option}
            onClick={() => onRangeChange(option)}
            className={
              range === option
                ? 'rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background transition-colors'
                : 'rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground'
            }
          >
            {rangeLabels[option]}
          </button>
        ))}
      </div>
      <NativeSelect
        aria-label={ariaLabels.range}
        name={`${namePrefix}-range`}
        className="w-auto lg:hidden"
        disabled={!interactive}
        value={range}
        onChange={(event) => onRangeChange(event.target.value as AnalyticsRange)}
      >
        {ranges.map((option) => (
          <NativeSelectOption key={option} value={option}>
            {rangeLabels[option]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {range === 'custom' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={ariaLabels.startDate}
            name={`${namePrefix}-start-date`}
            className="w-auto"
            type="date"
            disabled={!interactive}
            value={customStart}
            max={customEnd}
            onChange={(event) => onCustomStartChange(event.target.value)}
          />
          <span aria-hidden="true" className="text-muted-foreground">
            –
          </span>
          <Input
            aria-label={ariaLabels.endDate}
            name={`${namePrefix}-end-date`}
            className="w-auto"
            type="date"
            disabled={!interactive}
            value={customEnd}
            min={customStart}
            max={maxEndDate}
            onChange={(event) => onCustomEndChange(event.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={!interactive || !customRangeIsValid}
            onClick={onApplyCustom}
          >
            {applyLabel}
          </Button>
        </div>
      ) : null}
      <NativeSelect
        aria-label={ariaLabels.grain}
        name={`${namePrefix}-grain`}
        className="ms-auto w-auto"
        disabled={!interactive}
        value={grain}
        onChange={(event) => onGrainChange(event.target.value as AnalyticsGrain)}
      >
        {grains.map((option) => (
          <NativeSelectOption key={option} value={option}>
            {grainLabels[option]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
