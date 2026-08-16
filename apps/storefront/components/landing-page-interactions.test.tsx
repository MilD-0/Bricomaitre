import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  trigger: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('@/lib/haptics', () => ({ prepareHaptics: mocks.prepare, triggerHaptic: mocks.trigger }));
vi.mock('@/components/ui/arrow-up-right', async () => {
  const React = await import('react');
  const ArrowUpRightIcon = React.forwardRef((_props, ref) => {
    React.useImperativeHandle(ref, () => ({
      startAnimation: mocks.start,
      stopAnimation: mocks.stop,
    }));
    return <span data-testid="animated-arrow" />;
  });
  ArrowUpRightIcon.displayName = 'MockArrowUpRightIcon';
  return { ArrowUpRightIcon };
});

import { LandingFaqItem, LandingFinalCtaLink, LandingMobileCta } from './landing-page-interactions';

describe('landing page interactions', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it('gives FAQ disclosure a deliberate control response without firing on mount', () => {
    render(<LandingFaqItem question="Comment commander ?" answer="Avec le formulaire." />);
    const summary = screen.getByText('Comment commander ?').closest('summary')!;
    expect(mocks.trigger).not.toHaveBeenCalled();
    fireEvent.pointerDown(summary);
    fireEvent(summary.parentElement!, new Event('toggle'));
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.trigger).toHaveBeenCalledWith('control');

    mocks.trigger.mockClear();
    fireEvent.pointerDown(summary);
    fireEvent.pointerCancel(summary);
    fireEvent(summary.parentElement!, new Event('toggle'));
    expect(mocks.trigger).not.toHaveBeenCalled();
  });

  it('animates and haptically confirms the final conversion CTA', () => {
    render(<LandingFinalCtaLink href="#landing-order" label="Commander" />);
    const link = screen.getByRole('link', { name: 'Commander' });
    fireEvent.pointerEnter(link);
    fireEvent.pointerDown(link);
    fireEvent.click(link);
    fireEvent.pointerLeave(link);
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.trigger).toHaveBeenCalledWith('primary');
    expect(mocks.start).toHaveBeenCalled();
    expect(mocks.stop).toHaveBeenCalledOnce();
  });

  it('keeps a mobile conversion CTA available until the order form enters view', () => {
    let notify: IntersectionObserverCallback = () => undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          notify = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    render(
      <>
        <div id="landing-order" />
        <LandingMobileCta href="#landing-order" label="Commander" price="4 500 DA" />
      </>,
    );
    const link = screen.getByRole('link', { name: 'Commander — 4 500 DA' });
    const bar = screen.getByLabelText('Commander');
    expect(link).toHaveAttribute('href', '#landing-order');
    expect(bar).toHaveAttribute('data-visible', 'true');
    expect(observe).toHaveBeenCalledWith(document.querySelector('#landing-order'));
    fireEvent.pointerDown(link);
    fireEvent.click(link);
    expect(mocks.trigger).toHaveBeenCalledWith('primary');
    act(() =>
      notify([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver),
    );
    expect(bar).toHaveAttribute('data-visible', 'false');
  });
});
