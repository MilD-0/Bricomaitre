import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { SidePanel } from './side-panel';

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

it('keeps Escape, focus and scrolling with the topmost modal', async () => {
  const user = userEvent.setup();
  document.body.style.overflow = 'auto';
  function Modals() {
    const [outer, setOuter] = useState(false);
    const [inner, setInner] = useState(false);
    return (
      <>
        <button onClick={() => setOuter(true)}>Open editor</button>
        <Dialog open={outer} onOpenChange={setOuter}>
          <DialogContent>
            <button onClick={() => setInner(true)}>Open details</button>
            <button aria-hidden="false">Save editor</button>
            <div hidden>
              <button>Hidden action</button>
            </div>
          </DialogContent>
        </Dialog>
        <SidePanel open={inner} onOpenChange={setInner} title="Details" closeLabel="Close details">
          <button>Inner action</button>
        </SidePanel>
      </>
    );
  }
  render(<Modals />);
  const opener = screen.getByRole('button', { name: 'Open editor' });
  await user.click(opener);
  const details = screen.getByRole('button', { name: 'Open details' });
  await waitFor(() => expect(details).toHaveFocus());
  await user.tab();
  expect(screen.getByRole('button', { name: 'Save editor' })).toHaveFocus();
  await user.tab();
  expect(details).toHaveFocus();
  await user.click(details);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Close details' })).toHaveFocus());
  await user.keyboard('{Escape}');
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Details' })).not.toBeInTheDocument(),
  );
  expect(document.body.style.overflow).toBe('hidden');
  expect(details).toHaveFocus();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(document.body.style.overflow).toBe('auto');
  expect(opener).toHaveFocus();
});

it('restores scrolling when the lower modal closes first', () => {
  document.body.style.overflow = 'scroll';
  const view = (outer: boolean, inner: boolean) => (
    <>
      <Dialog open={outer} onOpenChange={() => {}}>
        <DialogContent>Editor</DialogContent>
      </Dialog>
      <SidePanel open={inner} onOpenChange={() => {}} title="Details" closeLabel="Close details">
        Details
      </SidePanel>
    </>
  );
  const { rerender, unmount } = render(view(true, true));
  rerender(view(false, true));
  expect(document.body.style.overflow).toBe('hidden');
  rerender(view(false, false));
  expect(document.body.style.overflow).toBe('scroll');
  unmount();
  document.body.style.overflow = '';
});
