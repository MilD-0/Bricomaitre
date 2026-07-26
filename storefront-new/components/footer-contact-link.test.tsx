import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FooterContactLink } from './footer-contact-link';

describe('FooterContactLink', () => {
  afterEach(cleanup);

  it('renders an icon-specific, CSS-interactive contact target without a client animation runtime', () => {
    render(<FooterContactLink icon="phone" href="tel:+213795342826">0795 34 28 26</FooterContactLink>);
    const link = screen.getByRole('link', { name: '0795 34 28 26' });

    expect(link).toHaveAttribute('data-contact-icon', 'phone');
    expect(link.querySelector('svg')).toBeInTheDocument();
  });

  it('keeps external contact link semantics', () => {
    render(<FooterContactLink icon="external" href="https://example.com" external>Facebook</FooterContactLink>);
    expect(screen.getByRole('link', { name: 'Facebook' })).toHaveAttribute('rel', 'noreferrer');
  });
});
