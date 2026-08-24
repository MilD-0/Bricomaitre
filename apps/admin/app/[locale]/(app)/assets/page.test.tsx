import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../components/assets/assets-workspace-page', () => ({
  AssetsWorkspacePage: ({ locale, view }: { locale: string; view: string }) => (
    <div>{`${locale}:${view}`}</div>
  ),
}));

import AssetsPage from './page';

describe('AssetsPage', () => {
  it('always renders the canonical banners workspace', async () => {
    render(await AssetsPage({ params: Promise.resolve({ locale: 'fr' }) }));
    expect(screen.getByText('fr:banners')).toBeInTheDocument();
  });
});
