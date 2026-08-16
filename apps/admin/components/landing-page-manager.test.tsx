import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { landingPageDocumentSchema } from '@bric/storefront-core/landing-pages';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LandingDraftPreview, LandingPageManager } from './landing-page-manager';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { name?: string }) =>
    values?.name ? `${key}: ${values.name}` : key,
}));

const document = landingPageDocumentSchema.parse({
  schemaVersion: 1 as const,
  theme: { accent: 'orange' as const, density: 'comfortable' as const, shell: 'campaign' as const },
  seo: { title: 'Lampe', description: 'Lampe de travail', indexable: false },
  blocks: [
    {
      id: 'hero',
      type: 'product-hero' as const,
      variant: 'media-left' as const,
      heading: 'Travaillez mieux',
      subheading: 'Une lampe solide.',
      imageUrl: null,
      imageAlt: '',
      primaryCtaLabel: 'Commander',
      showAddToCart: true,
    },
    {
      id: 'final',
      type: 'final-cta' as const,
      variant: 'solid' as const,
      heading: 'Prêt ?',
      body: 'Commandez maintenant.',
      primaryCtaLabel: 'Commander',
      imageUrl: null,
      imageAlt: '',
    },
  ],
});

describe('LandingDraftPreview', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => cleanup());

  it('shows the permanent inline order form after the custom campaign blocks', () => {
    render(<LandingDraftPreview document={document} locale="fr" mobile={false} />);
    expect(screen.getByRole('region', { name: 'Formulaire de commande permanent' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Finaliser votre commande' })).toBeVisible();
    expect(screen.getByText('Confirmer ma commande')).toBeVisible();
  });

  it('localizes the permanent form preview for Arabic campaigns', () => {
    render(<LandingDraftPreview document={document} locale="ar" mobile />);
    expect(screen.getByRole('region', { name: 'نموذج الطلب الدائم' })).toHaveAttribute(
      'aria-label',
      'نموذج الطلب الدائم',
    );
    expect(screen.getByRole('heading', { name: 'إتمام الطلب' })).toBeVisible();
  });

  it('keeps the storefront preview on a light palette when the admin theme is dark', () => {
    render(
      <div className="dark">
        <LandingDraftPreview document={document} locale="fr" mobile={false} />
      </div>,
    );
    const preview = screen.getByRole('region', { name: 'Formulaire de commande permanent' })
      .parentElement?.parentElement;
    expect(preview).toHaveClass('[color-scheme:light]', 'text-[#202529]');
    expect(screen.getByRole('region', { name: 'Formulaire de commande permanent' })).toHaveClass(
      'text-[#202529]',
    );
  });

  it('exposes every expanded composition and section treatment to administrators', () => {
    render(
      <LandingPageManager
        initialItems={[
          {
            id: 1,
            productId: 7,
            productTitle: 'Lampe',
            locale: 'fr',
            slug: 'lampe',
            status: 'draft',
            draftRevision: 1,
            publishedRevision: null,
            updatedAt: '2026-07-18T00:00:00.000Z',
            document,
          },
        ]}
        products={[
          { id: 7, title: 'Lampe', slug: 'lampe', brandId: null, categoryId: null, images: [] },
        ]}
        storefrontBaseUrl="https://shop.example.com"
      />,
    );

    for (const option of [
      'Introduction éditoriale',
      'Galerie produit',
      'Cas d’usage',
      'Comparaison',
      'Étapes',
      'Bandeau de confiance',
      'Offre produit dynamique',
    ]) {
      expect(screen.getByRole('option', { name: option })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('option', { name: 'Sombre' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('option', { name: 'Éditoriale' }).length).toBeGreaterThan(0);
  });

  it('selects products with the shared searchable picker and derives the URL from the product slug', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => (init?.method === 'POST' ? { id: 2 } : { items: [] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <LandingPageManager
        initialItems={[]}
        products={[
          {
            id: 7,
            title: 'Lampe robuste',
            slug: 'lampe-robuste',
            brandId: null,
            categoryId: null,
            images: [],
          },
        ]}
        storefrontBaseUrl="https://shop.example.com"
      />,
    );
    expect(screen.queryByPlaceholderText('slug-de-campagne')).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Rechercher par nom ou slug…'), 'robuste');
    await user.click(screen.getByRole('button', { name: 'chooseSelection: Lampe robuste' }));
    expect(screen.getByText('/fr/landing/lampe-robuste')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Créer le brouillon' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/landing-pages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ productId: 7, locale: 'fr' }),
      }),
    );
  });

  it('builds the public view link from the configured storefront environment URL', () => {
    render(
      <LandingPageManager
        initialItems={[
          {
            id: 1,
            productId: 7,
            productTitle: 'Lampe',
            locale: 'fr',
            slug: 'lampe',
            status: 'published',
            draftRevision: 1,
            publishedRevision: 1,
            updatedAt: '2026-07-18T00:00:00.000Z',
            document,
          },
        ]}
        products={[]}
        storefrontBaseUrl="https://preview.example.com"
      />,
    );
    expect(screen.getByRole('link', { name: 'Voir' })).toHaveAttribute(
      'href',
      'https://preview.example.com/fr/landing/lampe',
    );
  });
});
