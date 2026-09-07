import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { access, load, parse } = vi.hoisted(() => ({
  access: vi.fn(),
  load: vi.fn(),
  parse: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: () => ({ kind: 'db' }), hasDb: () => true }));
vi.mock('@/lib/page-access', () => ({ requirePageAccess: access }));
vi.mock('@/lib/ai-proposal-inbox', () => ({
  aiProposalInboxQuerySchema: { parse: (value: unknown) => value },
  loadAiProposalInbox: load,
  parseAiProposalInboxQuery: parse,
}));
vi.mock('@/components/products/ai-proposal-workspace', () => ({
  AiProposalWorkspace: () => <div>Proposal review workspace</div>,
}));

import AiProposalPage from './page';

const query = {
  page: 1,
  pageSize: 20,
  sort: 'newest',
  q: '',
  proposalType: null,
  entityType: null,
  model: null,
  expiry: 'all',
  evidence: 'all',
};

describe('AiProposalPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    access.mockResolvedValue(undefined);
    parse.mockReturnValue(query);
    load.mockResolvedValue({
      items: [],
      query,
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
      facets: { proposalTypes: [], entityTypes: [], models: [] },
    });
  });

  it('always renders the canonical proposal review workspace', async () => {
    render(
      await AiProposalPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(access).toHaveBeenCalledWith('en', 'aiProposals');
    expect(load).toHaveBeenCalledWith({ kind: 'db' }, query);
    expect(screen.getByText('Proposal review workspace')).toBeInTheDocument();
  });
});
