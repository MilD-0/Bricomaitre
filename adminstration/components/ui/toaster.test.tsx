import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { toast } from '../../lib/toast';
import { Toaster } from './toaster';

describe('Toaster', () => {
  afterEach(() => {
    toast.clear();
  });

  it('renders styled toast content for active notifications', async () => {
    toast.success('Styled notification');

    const { container } = render(<Toaster />);

    expect(await screen.findByText('Styled notification')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss notification' })).toBeInTheDocument();
    expect(container.querySelector('.bg-card\\/95')).toBeTruthy();
    expect(container.querySelector('.shadow-\\[var\\(--shadow-vapor-strong\\)\\]')).toBeTruthy();
  });
});
