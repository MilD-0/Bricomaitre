import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getTranslationsMock, legacyUiMock } = vi.hoisted(() => ({
  getTranslationsMock: vi.fn(),
  legacyUiMock: vi.fn(),
}));

vi.mock('next-intl/server', () => ({ getTranslations: getTranslationsMock }));
vi.mock('../../../../../lib/admin-ui-preference.server', () => ({
  readLegacyUiPreference: legacyUiMock,
}));
vi.mock('../../../../../components/analytics2/ai-stats-route-page', () => ({
  AiStatsRoutePage: ({ surface }: { surface: string }) => <div>modern {surface}</div>,
}));
vi.mock('../../../../../components/stats/stats-dashboard', () => ({
  StatsDashboard: ({ section }: { section: string }) => <div>legacy {section}</div>,
}));

import StatsAiAssistantsPage from './page';

describe('AI assistants stats page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTranslationsMock.mockResolvedValue((key: string) => key);
  });

  it('uses the AI operations workspace when legacy UI is disabled', async () => {
    legacyUiMock.mockResolvedValue(false);
    render(
      await StatsAiAssistantsPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({ range: '90d' }),
      }),
    );
    expect(screen.getByText('modern operations')).toBeInTheDocument();
  });

  it('keeps the legacy dashboard while legacy UI remains enabled', async () => {
    legacyUiMock.mockResolvedValue(true);
    render(await StatsAiAssistantsPage({ params: Promise.resolve({ locale: 'en' }) }));
    expect(screen.getByText('legacy aiAssistants')).toBeInTheDocument();
  });
});
