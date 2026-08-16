import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import OrdersLoading from './loading';

describe('OrdersLoading', () => {
  it('renders the orders loading skeleton', () => {
    render(<OrdersLoading />);

    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });
});
