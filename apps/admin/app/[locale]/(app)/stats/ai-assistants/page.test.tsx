import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../components/analytics2/ai-stats-route-page', () => ({
  AiStatsRoutePage: ({ locale, surface }: { locale: string; surface: string }) => (
    <div>{`${locale}:${surface}`}</div>
  ),
}));

import StatsAiAssistantsPage from './page';

describe('StatsAiAssistantsPage', () => {
  it('always renders the canonical AI operations workspace', async () => {
    render(await StatsAiAssistantsPage({ params: Promise.resolve({ locale: 'en' }) }));
    expect(screen.getByText('en:operations')).toBeInTheDocument();
  });
});
