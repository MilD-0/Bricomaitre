import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SplitActionButton } from './split-action-button';

describe('SplitActionButton', () => {
  it('keeps a compact mobile primary action accessible and uses logical menu alignment', async () => {
    const primary = vi.fn();
    render(
      <SplitActionButton
        label="Dispatch shipment"
        compactOnMobile
        onPrimaryClick={primary}
        options={[{ key: 'history', label: 'Show history', onSelect: vi.fn() }]}
      />,
    );

    const action = screen.getByRole('button', { name: 'Dispatch shipment' });
    expect(action).toHaveClass('max-sm:size-10');
    expect(action.querySelector('span')).toHaveClass('max-sm:sr-only');
    await userEvent.click(action);
    expect(primary).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole('button', { name: 'Dispatch shipment menu' }));
    expect(screen.getByRole('menu')).toHaveClass('end-0');
    expect(screen.getByRole('menuitem', { name: 'Show history' })).toHaveClass('text-start');
  });
});
