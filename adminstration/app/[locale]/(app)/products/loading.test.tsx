import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ProductsLoading from './loading';

describe('ProductsLoading', () => {
  it('renders the products loading skeleton', () => {
    render(<ProductsLoading />);

    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });
});
