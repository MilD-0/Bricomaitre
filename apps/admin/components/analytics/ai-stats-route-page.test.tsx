import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAiStatsDataMock, hasDbMock, requirePageAccessMock } = vi.hoisted(() => ({
  getAiStatsDataMock: vi.fn(),
  hasDbMock: vi.fn(),
  requirePageAccessMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: hasDbMock }));
vi.mock('../../lib/page-access', () => ({ requirePageAccess: requirePageAccessMock }));
vi.mock('../../lib/ai-stats', async () => {
  const actual = await vi.importActual<typeof import('../../lib/ai-stats')>('../../lib/ai-stats');
  return { ...actual, getAiStatsData: getAiStatsDataMock };
});
vi.mock('./ai-stats-workspace', () => ({
  AiStatsWorkspace: ({ initialData }: { initialData: { marker: string } }) => (
    <div>{initialData.marker}</div>
  ),
}));

import { AiStatsRoutePage } from './ai-stats-route-page';

describe('AiStatsRoutePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasDbMock.mockReturnValue(true);
    requirePageAccessMock.mockResolvedValue(undefined);
    getAiStatsDataMock.mockResolvedValue({ marker: 'AI route data' });
  });

  it('pins the surface to the page while accepting shared range filters', async () => {
    render(
      await AiStatsRoutePage({
        locale: 'en',
        surface: 'operations',
        searchParams: Promise.resolve({
          surface: 'shopping',
          range: '90d',
          grain: 'week',
        }),
      }),
    );

    expect(requirePageAccessMock).toHaveBeenCalledWith('en', 'stats');
    expect(getAiStatsDataMock).toHaveBeenCalledWith({
      surface: 'operations',
      range: '90d',
      grain: 'week',
    });
    expect(screen.getByText('AI route data')).toBeInTheDocument();
  });

  it('falls back without changing the requested surface', async () => {
    await AiStatsRoutePage({
      locale: 'fr',
      surface: 'shopping',
      searchParams: Promise.resolve({ range: 'custom', startDate: '2026-08-01' }),
    });

    expect(getAiStatsDataMock).toHaveBeenCalledWith({
      surface: 'shopping',
      range: '30d',
      grain: 'auto',
    });
  });
});
