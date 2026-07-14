import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RouteFoundation } from './route-foundation';

describe('RouteFoundation', () => {
  it('renders locale-prefixed native links without requiring client intl context', () => {
    render(
      <RouteFoundation
        locale="ar"
        eyebrow="طلب"
        title="الدفع"
        description="وصف"
        primaryLabel="تأكيد"
        primaryHref="/thank-you"
        secondaryLabel="المنتجات"
        secondaryHref="/products"
      />,
    );

    expect(screen.getByRole('link', { name: 'تأكيد' })).toHaveAttribute('href', '/ar/thank-you');
    expect(screen.getByRole('link', { name: 'المنتجات' })).toHaveAttribute('href', '/ar/products');
  });
});
