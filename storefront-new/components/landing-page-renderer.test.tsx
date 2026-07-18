import { render, screen } from '@testing-library/react';
import { landingPageDocumentSchema } from '@bric/storefront-core/landing-pages';
import { describe, expect, it, vi } from 'vitest';

import { LandingPageRenderer } from './landing-page-renderer';

vi.mock('@/components/landing-page-telemetry', () => ({ LandingPageTelemetry: () => null }));
vi.mock('@/components/product-actions', () => ({ ProductActions: ({ available, analytics, buyNowTarget }: { available: boolean; analytics: { metadata: unknown }; buyNowTarget?: string }) => <div data-testid="actions" data-available={available} data-metadata={JSON.stringify(analytics.metadata)} data-buy-target={buyNowTarget} /> }));
vi.mock('@/components/storefront-image', () => ({ StorefrontImage: ({ alt }: { alt: string }) => <img alt={alt} /> }));

const page = {
  id: 4, slug: 'perceuse-20v', locale: 'fr' as const, revision: 2, publishedAt: null,
  document: landingPageDocumentSchema.parse({ schemaVersion: 2, theme: { accent: 'orange', density: 'comfortable', shell: 'campaign' }, seo: { title: 'Perceuse 20V', description: 'Découvrez la perceuse 20V pour vos travaux.', indexable: false }, blocks: [
    { id: 'hero', type: 'product-hero' as const, variant: 'media-left' as const, heading: 'Travaillez sans câble', subheading: 'Une campagne unique.', imageUrl: null, imageAlt: '', primaryCtaLabel: 'Je commande', showAddToCart: true },
    { id: 'story', type: 'editorial-intro', variant: 'statement', surface: 'soft', width: 'narrow', eyebrow: 'Un autre rythme', heading: 'Une composition éditoriale', body: 'Le produit devient le fil conducteur.', highlights: ['Direct', 'Lisible'] },
    { id: 'gallery', type: 'image-gallery', variant: 'mosaic', heading: 'Chaque détail', images: [{ imageUrl: null, imageAlt: 'Vue un', caption: 'Face avant' }, { imageUrl: null, imageAlt: 'Vue deux', caption: 'Vue latérale' }] },
    { id: 'uses', type: 'use-cases', variant: 'editorial', heading: 'Pour vos travaux', body: '', items: [{ title: 'Atelier', description: 'Pour les travaux indiqués.', icon: 'tool' }, { title: 'Entretien', description: 'Pour les usages indiqués.', icon: 'target' }] },
    { id: 'comparison', type: 'comparison', variant: 'spotlight', heading: 'Décidez clairement', productLabel: 'Perceuse', alternativeLabel: 'Alternative', items: [{ label: 'Commande', productValue: 'Simple', alternativeValue: 'Variable' }, { label: 'Paiement', productValue: 'À la livraison', alternativeValue: 'Variable' }], footnote: 'Données vérifiées.' },
    { id: 'process', type: 'process', variant: 'timeline', heading: 'Trois gestes', body: '', steps: [{ title: 'Choisissez', description: 'Sélectionnez.' }, { title: 'Confirmez', description: 'Répondez à notre appel.' }] },
    { id: 'trust', type: 'trust-band', variant: 'ribbon', heading: '', items: [{ title: 'Paiement à la livraison', description: '', icon: 'payment' }, { title: 'Partout en Algérie', description: '', icon: 'delivery' }] },
    { id: 'offer', type: 'commerce-panel', variant: 'image-led', heading: 'Votre perceuse est ici', body: 'Prix live.', bullets: [], imageUrl: null, imageAlt: '', primaryCtaLabel: 'Je la commande', showAddToCart: true },
    { id: 'faq', type: 'faq' as const, variant: 'accordion' as const, heading: 'Questions', items: [{ question: 'Comment commander ?', answer: 'Par le formulaire.' }] },
    { id: 'final', type: 'final-cta' as const, variant: 'solid' as const, heading: 'Prêt ?', body: 'Commandez maintenant.', primaryCtaLabel: 'Commander', imageUrl: null, imageAlt: '' },
  ] }),
  product: { id: 8, canonicalToken: 'perceuse-20v', title: 'Perceuse 20V', titleAr: null, description: null, descriptionAr: null, sku: null, barcode: null, price: '12000.00', oldPrice: '13500.00', availability: { status: 'in_stock', inStock: true, quantity: 3 }, media: [], brand: null, category: null, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-17T00:00:00.000Z' },
};

describe('LandingPageRenderer', () => {
  it('renders governed blocks while keeping live product price and availability authoritative', () => {
    const { container } = render(<LandingPageRenderer page={page} locale="fr" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Travaillez sans câble' })).toBeVisible();
    expect(screen.getAllByText(/12[\s\u202f]?000/)).toHaveLength(3);
    expect(screen.getByText('En stock')).toBeVisible();
    expect(screen.getAllByTestId('actions')).toHaveLength(2);
    expect(screen.getAllByTestId('actions')[0]).toHaveAttribute('data-available', 'true');
    expect(screen.getAllByTestId('actions')[1].getAttribute('data-metadata')).toContain('offer');
    expect(screen.getAllByTestId('actions')[0]).toHaveAttribute('data-buy-target', '#landing-order');
    expect(screen.getByRole('heading', { name: 'Une composition éditoriale' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Chaque détail' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Décidez clairement' })).toBeVisible();
    expect(screen.getByRole('table', { name: 'Décidez clairement' })).toBeVisible();
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Trois gestes' })).toBeVisible();
    expect(screen.getByText('Comment commander ?')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Commander' })).toHaveAttribute('href', '#landing-order');
    expect(screen.getByRole('link', { name: /Je commande.*12/ })).toHaveAttribute('href', '#landing-order');
    expect(container.querySelector('script[type="application/ld+json"]')?.textContent).toContain('/fr/landing/perceuse-20v');
  });
});
