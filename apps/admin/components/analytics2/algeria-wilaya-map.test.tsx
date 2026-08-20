import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AlgeriaWilayaMap } from './algeria-wilaya-map';

describe('AlgeriaWilayaMap', () => {
  it('always renders the complete 58-wilaya geography, including places without orders', () => {
    const { container } = render(
      <AlgeriaWilayaMap
        locale="en"
        rows={[
          {
            name: 'Alger',
            postedOrders: 20,
            activeOrders: 5,
            terminalPaidRatePct: 80,
            deliveryMedianHours: 42,
            averageAttempts: 1.2,
          },
        ]}
      />,
    );

    expect(screen.getByRole('img', { name: /algeria delivery volume/i })).toBeInTheDocument();
    expect(container.querySelectorAll('svg path')).toHaveLength(58);
    expect(
      [...container.querySelectorAll('title')].some((title) =>
        title.textContent?.includes('ADRAR'),
      ),
    ).toBe(true);
  });
});
