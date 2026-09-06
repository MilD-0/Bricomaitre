import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FooterContactLink } from './footer-contact-link';

describe('FooterContactLink', () => {
  afterEach(cleanup);

  it('keeps external contact link semantics', () => {
    render(
      <FooterContactLink icon="external" href="https://example.com" external>
        Facebook
      </FooterContactLink>,
    );
    expect(screen.getByRole('link', { name: 'Facebook' })).toHaveAttribute('rel', 'noreferrer');
  });
  it('renders an address without a destination as text', () => {
    render(
      <FooterContactLink icon="location" href={null}>
        Alger
      </FooterContactLink>,
    );
    expect(screen.getByText('Alger')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
