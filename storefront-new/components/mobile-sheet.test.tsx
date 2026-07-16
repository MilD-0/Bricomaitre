import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MobileSheet } from './mobile-sheet';

describe('MobileSheet', () => {
  afterEach(cleanup);

  it('portals above page content, traps focus, and closes with Escape', () => {
    const onClose = vi.fn();
    render(
      <header>
        <MobileSheet title="Navigation" closeLabel="Close" onClose={onClose} footer={<a href="/checkout">Checkout</a>}>
          <button type="button">First action</button>
        </MobileSheet>
      </header>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Navigation' });
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(document.body).toHaveStyle({ overflow: 'hidden' });

    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', code: 'Tab', shiftKey: true });
    expect(screen.getByRole('link', { name: 'Checkout' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
