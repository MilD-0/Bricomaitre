import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductTrustSignal } from './product-trust-signal';

const animation = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));

function mockAnimatedIcon(testId: string) {
  return async () => {
    const React = await import('react');
    const Icon = React.forwardRef((_props, ref) => {
      React.useImperativeHandle(ref, () => ({ startAnimation: animation.start, stopAnimation: animation.stop }));
      return <svg data-testid={testId} />;
    });
    Icon.displayName = `Mock${testId}`;
    return Icon;
  };
}

vi.mock('@/components/ui/phone', async () => ({ PhoneIcon: await mockAnimatedIcon('phone')() }));
vi.mock('@/components/ui/hand-coins', async () => ({ HandCoinsIcon: await mockAnimatedIcon('payment')() }));
vi.mock('@/components/ui/truck', async () => ({ TruckIcon: await mockAnimatedIcon('delivery')() }));

describe('ProductTrustSignal', () => {
  beforeEach(() => {
    animation.start.mockClear();
    animation.stop.mockClear();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('animates the owned lucide icon from the full trust-signal hover target', () => {
    render(<ul><ProductTrustSignal icon="payment">Cash on delivery</ProductTrustSignal></ul>);
    const signal = screen.getByRole('listitem');

    expect(screen.getByTestId('payment')).toBeVisible();
    fireEvent.mouseEnter(signal);
    fireEvent.mouseLeave(signal);

    expect(animation.start).toHaveBeenCalledOnce();
    expect(animation.stop).toHaveBeenCalledOnce();
  });

  it('respects reduced-motion preferences', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    render(<ul><ProductTrustSignal icon="delivery">Delivery</ProductTrustSignal></ul>);

    fireEvent.mouseEnter(screen.getByRole('listitem'));

    expect(animation.start).not.toHaveBeenCalled();
  });
});
