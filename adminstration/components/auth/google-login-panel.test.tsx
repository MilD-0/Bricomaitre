import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GoogleLoginPanel } from './google-login-panel';

describe('GoogleLoginPanel', () => {
  it('renders exactly one Google sign-in button', () => {
    render(
      <GoogleLoginPanel
        signInLabel="Sign in with Google"
        onSignIn={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
  });
});
