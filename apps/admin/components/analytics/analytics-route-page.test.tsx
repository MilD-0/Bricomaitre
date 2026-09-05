import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAnalyticsDataMock, hasDbMock, requireStatsPageAccessMock } = vi.hoisted(() => ({
  getAnalyticsDataMock: vi.fn(),
  hasDbMock: vi.fn(),
  requireStatsPageAccessMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: hasDbMock }));
vi.mock('../../lib/page-access', () => ({ requireStatsPageAccess: requireStatsPageAccessMock }));
vi.mock('../../lib/analytics-snapshots', () => ({ getAnalyticsSnapshot: getAnalyticsDataMock }));
vi.mock('./analytics-workspace', () => ({
  StatsWorkspace: ({ initialData }: { initialData: { marker: string } }) => (
    <div>{initialData.marker}</div>
  ),
}));

import { StatsRoutePage } from './analytics-route-page';

describe('StatsRoutePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasDbMock.mockReturnValue(true);
    requireStatsPageAccessMock.mockResolvedValue(undefined);
    getAnalyticsDataMock.mockResolvedValue({ marker: 'route data' });
  });

  it('pins the data view to the page while accepting shared filters', async () => {
    const ui = await StatsRoutePage({
      locale: 'en',
      view: 'money',
      searchParams: Promise.resolve({ range: '90d', grain: 'week', view: 'catalog' }),
    });
    render(ui);

    expect(requireStatsPageAccessMock).toHaveBeenCalledWith('en');
    expect(getAnalyticsDataMock).toHaveBeenCalledWith({
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

    expect(getAnalyticsDataMock).toHaveBeenCalledWith({
      view: 'search',
      range: '30d',
      grain: 'auto',
    });
  });
});
