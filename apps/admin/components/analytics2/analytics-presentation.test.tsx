import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  AnalyticsDenseTable,
  AnalyticsEmptyState,
  AnalyticsMetricCell,
  AnalyticsMetricStrip,
  AnalyticsSection,
  AnalyticsTableHead,
  humanizeAnalyticsKey,
} from './analytics-presentation';

describe('analytics presentation primitives', () => {
  it('composes metrics and sections without adding dashboard cards', () => {
    render(
      <>
        <AnalyticsMetricStrip>
          <AnalyticsMetricCell
            label="Orders"
            value={<strong>42</strong>}
            detail="Previous period"
          />
        </AnalyticsMetricStrip>
        <AnalyticsSection
          title="Order outcomes"
          description="Durable commerce results"
          action={<button>Export</button>}
        >
          <AnalyticsEmptyState>No results</AnalyticsEmptyState>
        </AnalyticsSection>
      </>,
    );

    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Order outcomes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.getByText('No results')).toBeInTheDocument();
    expect(document.querySelector('[data-analytics-metric-strip]')).toBeInTheDocument();
  });

  it('provides a named keyboard-scrollable table region', () => {
    render(
      <AnalyticsDenseTable label="Campaign rows">
        <AnalyticsTableHead>
          <tr>
            <th>Campaign</th>
          </tr>
        </AnalyticsTableHead>
        <tbody>
          <tr>
            <td>Summer</td>
          </tr>
        </tbody>
      </AnalyticsDenseTable>,
    );

    const region = screen.getByRole('region', { name: 'Campaign rows' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('turns machine keys into restrained fallback labels', () => {
    expect(humanizeAnalyticsKey('completed_tool-calls')).toBe('Completed Tool Calls');
  });
});
