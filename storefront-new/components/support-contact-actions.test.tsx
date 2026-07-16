import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SupportContactActions } from './support-contact-actions';

const analytics = vi.hoisted(() => vi.fn());
const haptics = vi.hoisted(() => ({ prepare: vi.fn(), trigger: vi.fn() }));

vi.mock('@/lib/analytics', () => ({ trackNavigationEvent: analytics }));
vi.mock('@/lib/haptics', () => ({ prepareHaptics: haptics.prepare, triggerHaptic: haptics.trigger }));

const contact = {
  phoneDisplay: '0795 34 28 26',
  phoneHref: 'tel:+213795342826',
  phoneEnabled: true,
};

describe('SupportContactActions', () => {
  beforeEach(() => {
    analytics.mockReset();
    haptics.prepare.mockReset();
    haptics.trigger.mockReset();
  });

  it('offers a direct call action without tracking the phone number', () => {
    render(<SupportContactActions locale="fr" contact={contact} surface="checkout" labels={{ title: 'Besoin d’aide ?', call: 'Appeler' }} />);

    const call = screen.getByRole('link', { name: /Appeler.*0795 34 28 26/ });
    expect(call).toHaveAttribute('href', 'tel:+213795342826');

    fireEvent.click(call);

    expect(analytics).toHaveBeenNthCalledWith(1, expect.objectContaining({ metadata: { surface: 'checkout', target: 'call' } }));
    expect(JSON.stringify(analytics.mock.calls)).not.toContain('0795');
    expect(haptics.trigger).toHaveBeenNthCalledWith(1, 'primary');
  });

  it('does not render when calls are disabled', () => {
    const { container } = render(<SupportContactActions locale="fr" contact={{ ...contact, phoneEnabled: false }} surface="thank_you" labels={{ title: 'Support', call: 'Call' }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
