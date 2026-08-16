import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Dialog, DialogContent } from './dialog';

describe('Dialog', () => {
  it('closes when pointer interaction starts and ends outside the content', async () => {
    const onOpenChange = vi.fn();

    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <button type="button">Inside</button>
        </DialogContent>
      </Dialog>,
    );

    const overlay = screen.getByRole('button', { name: 'Close dialog overlay' });

    fireEvent.pointerDown(overlay);
    fireEvent.pointerUp(overlay);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
