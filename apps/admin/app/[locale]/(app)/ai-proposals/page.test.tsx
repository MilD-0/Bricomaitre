import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { accessMock, hasDbMock, legacyUiMock, loadMock, parseMock } = vi.hoisted(() => ({
  accessMock: vi.fn(),
  hasDbMock: vi.fn(),
  legacyUiMock: vi.fn(),
  loadMock: vi.fn(),
  parseMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  getDb: () => ({ kind: 'db' }),
  hasDb: hasDbMock,
}));
vi.mock('../../../../lib/page-access', () => ({
  requireAiProposalPageAccess: accessMock,
}));
vi.mock('../../../../lib/admin-ui-preference.server', () => ({
  readLegacyUiPreference: legacyUiMock,
}));
vi.mock('../../../../lib/ai-proposal-inbox', () => ({
  aiProposalInboxQuerySchema: { parse: (value: unknown) => value },
  loadAiProposalInbox: loadMock,
  parseAiProposalInboxQuery: parseMock,
}));
vi.mock('../../../../components/products/ai-proposal-inbox', () => ({
  AiProposalInbox: () => <div>Legacy proposal inbox</div>,
}));
vi.mock('../../../../components/products/ai-proposal-workspace', () => ({
  AiProposalWorkspace: () => <div>Proposal review workspace</div>,
}));

import AiProposalPage from './page';

const query = {
  page: 2,
  pageSize: 20,
  sort: 'newest',
  q: 'drill',
  proposalType: null,
  entityType: null,
  model: null,
  expiry: 'all',
  evidence: 'all',
};

describe('AI proposal page', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    parseMock.mockReturnValue(query);
    hasDbMock.mockReturnValue(true);
    loadMock.mockResolvedValue({
      items: [],
      query,
      pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
      facets: { proposalTypes: [], entityTypes: [], models: [] },
    });
    legacyUiMock.mockResolvedValue(true);
  });

  it('keeps the original inbox when legacy UI is enabled', async () => {
    render(
      await AiProposalPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({ page: '2', q: 'drill' }),
      }),
    );

    expect(screen.getByText('Legacy proposal inbox')).toBeInTheDocument();
    expect(accessMock).toHaveBeenCalledWith('en');
    expect(loadMock).toHaveBeenCalledWith({ kind: 'db' }, query);
  });

  it('uses the accepted workspace when legacy UI is disabled', async () => {
    legacyUiMock.mockResolvedValue(false);

    render(
      await AiProposalPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByText('Proposal review workspace')).toBeInTheDocument();
    expect(screen.queryByText('Legacy proposal inbox')).not.toBeInTheDocument();
  });
});
