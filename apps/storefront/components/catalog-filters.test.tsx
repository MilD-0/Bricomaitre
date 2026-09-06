import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CatalogFilters } from './catalog-filters';

const haptics = vi.hoisted(() => ({ prepare: vi.fn(), trigger: vi.fn() }));
vi.mock('@/lib/haptics', () => ({
  prepareHaptics: haptics.prepare,
  triggerHaptic: haptics.trigger,
}));

const labels = {
  title: 'Filtrer les produits',
  close: 'Fermer les filtres',
  category: 'Catégorie',
  allCategories: 'Toutes les catégories',
  brand: 'Marque',
  allBrands: 'Toutes les marques',
  stock: 'Disponibilité',
  inStock: 'Produits en stock uniquement',
  price: 'Prix',
  minPrice: 'Minimum',
  maxPrice: 'Maximum',
  apply: 'Appliquer les filtres',
  reset: 'Effacer les filtres',
};

describe('CatalogFilters', () => {
  afterEach(cleanup);

  it('opens a root-level filter sheet and preserves the active query when applying', async () => {
    render(
      <CatalogFilters
        locale="fr"
        categories={[{ id: 3, label: 'Éclairage' }]}
        brands={[{ id: 2, label: 'Bric Pro' }]}
        selectedCategory={3}
        selectedBrand={null}
        discounted={false}
        search="lampe"
        sort="newest"
        labels={labels}
      />,
    );

    const trigger = screen.getByRole('button', { name: /Filtrer les produits/ });
    expect(within(trigger).getByLabelText('1')).toHaveClass('catalog-mobile-filter-count');
    expect(screen.getAllByRole('button', { name: labels.apply })[0]).toHaveAttribute(
      'data-slot',
      'button',
    );
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);

    const sheet = screen.getByRole('dialog', { name: labels.title });
    expect(sheet.parentElement?.parentElement).toBe(document.body);
    expect(within(sheet).getByRole('radio', { name: 'Éclairage' })).toBeChecked();
    expect(sheet.querySelector('input[name="q"]')).toHaveValue('lampe');
    expect(sheet.querySelector('input[name="sort"]')).toHaveValue('newest');
    expect(haptics.trigger).toHaveBeenCalledWith('surface');

    const form = sheet.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    expect(within(sheet).getByRole('radio', { name: labels.allBrands })).toBeDisabled();
    expect(haptics.trigger).toHaveBeenCalledWith('primary');

    fireEvent.click(screen.getByRole('button', { name: labels.close }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('keeps every brand selectable in a large mobile catalog without thousands of radio controls', () => {
    render(
      <CatalogFilters
        locale="ar"
        categories={[]}
        brands={Array.from({ length: 1562 }, (_, index) => ({
          id: index + 1,
          label: `Brand ${index + 1}`,
        }))}
        selectedCategory={null}
        selectedBrand={1500}
        discounted={true}
        search="drill"
        sort="newest"
        labels={labels}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Filtrer les produits/ }));
    const sheet = screen.getByRole('dialog');
    const select = within(sheet).getByRole('combobox', { name: 'Marque' });
    expect(select).toHaveValue('1500');
    expect(within(select).getAllByRole('option')).toHaveLength(1563);
    fireEvent.change(select, { target: { value: '1562' } });
    const data = new FormData(sheet.querySelector('form')!);
    expect(data.get('brand')).toBe('1562');
    expect(data.get('discounted')).toBe('1');
    expect(data.get('q')).toBe('drill');
    expect(sheet.querySelectorAll('input[type="radio"]').length).toBeLessThan(5);
  });

  it('uses one in-stock checkbox and a bounded two-handle price slider', () => {
    render(
      <CatalogFilters
        locale="fr"
        categories={[]}
        brands={[]}
        selectedCategory={null}
        selectedBrand={null}
        discounted={false}
        stock="in"
        minPrice={2_000}
        maxPrice={12_000}
        search=""
        sort="recommended"
        labels={{ ...labels, stock: 'Disponibilité', inStock: 'En stock seulement' }}
      />,
    );

    expect(screen.getAllByRole('checkbox', { name: 'En stock seulement' })[0]).toBeChecked();
    expect(screen.queryByRole('radio', { name: /stock/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('slider', { name: 'Minimum' })[0]).toHaveValue('2000');
    expect(screen.getAllByRole('slider', { name: 'Maximum' })[0]).toHaveValue('12000');
  });

  it('shows category product counts and indents child categories', () => {
    const { container } = render(
      <CatalogFilters
        locale="fr"
        categories={[
          { id: 1, label: 'Outillage', productCount: 12 },
          { id: 2, label: 'Perceuses', parentId: 1, productCount: 4 },
        ]}
        brands={[]}
        selectedCategory={null}
        selectedBrand={null}
        discounted={false}
        search=""
        sort="recommended"
        labels={labels}
      />,
    );

    expect(screen.getAllByText('12')[0]).toBeVisible();
    expect(screen.getAllByText('4')[0]).toBeVisible();
    expect(container.querySelector('label[data-child="true"]')).toHaveTextContent('Perceuses');
  });
});
