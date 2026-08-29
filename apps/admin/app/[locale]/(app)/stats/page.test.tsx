import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../components/analytics/analytics-route-page', () => ({
  StatsRoutePage: ({ locale, view }: { locale: string; view: string }) => (
    <div>{`${locale}:${view}`}</div>
  ),
}));

import StatsPage from './page';

describe('StatsPage', () => {
  it('always renders the canonical command workspace', async () => {
    render(await StatsPage({ params: Promise.resolve({ locale: 'fr' }) }));
    expect(screen.getByText('fr:command')).toBeInTheDocument();
  });
});
