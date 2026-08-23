import { fireEvent, render, screen } from '@testing-library/react';
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
    expect(container.querySelectorAll('[data-map-layer="country"] path')).toHaveLength(58);
    expect(container.querySelectorAll('[data-map-layer="north"] path')).toHaveLength(58);
    expect(
      [...container.querySelectorAll('title')].some((title) =>
        title.textContent?.includes('ADRAR'),
      ),
    ).toBe(true);
  });

  it('makes tiny wilayas selectable through the map and synchronized ranking', () => {
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
          {
            name: 'Blida',
            postedOrders: 8,
            activeOrders: 2,
            terminalPaidRatePct: 75,
            deliveryMedianHours: 36,
            averageAttempts: 1.4,
          },
        ]}
      />,
    );

    expect(
      container.querySelector('svg[aria-label="Northern Algeria wilaya detail"]'),
    ).toBeInTheDocument();
    const blidaTarget = container.querySelector<SVGPathElement>(
      '[data-map-hit-layer="north"] path[aria-label^="Blida:"]',
    );
    expect(blidaTarget).not.toBeNull();
    fireEvent.click(blidaTarget!);
    expect(container.querySelector('p.text-lg')?.textContent).toBe('8');
  });

  it('uses the analytics palette rather than a decorative violet ramp', () => {
    const { container } = render(<AlgeriaWilayaMap locale="en" rows={[]} />);
    const scale = container.querySelector<HTMLElement>('[aria-label="Posted order volume scale"]');
    expect(scale).not.toBeNull();
    expect(scale!.getAttribute('style')).toContain('var(--chart-1)');
    expect(scale!.getAttribute('style')).not.toContain('violet');
  });
});
