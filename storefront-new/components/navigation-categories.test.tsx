import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NavigationCategories } from './navigation-categories';

const fetchMeta = vi.hoisted(() => vi.fn());
vi.mock('@/lib/navigation-categories', () => ({ fetchNavigationMeta: fetchMeta }));

describe('NavigationCategories', () => {
  afterEach(cleanup);

  it('reserves navigation space while categories are loading', async () => {
    let resolveMeta: (value: { categories: Array<{ id: number; name: string; nameAr: string | null; slug: string | null }>; brands: Array<{ id: number; name: string; slug: string | null }> }) => void;
    fetchMeta.mockImplementationOnce(() => new Promise((resolve) => { resolveMeta = resolve; }));
    render(<NavigationCategories locale="fr" labels={{ categories: 'Catégories', brands: 'Marques' }} />);

    expect(document.querySelector('.navigation-categories-skeleton')).toBeInTheDocument();
    resolveMeta!({ categories: [{ id: 8, name: 'Éclairage', nameAr: null, slug: 'eclairage' }], brands: [{ id: 9, name: 'Wadfow', slug: 'wadfow' }] });
    fireEvent.click(await screen.findByRole('button', { name: 'Catégories' }));
    expect(await screen.findByRole('link', { name: 'Éclairage' })).toHaveAttribute('href', '/fr/categories/eclairage');
    fireEvent.click(screen.getByRole('button', { name: 'Marques' }));
    expect(screen.getByRole('link', { name: 'Wadfow' })).toHaveAttribute('href', '/fr/brands/wadfow');
    await waitFor(() => expect(document.querySelector('.navigation-categories-skeleton')).not.toBeInTheDocument());
  });

  it('keeps one desktop menu open at a time and dismisses it outside the navigation', async () => {
    fetchMeta.mockResolvedValue({ categories: [{ id: 8, name: 'Éclairage', nameAr: null, slug: 'eclairage' }], brands: [{ id: 9, name: 'Wadfow', slug: 'wadfow' }] });
    render(<NavigationCategories locale="fr" labels={{ categories: 'Catégories', brands: 'Marques' }} />);

    const categories = await screen.findByRole('button', { name: 'Catégories' });
    const brands = screen.getByRole('button', { name: 'Marques' });
    fireEvent.click(categories);
    expect(categories).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Éclairage' })).toBeVisible();

    fireEvent.click(brands);
    expect(categories).toHaveAttribute('aria-expanded', 'false');
    expect(brands).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('link', { name: 'Éclairage' })).not.toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(brands).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Wadfow' })).not.toBeInTheDocument();
  });
});
