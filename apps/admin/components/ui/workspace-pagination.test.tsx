import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../messages/en.json';
import { WorkspacePagination } from './workspace-pagination';

function renderPagination(component: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {component}
    </NextIntlClientProvider>,
  );
}

describe('WorkspacePagination', () => {
  it('renders a compact page neighborhood and changes pages', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    renderPagination(
      <WorkspacePagination currentPage={8} totalPages={20} onPageChange={onPageChange} />,
    );

    expect(screen.getByText('Page 8 of 20')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to page 8' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(9);
  });

  it('disables transitions while data is pending', () => {
    const pagination = renderPagination(
      <WorkspacePagination currentPage={2} totalPages={4} pending onPageChange={() => undefined} />,
    );

    expect(within(pagination.container).getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(within(pagination.container).getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('does not render for a single page', () => {
    const { container } = renderPagination(
      <WorkspacePagination currentPage={1} totalPages={1} onPageChange={() => undefined} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
