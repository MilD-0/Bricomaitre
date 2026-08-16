import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StorefrontFailure } from './storefront-failure';

afterEach(cleanup);

describe('StorefrontFailure', () => {
  it('offers a working retry and safe French home destination after an error', () => {
    const retry = vi.fn();
    render(<StorefrontFailure kind="error" locale="fr" onRetry={retry} />);

    expect(screen.getByRole('alert')).toHaveAccessibleName('Cette page a rencontré un problème');
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' })).toHaveAttribute('href', '/fr');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('renders an RTL Arabic not-found recovery path without an error alert', () => {
    const { container } = render(<StorefrontFailure kind="not-found" locale="ar" />);

    expect(container.querySelector('main')).toHaveAttribute('dir', 'rtl');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'هذه الصفحة لم تعد متاحة' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'عرض المنتجات' })).toHaveAttribute(
      'href',
      '/ar/products',
    );
  });
});
