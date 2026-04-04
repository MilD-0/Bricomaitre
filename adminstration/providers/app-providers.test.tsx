import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppProviders } from './app-providers';

describe('AppProviders', () => {
  it('renders children inside the application providers', () => {
    render(
      <AppProviders locale="en" messages={{}}>
        <div>provider-child</div>
      </AppProviders>,
    );

    expect(screen.getByText('provider-child')).toBeInTheDocument();
  });
});
