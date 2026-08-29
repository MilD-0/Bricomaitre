import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AnalyticsRangeControls } from './analytics-range-controls';

const rangeLabels = {
  '7d': '7 days',
  '14d': '14 days',
  '30d': '30 days',
  '90d': '90 days',
  year: 'Year',
  all: 'All',
  custom: 'Custom',
} as const;

const grainLabels = {
  auto: 'Auto grain',
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
} as const;

const ariaLabels = {
  range: 'Analytics range',
  grain: 'Analytics grain',
  startDate: 'Start date',
  endDate: 'End date',
};

describe('AnalyticsRangeControls', () => {
  it('shares responsive range and grain behavior without owning query state', () => {
    const onRangeChange = vi.fn();
    const onGrainChange = vi.fn();
    render(
      <AnalyticsRangeControls
        range="30d"
        grain="auto"
        customStart=""
        customEnd="2026-08-24"
        maxEndDate="2026-08-24"
        rangeLabels={rangeLabels}
        grainLabels={grainLabels}
        applyLabel="Apply"
        ariaLabels={ariaLabels}
        namePrefix="analytics"
        onRangeChange={onRangeChange}
        onGrainChange={onGrainChange}
        onCustomStartChange={() => undefined}
        onCustomEndChange={() => undefined}
        onApplyCustom={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '90 days' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Analytics grain' }), {
      target: { value: 'week' },
    });
    expect(onRangeChange).toHaveBeenCalledWith('90d');
    expect(onGrainChange).toHaveBeenCalledWith('week');
  });

  it('validates a custom range before applying it', () => {
    render(
      <AnalyticsRangeControls
        range="custom"
        grain="day"
        customStart="2026-08-20"
        customEnd="2026-08-19"
        maxEndDate="2026-08-24"
        rangeLabels={rangeLabels}
        grainLabels={grainLabels}
        applyLabel="Apply"
        ariaLabels={ariaLabels}
        namePrefix="analytics"
        onRangeChange={() => undefined}
        onGrainChange={() => undefined}
        onCustomStartChange={() => undefined}
        onCustomEndChange={() => undefined}
        onApplyCustom={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(screen.getByLabelText('End date')).toHaveAttribute('max', '2026-08-24');
  });
});
