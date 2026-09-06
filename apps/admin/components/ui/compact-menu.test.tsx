import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CompactMenu, CompactMenuItem } from './compact-menu';

describe('CompactMenu', () => {
  afterEach(() => vi.restoreAllMocks());
  it('opens, selects an action, and closes', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <CompactMenu label="Product actions">
        <CompactMenuItem onClick={onClick}>Archive</CompactMenuItem>
      </CompactMenu>,
    );

    await user.click(screen.getByRole('button', { name: 'Product actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on outside interaction and restores trigger focus after Escape', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <CompactMenu label="Order actions">
          <CompactMenuItem onClick={() => undefined}>Open</CompactMenuItem>
        </CompactMenu>
        <button type="button">Outside</button>
      </div>,
    );

    const trigger = screen.getByRole('button', { name: 'Order actions' });
    await user.click(trigger);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('can open above its trigger near the bottom of a workspace', async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.getAttribute('role') === 'menu'
        ? DOMRect.fromRect({ width: 180, height: 100 })
        : DOMRect.fromRect({ x: 264, y: 700, width: 36, height: 36 });
    });
    render(
      <CompactMenu label="Bottom row actions" side="top">
        <CompactMenuItem onClick={() => undefined}>Edit</CompactMenuItem>
      </CompactMenu>,
    );

    await user.click(screen.getByRole('button', { name: 'Bottom row actions' }));

    expect(screen.getByRole('menu').parentElement).toBe(document.body);
    expect(screen.getByRole('menu')).toHaveStyle({ top: '594px', left: '120px' });
  });
});
