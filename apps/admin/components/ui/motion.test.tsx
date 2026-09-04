import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PendingInline } from './motion';

describe('PendingInline', () => {
  afterEach(cleanup);

  it('keeps inactive status copy out of the accessibility tree', () => {
    const view = render(<PendingInline active={false} label="Loading" />);
    const statusContent = view.getByText('Loading').parentElement;

    expect(statusContent).toHaveAttribute('aria-hidden', 'true');
    expect(statusContent).toHaveClass('invisible');

    view.rerender(<PendingInline active label="Loading" />);
    expect(view.getByText('Loading').parentElement).toHaveAttribute('aria-hidden', 'false');
    expect(view.getByText('Loading').parentElement).not.toHaveClass('invisible');
  });
});
