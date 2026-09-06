import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { toast } from '../../lib/toast';
import { Toaster } from './toaster';

describe('Toaster', () => {
  afterEach(() => {
    act(() => toast.clear());
    vi.useRealTimers();
  });

  it('renders a notification that the operator can dismiss', () => {
    toast.success('Saved');
    render(<Toaster />);
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('keeps critical errors until dismissal while ordinary notifications expire', () => {
    vi.useFakeTimers();
    toast.success('Saved');
    toast.criticalError('Carrier rejected the shipment');
    render(<Toaster />);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Carrier rejected the shipment');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
