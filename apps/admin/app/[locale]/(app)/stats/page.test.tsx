import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getTranslationsMock, requireStatsPageAccessMock, hasDbMock, getAnalyticsSectionDataMock } =
  vi.hoisted(() => ({
    getTranslationsMock: vi.fn(),
    requireStatsPageAccessMock: vi.fn(),
    hasDbMock: vi.fn(),
    getAnalyticsSectionDataMock: vi.fn(),
  }));

vi.mock('next-intl/server', () => ({
  getTranslations: getTranslationsMock,
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
}));

vi.mock('../../../../lib/page-access', () => ({
  requireStatsPageAccess: requireStatsPageAccessMock,
}));

vi.mock('../../../../lib/stats-sections', () => ({
  getAnalyticsSectionData: getAnalyticsSectionDataMock,
}));

vi.mock('../../../../components/stats/stats-dashboard', () => ({
  StatsDashboard: ({
    title,
    description,
    section,
    initialData,
  }: {
    title: string;
    description: string;
    section: string;
    initialData?: { summary?: { totalOrders?: number } } | null;
  }) => (
    <div>
      <p>{title}</p>
      <p>{description}</p>
      <p>{section}</p>
      <p>{initialData?.summary?.totalOrders ?? 'no-initial-data'}</p>
      <p>StatsDashboard</p>
    </div>
  ),
}));

import StatsPage from './page';

describe('StatsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireStatsPageAccessMock.mockResolvedValue(undefined);
    hasDbMock.mockReturnValue(true);
    getAnalyticsSectionDataMock.mockResolvedValue({ summary: { totalOrders: 12 } });
    getTranslationsMock.mockResolvedValue((key: string) => {
      if (key === 'nav.stats') return 'Stats';
      if (key === 'pages.stats') return 'Stats description';
      return key;
    });
  });

  it('renders the translated stats dashboard shell', async () => {
    const ui = await StatsPage({ params: Promise.resolve({ locale: 'en' }) });
    render(ui);

    expect(requireStatsPageAccessMock).toHaveBeenCalledWith('en');
    expect(getAnalyticsSectionDataMock).toHaveBeenCalledWith('overview', { range: '30d' });
    expect(screen.getByText('Stats')).toBeInTheDocument();
    expect(screen.getByText('Stats description')).toBeInTheDocument();
    expect(screen.getByText('overview')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('StatsDashboard')).toBeInTheDocument();
  });

  it('skips server stats hydration when the database is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const ui = await StatsPage({ params: Promise.resolve({ locale: 'en' }) });
    render(ui);

    expect(getAnalyticsSectionDataMock).not.toHaveBeenCalled();
    expect(screen.getByText('no-initial-data')).toBeInTheDocument();
  });
});
