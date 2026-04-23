import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getTranslationsMock, requireAdministrationPageAccessMock } = vi.hoisted(() => ({
  getTranslationsMock: vi.fn(),
  requireAdministrationPageAccessMock: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: getTranslationsMock,
}));

vi.mock('../../../../../lib/page-access', () => ({
  requireAdministrationPageAccess: requireAdministrationPageAccessMock,
}));

vi.mock('../../../../../components/paid-clicks-dashboard', () => ({
  PaidClicksDashboard: ({ title, description }: { title: string; description: string }) => (
    <div>
      <p>{title}</p>
      <p>{description}</p>
    </div>
  ),
}));

import StatsPaidClicksPage from './page';

describe('StatsPaidClicksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdministrationPageAccessMock.mockResolvedValue(null);
    getTranslationsMock.mockResolvedValue((key: string) => {
      const translations: Record<string, string> = {
        'statsDashboard.tabs.paidClicks': 'Paid clicks',
        'pages.stats': 'Stats description',
      };

      return translations[key] ?? key;
    });
  });

  it('renders the paid clicks dashboard for admin-level access', async () => {
    render(await StatsPaidClicksPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(requireAdministrationPageAccessMock).toHaveBeenCalledWith('en');
    expect(screen.getByText('Paid clicks')).toBeInTheDocument();
    expect(screen.getByText('Stats description')).toBeInTheDocument();
  });
});
