import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getTranslationsMock } = vi.hoisted(() => ({
  getTranslationsMock: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: getTranslationsMock,
}));

vi.mock('../../../../components/stats/stats-dashboard', () => ({
  StatsDashboard: ({
    title,
    description,
    section,
  }: {
    title: string;
    description: string;
    section: string;
  }) => (
    <div>
      <p>{title}</p>
      <p>{description}</p>
      <p>{section}</p>
    </div>
  ),
}));

describe.skip('Stats section pages', () => {
  const pageParams = { params: Promise.resolve({ locale: 'en' }) };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doMock('../../../../../lib/page-access', () => ({
      requireStatsPageAccess: vi.fn().mockResolvedValue(null),
    }));
    getTranslationsMock.mockResolvedValue((key: string) => {
      const translations: Record<string, string> = {
        'pages.stats': 'Stats description',
        'statsDashboard.tabs.products': 'Products',
        'statsDashboard.tabs.geography': 'Geography',
        'statsDashboard.tabs.time': 'Time',
        'statsDashboard.tabs.metaAds': 'Meta ads',
        'statsDashboard.manualOrders.sectionTitle': 'Manual orders',
        'statsDashboard.imports.title': 'Import spreadsheet',
      };

      return translations[key] ?? key;
    });
  });

  it('renders the products stats page', async () => {
    const { default: StatsProductsPage } = await import('./products/page');
    render(await StatsProductsPage(pageParams));
    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(screen.getByText('products')).toBeInTheDocument();
  });

  it('renders the geography stats page', async () => {
    const { default: StatsGeographyPage } = await import('./geography/page');
    render(await StatsGeographyPage(pageParams));
    expect(screen.getByText('Geography')).toBeInTheDocument();
    expect(screen.getByText('geography')).toBeInTheDocument();
  });

  it('renders the time stats page', async () => {
    const { default: StatsTimePage } = await import('./time/page');
    render(await StatsTimePage(pageParams));
    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByText('time')).toBeInTheDocument();
  });

  it('renders the meta ads stats page', async () => {
    const { default: StatsMetaAdsPage } = await import('./meta-ads/page');
    render(await StatsMetaAdsPage(pageParams));
    expect(screen.getByText('Meta ads')).toBeInTheDocument();
    expect(screen.getByText('metaAds')).toBeInTheDocument();
  });

  it('renders the manual orders stats page', async () => {
    const { default: StatsManualOrdersPage } = await import('./manual-orders/page');
    render(await StatsManualOrdersPage(pageParams));
    expect(screen.getByText('Manual orders')).toBeInTheDocument();
    expect(screen.getByText('manualOrders')).toBeInTheDocument();
  });

  it('renders the import history stats page', async () => {
    const { default: StatsImportHistoryPage } = await import('./import-history/page');
    render(await StatsImportHistoryPage(pageParams));
    expect(screen.getByText('Import spreadsheet')).toBeInTheDocument();
    expect(screen.getByText('imports')).toBeInTheDocument();
  });
});
