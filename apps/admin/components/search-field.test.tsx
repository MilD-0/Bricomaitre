import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SearchField } from './search-field';

describe('SearchField', () => {
  it('provides search semantics and reports changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SearchField
        value=""
        label="Search products"
        placeholder="Product, SKU, or barcode"
        onChange={onChange}
      />,
    );

    const input = screen.getByRole('searchbox', { name: 'Search products' });
    await user.type(input, 'drill');

    expect(onChange).toHaveBeenCalled();
    expect(input).toHaveClass('ps-9');
  });
});
