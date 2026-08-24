import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { requireAccess } = vi.hoisted(() => ({ requireAccess: vi.fn() }));

vi.mock('../../../../components/products/products-workspace', () => ({
  ProductsWorkspace: () => <div>Products workspace</div>,
}));
vi.mock('../../../../lib/page-access', () => ({ requireProductsPageAccess: requireAccess }));

import ProductsPage from './page';

describe('ProductsPage', () => {
  it('always renders the canonical products workspace after enforcing access', async () => {
    render(await ProductsPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(requireAccess).toHaveBeenCalledWith('en');
    expect(screen.getByText('Products workspace')).toBeInTheDocument();
  });
});
