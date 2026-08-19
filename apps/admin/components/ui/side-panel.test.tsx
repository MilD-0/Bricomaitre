import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SidePanel } from './side-panel';

describe('SidePanel', () => {
  afterEach(() => cleanup());

  it('exposes an accessible modal boundary and closes with Escape', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <SidePanel
        open
        onOpenChange={onOpenChange}
        title="Edit product"
        description="Catalog details"
        closeLabel="Close editor"
        footer={<button type="button">Save</button>}
      >
        <label>
          Product name
          <input />
        </label>
      </SidePanel>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Edit product' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Catalog details')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close editor' })).toHaveFocus());

    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('provides a dedicated close control', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <SidePanel open onOpenChange={onOpenChange} title="Edit order" closeLabel="Close editor">
        Order fields
      </SidePanel>,
    );

    await user.click(screen.getByRole('button', { name: 'Close editor' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
