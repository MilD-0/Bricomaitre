import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AdminAiResultTable } from './result-table';

describe('AdminAiResultTable', () => {
  it('renders result rows in a named keyboard-scrollable region', () => {
    render(
      <AdminAiResultTable
        table={{
          path: 'order_results',
          available: 3,
          columns: ['order_id', 'status'],
          rows: [{ order_id: 42, status: 'completed' }],
        }}
        formatLabel={(value) => value.replaceAll('_', ' ')}
        formatValue={(value) => String(value)}
        showingRows={(shown, available) => `${shown} of ${available}`}
      />,
    );

    const region = screen.getByRole('region', { name: 'order results' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('columnheader', { name: 'order id' })).toBeInTheDocument();
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'completed' })).toBeInTheDocument();
  });

  it('keeps the path accessible but removes it as a nested visual heading in compact blocks', () => {
    render(
      <AdminAiResultTable
        table={{
          path: 'sourceCoverage.missingOrders',
          available: 1,
          columns: ['orderId', 'gapReason'],
          rows: [{ orderId: 42, gapReason: 'no_canonical_state' }],
        }}
        formatLabel={(value) => value}
        formatValue={(value) => String(value)}
        showingRows={(shown, available) => `${shown} of ${available}`}
        compact
      />,
    );

    expect(
      screen.getByRole('region', { name: 'sourceCoverage.missingOrders' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('sourceCoverage.missingOrders')).not.toBeInTheDocument();
  });
});
