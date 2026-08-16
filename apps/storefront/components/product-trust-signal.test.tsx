import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ProductTrustSignal } from './product-trust-signal';

describe('ProductTrustSignal', () => {
  afterEach(cleanup);

  it('marks the full trust-signal target for its lightweight icon animation', () => {
    render(
      <ul>
        <ProductTrustSignal icon="payment">Cash on delivery</ProductTrustSignal>
      </ul>,
    );
    const signal = screen.getByRole('listitem');

    expect(signal).toHaveAttribute('data-trust-icon', 'payment');
    expect(signal.querySelector('svg')).toBeInTheDocument();
  });

  it('renders the requested delivery icon', () => {
    render(
      <ul>
        <ProductTrustSignal icon="delivery">Delivery</ProductTrustSignal>
      </ul>,
    );
    expect(screen.getByRole('listitem')).toHaveAttribute('data-trust-icon', 'delivery');
  });
});
