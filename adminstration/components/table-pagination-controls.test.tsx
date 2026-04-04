import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../messages/en.json';
import { TablePaginationControls } from './table-pagination-controls';

describe('TablePaginationControls', () => {
  it('renders numbered navigation and supports jump-to-page submission', async () => {
    const onPageChange = vi.fn();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <TablePaginationControls currentPage={10} totalPages={20} onPageChange={onPageChange} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText('Page 10 of 20')).toBeInTheDocument();
    expect(screen.getAllByText('...').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'Go to page 11' }));
    expect(onPageChange).toHaveBeenCalledWith(11);

    const jumpInput = screen.getByRole('spinbutton', { name: 'Go to page' });
    await userEvent.clear(jumpInput);
    await userEvent.type(jumpInput, '20');
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));

    expect(onPageChange).toHaveBeenCalledWith(20);
  });
});
