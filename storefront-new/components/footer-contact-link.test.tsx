import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FooterContactLink } from './footer-contact-link';

const animation = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));

vi.mock('@/components/ui/phone', async () => {
  const React = await import('react');
  const PhoneIcon = React.forwardRef((_props, ref) => {
    React.useImperativeHandle(ref, () => ({ startAnimation: animation.start, stopAnimation: animation.stop }));
    return <svg data-testid="animated-phone" />;
  });
  PhoneIcon.displayName = 'MockPhoneIcon';
  return {
    PhoneIcon,
  };
});

describe('FooterContactLink', () => {
  beforeEach(() => {
    animation.start.mockClear();
    animation.stop.mockClear();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    vi.stubGlobal('IntersectionObserver', undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('loads the owned animated icon near the footer and responds to hover and focus', async () => {
    render(<FooterContactLink icon="phone" href="tel:+213778810360">0778 81 03 60</FooterContactLink>);
    const link = screen.getByRole('link', { name: '0778 81 03 60' });

    await waitFor(() => expect(screen.getByTestId('animated-phone')).toBeVisible());
    fireEvent.mouseEnter(link);
    fireEvent.mouseLeave(link);
    fireEvent.focus(link);

    expect(animation.start).toHaveBeenCalledTimes(2);
    expect(animation.stop).toHaveBeenCalledOnce();
  });

  it('does not start decorative motion when reduced motion is requested', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    render(<FooterContactLink icon="phone" href="tel:+213778810360">0778 81 03 60</FooterContactLink>);
    const link = screen.getByRole('link', { name: '0778 81 03 60' });

    await waitFor(() => expect(screen.getByTestId('animated-phone')).toBeVisible());
    fireEvent.mouseEnter(link);
    fireEvent.focus(link);

    expect(animation.start).not.toHaveBeenCalled();
  });
});
