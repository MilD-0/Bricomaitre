import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAnalytics2DataMock, hasDbMock, requireStatsPageAccessMock } = vi.hoisted(() => ({
  getAnalytics2DataMock: vi.fn(),
  hasDbMock: vi.fn(),
  requireStatsPageAccessMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: hasDbMock }));
vi.mock('../../lib/page-access', () => ({ requireStatsPageAccess: requireStatsPageAccessMock }));
vi.mock('../../lib/analytics2', async () => {
  const actual =
    await vi.importActual<typeof import('../../lib/analytics2')>('../../lib/analytics2');
  return { ...actual, getAnalytics2Data: getAnalytics2DataMock };
});
vi.mock('./analytics2-workspace', () => ({
  StatsWorkspace: ({ initialData }: { initialData: { marker: string } }) => (
    <div>{initialData.marker}</div>
  ),
}));

import { StatsRoutePage } from './analytics2-route-page';

describe('StatsRoutePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasDbMock.mockReturnValue(true);
    requireStatsPageAccessMock.mockResolvedValue(undefined);
    getAnalytics2DataMock.mockResolvedValue({ marker: 'route data' });
  });

  it('pins the data view to the page while accepting shared filters', async () => {
    const ui = await StatsRoutePage({
      locale: 'en',
      view: 'money',
      searchParams: Promise.resolve({ range: '90d', grain: 'week', view: 'catalog' }),
    });
    render(ui);

    expect(requireStatsPageAccessMock).toHaveBeenCalledWith('en');
    expect(getAnalytics2DataMock).toHaveBeenCalledWith({
      view: 'money',
      range: '90d',
      grain: 'week',
    });
    expect(screen.getByText('route data')).toBeInTheDocument();
  });

  it('keeps the requested page when malformed range filters fall back', async () => {
    await StatsRoutePage({
      locale: 'fr',
      view: 'search',
      searchParams: Promise.resolve({ range: 'custom', startDate: '2026-08-01' }),
    });

    expect(getAnalytics2DataMock).toHaveBeenCalledWith({
      view: 'search',
      range: '30d',
      grain: 'auto',
    });
  });
});
