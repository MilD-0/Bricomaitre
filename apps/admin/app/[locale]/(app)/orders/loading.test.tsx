import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import OrdersLoading from './loading';

describe('OrdersLoading', () => {
  it('renders the orders loading skeleton', () => {
    const view = render(<OrdersLoading />);

    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(view.container.querySelectorAll('[data-workspace-frame]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-workspace-header]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-workspace-toolbar]')).toHaveLength(1);
    expect(view.container.querySelector('[data-workspace-loading="orders"]')).not.toHaveClass(
      'rounded-[1.75rem]',
      'shadow-sm',
    );
  });
});
