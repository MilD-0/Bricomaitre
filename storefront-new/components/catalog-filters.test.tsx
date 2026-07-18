import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CatalogFilters } from './catalog-filters';

const haptics = vi.hoisted(() => ({ prepare: vi.fn(), trigger: vi.fn() }));
vi.mock('@/lib/haptics', () => ({ prepareHaptics: haptics.prepare, triggerHaptic: haptics.trigger }));

const labels = {
  title: 'Filtrer les produits', close: 'Fermer les filtres', category: 'Catégorie', allCategories: 'Toutes les catégories',
  brand: 'Marque', allBrands: 'Toutes les marques', apply: 'Appliquer les filtres', reset: 'Effacer les filtres',
};

describe('CatalogFilters', () => {
  afterEach(cleanup);

  it('opens a root-level filter sheet and preserves the active query when applying', async () => {
    render(<CatalogFilters
      locale="fr"
      categories={[{ id: 3, label: 'Éclairage' }]}
      brands={[{ id: 2, label: 'Bric Pro' }]}
      selectedCategory={3}
      selectedBrand={null}
      discounted={false}
      search="lampe"
      sort="newest"
      labels={labels}
    />);

    const trigger = screen.getByRole('button', { name: /Filtrer les produits/ });
    expect(within(trigger).getByLabelText('1')).toHaveClass('catalog-mobile-filter-count');
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
});
