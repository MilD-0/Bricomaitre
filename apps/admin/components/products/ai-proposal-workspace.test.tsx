import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { pushMock, replaceMock } = vi.hoisted(() => ({ pushMock: vi.fn(), replaceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

import messages from '../../messages/en.json';
import type { AiProposalInboxData, AiProposalInboxItem } from '../../lib/ai-proposal-inbox';
import { toast } from '../../lib/toast';
import { server } from '../../test/mocks/server';
import { Toaster } from '../ui/toaster';

import { AiProposalWorkspace } from './ai-proposal-workspace';

const activeProposal: AiProposalInboxItem = {
  id: 1,
  proposalType: 'product_content',
  entityType: 'products',
  entityId: 42,
  payload: {
    before: { title: 'Old title', active: true },
    changes: { title: 'New title', active: false },
  },
  reasoning: 'The current title omits the product family.',
  evidence: [
    {
      label: 'Manufacturer page',
      url: 'https://example.com/product',
      excerpt: 'Official product family: XR.',
    },
  ],
  confidence: 0.91,
  requestedBy: 'owner@example.com',
  expiresAt: '2099-08-26T00:00:00.000Z',
  createdAt: '2026-08-19T10:00:00.000Z',
  task: 'product_content_proposal',
  model: 'deepseek-v4',
};

const expiredProposal: AiProposalInboxItem = {
  id: 2,
  proposalType: 'product_category',
  entityType: 'products',
  entityId: 43,
  payload: { before: { categoryId: null }, changes: { categoryId: 10 } },
  reasoning: null,
  evidence: [],
  confidence: null,
  requestedBy: null,
  expiresAt: '2025-01-01T00:00:00.000Z',
  createdAt: '2026-08-18T10:00:00.000Z',
  task: 'product_categorization',
  model: 'deepseek-v4',
};

function data(items = [activeProposal, expiredProposal]): AiProposalInboxData {
  return {
    items,
    query: {
      page: 1,
      pageSize: 20,
      sort: 'newest',
      q: null,
      proposalType: null,
      entityType: null,
      model: null,
      expiry: 'all',
      evidence: 'all',
    },
    pagination: { page: 1, pageSize: 20, total: 42, totalPages: 3 },
    facets: {
      proposalTypes: ['product_category', 'product_content'],
      entityTypes: ['products'],
      models: ['deepseek-v4'],
    },
  };
}

function setWideLayout(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

function renderWorkspace(initialData = data()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AiProposalWorkspace initialData={initialData} now="2026-08-19T12:00:00.000Z" />
      <Toaster />
    </NextIntlClientProvider>,
  );
}

describe('AI proposal review workspace preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setWideLayout(true);
  });

  afterEach(() => {
    cleanup();
    toast.clear();
  });

  it('uses a concise queue with an exact persistent review inspector', () => {
    renderWorkspace();

    expect(screen.getByText('Title, Active')).toBeInTheDocument();
    expect(screen.getAllByText('Category Id').length).toBeGreaterThan(0);
    expect(screen.getByText('Old title')).toBeInTheDocument();
    expect(screen.getByText('New title')).toBeInTheDocument();
    expect(screen.getByText('The current title omits the product family.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Manufacturer page/ })).toHaveAttribute(
      'href',
      'https://example.com/product',
    );
    expect(screen.getByText('owner@example.com')).toBeInTheDocument();
    expect(screen.getByTestId('proposal-review-workspace')).toHaveClass(
      'min-h-0',
      'xl:h-[calc(100dvh-13.5rem)]',
      'xl:max-h-[48rem]',
    );
  });

  it('keeps secondary filters behind one compact disclosure', async () => {
    renderWorkspace();

    expect(screen.getByText('42 proposals')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Proposal type' })).not.toBeInTheDocument();
    const filters = screen.getByRole('button', { name: 'Filters' });
    expect(filters).toHaveAttribute('aria-label', 'Filters');
    await userEvent.click(filters);

    expect(screen.getByRole('combobox', { name: 'Proposal type' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Entity type' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Model' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Expiry' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Evidence' })).toBeInTheDocument();
  });

  it('preserves applied and edited filters when their disclosure closes', async () => {
    const initialData = data();
    initialData.query.model = 'deepseek-v4';
    const view = renderWorkspace(initialData);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Expiry' }), 'active');
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.queryByRole('combobox', { name: 'Model' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox'), 'drill');

    const submitted = new FormData(view.container.querySelector('form')!);
    expect(Object.fromEntries(submitted)).toMatchObject({
      model: 'deepseek-v4',
      expiry: 'active',
      q: 'drill',
      page: '1',
      pageSize: '20',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByRole('combobox', { name: 'Expiry' })).toHaveValue('active');
  });

  it.each(['approve', 'delete'] as const)(
    'returns to the previous page after %s removes its last remaining proposal',
    async (action) => {
      const item = action === 'approve' ? activeProposal : expiredProposal;
      const initialData = data([item]);
      initialData.query.page = 2;
      initialData.query.model = 'deepseek-v4';
      initialData.pagination = { page: 2, pageSize: 20, total: 21, totalPages: 2 };
      server.use(
        http.patch('/api/ai/proposals/:id', () =>
          HttpResponse.json({ proposal: { status: 'applied' } }),
        ),
        http.delete('/api/ai/proposals/:id', () => HttpResponse.json({ deleted: { id: item.id } })),
      );
      renderWorkspace(initialData);
      const button = action === 'approve' ? 'Approve' : 'Delete expired';
      await userEvent.click(screen.getByRole('button', { name: button }));
      await userEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: button }),
      );
      await waitFor(() => expect(replaceMock).toHaveBeenCalledOnce());
      const query = new URLSearchParams(replaceMock.mock.calls[0]![0]);
      expect(query.get('page')).toBe('1');
      expect(query.get('model')).toBe('deepseek-v4');
    },
  );

  it('reveals bulk review controls only after selection and blocks expired approval', async () => {
    renderWorkspace();

    expect(screen.queryByRole('button', { name: 'Approve selected (2)' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Product content #1' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Product category #2' }));

    expect(screen.getByRole('button', { name: 'Reject selected (2)' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Approve selected (2)' })).toBeDisabled();
    expect(screen.getByText('Expired proposals cannot be approved.')).toBeInTheDocument();
  });

  it('confirms and applies one proposal before removing it from the queue', async () => {
    const calls: Array<{ id: string; body: unknown }> = [];
    server.use(
      http.patch('/api/ai/proposals/:id', async ({ params, request }) => {
        calls.push({ id: String(params.id), body: await request.json() });
        return HttpResponse.json({ proposal: { id: Number(params.id), status: 'applied' } });
      }),
    );
    renderWorkspace();

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const confirmation = screen.getByRole('dialog', { name: 'Approve this proposal?' });
    expect(within(confirmation).getByText(/applied to the catalog/)).toBeInTheDocument();
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(calls).toEqual([{ id: '1', body: { action: 'approve' } }]));
    await waitFor(() => expect(screen.queryByText('Title, Active')).not.toBeInTheDocument());
    expect(await screen.findByText('Approved 1 proposals.')).toBeInTheDocument();
  });

  it('keeps failed proposals visible after a partially successful bulk review', async () => {
    server.use(
      http.patch('/api/ai/proposals/1', () =>
        HttpResponse.json({ proposal: { id: 1, status: 'rejected' } }),
      ),
      http.patch('/api/ai/proposals/2', () =>
        HttpResponse.json({ error: 'Already reviewed' }, { status: 409 }),
      ),
    );
    renderWorkspace();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Product content #1' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Product category #2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reject selected (2)' }));
    const confirmation = screen.getByRole('dialog', { name: 'Reject this proposal?' });
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Reject' }));

    await waitFor(() => expect(screen.queryByText('Title, Active')).not.toBeInTheDocument());
    expect(screen.getAllByText('Category Id').length).toBeGreaterThan(0);
    expect(await screen.findByText('#2: Already reviewed')).toBeInTheDocument();
  });

  it('confirms and deletes only expired proposals visible on the page', async () => {
    const deleted: string[] = [];
    server.use(
      http.delete('/api/ai/proposals/:id', ({ params }) => {
        deleted.push(String(params.id));
        return HttpResponse.json({ deleted: { id: Number(params.id) } });
      }),
    );
    renderWorkspace();

    expect(screen.getByText('42 proposals')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete expired' }));
    const confirmation = screen.getByRole('dialog', { name: 'Delete expired proposals?' });
    expect(
      within(confirmation).getByText(/1 expired proposals shown on this page/),
    ).toBeInTheDocument();
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Delete expired' }));

    await waitFor(() => expect(deleted).toEqual(['2']));
    await waitFor(() => expect(screen.queryByText('Category Id')).not.toBeInTheDocument());
    expect(screen.getByText('41 proposals')).toBeInTheDocument();
    expect(screen.getByText('Title, Active')).toBeInTheDocument();
    expect(await screen.findByText('Deleted 1 expired proposals.')).toBeInTheDocument();
  });

  it('uses a deliberate list-to-detail sheet below the desktop breakpoint', async () => {
    setWideLayout(false);
    renderWorkspace();

    expect(screen.queryByText('Old title')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Product content/ }));

    const sheet = await screen.findByRole('dialog', { name: 'Product content' });
    expect(within(sheet).getByText('Old title')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close review' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('uses strong route-backed pagination', async () => {
    renderWorkspace();

    await userEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));

    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('page=2'));
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('sort=newest'));
  });
});
