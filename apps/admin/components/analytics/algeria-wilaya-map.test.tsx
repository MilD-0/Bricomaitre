import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AlgeriaWilayaMap } from './algeria-wilaya-map';

describe('AlgeriaWilayaMap', () => {
  it.each(['Enter', ' '])('keeps a region selected after %s and blur', (key) => {
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
    const target = container.querySelector<SVGPathElement>(
      '[data-map-hit-layer="north"] path[aria-label^="Blida:"]',
    )!;
    fireEvent.focus(target);
    fireEvent.keyDown(target, { key });
    fireEvent.blur(target);
    expect(container.querySelector('p.text-lg')?.textContent).toBe('8');
  });

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

  it.each([
    ['fr', 'Volume de livraison en Algérie par wilaya', 'commandes expédiées'],
    ['ar', 'حجم التوصيل في الجزائر حسب الولاية', 'طلبات مرسلة'],
  ])('localizes the %s map and keyboard inspection', (locale, label, posted) => {
    const { container } = render(<AlgeriaWilayaMap locale={locale} rows={[]} />);
    expect(screen.getByRole('img', { name: label })).toBeInTheDocument();
    const target = container.querySelector<SVGPathElement>('[data-map-hit-layer="country"] path')!;
    fireEvent.focus(target);
    expect(target.getAttribute('aria-label')).toContain(posted);
    expect(screen.getByRole('tooltip')).toHaveTextContent(posted);
    expect(screen.queryByText('Northern detail')).not.toBeInTheDocument();
  });
});
