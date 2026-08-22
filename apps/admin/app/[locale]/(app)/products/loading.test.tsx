import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ProductsLoading from './loading';

describe('ProductsLoading', () => {
  it('renders the products loading skeleton', () => {
    const view = render(<ProductsLoading />);

    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(view.container.querySelectorAll('[data-workspace-frame]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-workspace-header]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-workspace-toolbar]')).toHaveLength(1);
    expect(view.container.querySelector('[data-workspace-loading="products"]')).not.toHaveClass(
      'rounded-[1.75rem]',
      'shadow-sm',
    );
  });
});
