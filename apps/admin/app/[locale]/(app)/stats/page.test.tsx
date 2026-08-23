import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getTranslationsMock,
  requireStatsPageAccessMock,
  hasDbMock,
  getAnalyticsSectionDataMock,
  readLegacyUiPreferenceMock,
} = vi.hoisted(() => ({
  getTranslationsMock: vi.fn(),
  requireStatsPageAccessMock: vi.fn(),
  hasDbMock: vi.fn(),
  getAnalyticsSectionDataMock: vi.fn(),
  readLegacyUiPreferenceMock: vi.fn(),
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

vi.mock('../../../../lib/admin-ui-preference.server', () => ({
  readLegacyUiPreference: readLegacyUiPreferenceMock,
}));

vi.mock('../../../../components/analytics2/analytics2-route-page', () => ({
  StatsRoutePage: ({ view }: { view: string }) => <div>Modern stats · {view}</div>,
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
    readLegacyUiPreferenceMock.mockResolvedValue(true);
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

  it('replaces the legacy dashboard with the modern overview when legacy UI is off', async () => {
    readLegacyUiPreferenceMock.mockResolvedValue(false);

    const ui = await StatsPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ range: '90d', grain: 'week' }),
    });
    render(ui);

    expect(screen.getByText('Modern stats · command')).toBeInTheDocument();
    expect(getAnalyticsSectionDataMock).not.toHaveBeenCalled();
    expect(requireStatsPageAccessMock).not.toHaveBeenCalled();
  });
});
