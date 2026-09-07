import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { requireAccess } = vi.hoisted(() => ({ requireAccess: vi.fn() }));

vi.mock('next-intl/server', () => ({ getTranslations: vi.fn() }));
vi.mock('@/components/brands-categories/taxonomy-workspace', () => ({
  TaxonomyWorkspace: ({ view }: { view: string }) => <div>{view}</div>,
}));
vi.mock('@/lib/page-access', () => ({
  requirePageAccess: requireAccess,
}));

import BrandsPage from './page';

describe('BrandsPage', () => {
  it('always renders the canonical brands workspace after enforcing access', async () => {
    render(await BrandsPage({ params: Promise.resolve({ locale: 'en' }) }));
    expect(requireAccess).toHaveBeenCalledWith('en', 'brandsCategories');
    expect(screen.getByText('brands')).toBeInTheDocument();
  });
});
