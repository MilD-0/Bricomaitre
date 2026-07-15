import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogLiveSort } from './catalog-live-sort';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => '/fr/products',
  useSearchParams: () => new URLSearchParams('q=perceuse&brand=2&page=3'),
}));

const options = [
  { value: 'recommended' as const, label: 'Recommended' },
  { value: 'newest' as const, label: 'Newest' },
  { value: 'price-desc' as const, label: 'Price high to low' },
];

describe('CatalogLiveSort', () => {
  beforeEach(() => navigation.replace.mockReset());
  afterEach(cleanup);

  it('applies a selected sort immediately while preserving discovery context', () => {
    render(<CatalogLiveSort initialValue="recommended" label="Sort" options={options} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), { target: { value: 'price-desc' } });

    expect(navigation.replace).toHaveBeenCalledWith(
      '/fr/products?q=perceuse&brand=2&sort=price-desc',
      { scroll: false },
    );
  });

  it('keeps the recommended default out of the canonical URL', () => {
    render(<CatalogLiveSort initialValue="newest" label="Sort" options={options} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), { target: { value: 'recommended' } });

    expect(navigation.replace).toHaveBeenCalledWith(
      '/fr/products?q=perceuse&brand=2',
      { scroll: false },
    );
  });
});
