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

    render(<Toaster />);

    expect(await screen.findByText('Styled notification')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss notification' })).toBeInTheDocument();
    expect(document.body.querySelector('.bg-card\\/95')).toBeTruthy();
    expect(
      document.body.querySelector('.shadow-\\[var\\(--shadow-vapor-strong\\)\\]'),
    ).toBeTruthy();
  });

  it('keeps critical Ecotrack errors visible above modal-safe flows without auto-dismiss', async () => {
    toast.criticalError('Critical Ecotrack failure');

    render(<Toaster />);

    expect((await screen.findAllByText('Critical Ecotrack failure')).length).toBeGreaterThan(0);
    expect(document.body.querySelector('.z-\\[120\\]')).toBeTruthy();
  });
});
