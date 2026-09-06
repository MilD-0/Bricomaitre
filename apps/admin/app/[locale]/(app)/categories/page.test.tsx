import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { requireAccess } = vi.hoisted(() => ({ requireAccess: vi.fn() }));

vi.mock('next-intl/server', () => ({ getTranslations: vi.fn() }));
vi.mock('../../../../components/brands-categories/taxonomy-workspace', () => ({
  TaxonomyWorkspace: ({ view }: { view: string }) => <div>{view}</div>,
}));
vi.mock('../../../../lib/page-access', () => ({
  requirePageAccess: requireAccess,
}));

import CategoriesPage from './page';

describe('CategoriesPage', () => {
  it('always renders the canonical categories workspace after enforcing access', async () => {
    render(await CategoriesPage({ params: Promise.resolve({ locale: 'ar' }) }));
    expect(requireAccess).toHaveBeenCalledWith('ar', 'brandsCategories');
    expect(screen.getByText('categories')).toBeInTheDocument();
  });
});
