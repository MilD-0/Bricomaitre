import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CheckoutPageContent } from './page';

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  product: vi.fn(),
  settings: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }),
}));

vi.mock('@/lib/storefront-api', () => ({
  getStorefrontEcotrackCatalog: mocks.catalog,
  getStorefrontProductDetail: mocks.product,
  getStorefrontSettings: mocks.settings,
}));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => ({
    title: 'Finaliser votre commande',
    description: 'Vos coordonnées et votre mode de livraison.',
    officeDelivery: 'Bureau de livraison',
  } as Record<string, string>)[key] ?? key),
}));
vi.mock('@/components/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => React.createElement('main', null, children),
}));
vi.mock('@/components/checkout-form', () => ({
  CheckoutForm: ({ catalog, labels, support }: {
    catalog: { wilayas: unknown[]; communes: unknown[] };
    labels: { title: string; officeDelivery: string; eyebrow?: string };
    support?: { contact: { phoneDisplay: string } };
  }) => React.createElement('section', {
    'data-wilayas': catalog.wilayas.length,
    'data-communes': catalog.communes.length,
    'data-eyebrow': labels.eyebrow,
  }, `${labels.title}|${labels.officeDelivery}|${support?.contact.phoneDisplay ?? ''}`),
}));

const catalog = {
  wilayas: [{ wilayaId: 16, name: 'Alger' }],
  communes: [{ communeId: 1, wilayaId: 16, name: 'Alger Centre', postalCode: '16000', hasStopDesk: true }],
  serviceFees: [{ serviceType: 'livraison', wilayaId: 16, homeFee: '500', stopDeskFee: '300' }],
  weightFees: [],
  lastSync: null,
};

describe('localized Checkout Page', () => {
  beforeEach(() => {
    mocks.catalog.mockReset().mockResolvedValue(catalog);
    mocks.product.mockReset();
    mocks.settings.mockReset().mockResolvedValue({ phoneDisplay: '0795 34 28 26', phoneHref: 'tel:+213795342826', phoneEnabled: true });
    mocks.notFound.mockClear();
  });

  it('loads the canonical delivery catalog and renders the simplified delivery copy', async () => {
    const element = await CheckoutPageContent({
      params: Promise.resolve({ locale: 'fr' }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(element);

    expect(mocks.catalog).toHaveBeenCalledOnce();
    expect(html).toContain('data-wilayas="1"');
    expect(html).toContain('data-communes="1"');
    expect(html).toContain('Finaliser votre commande|Bureau de livraison');
    expect(html).toContain('0795 34 28 26');
    expect(mocks.settings).toHaveBeenCalledOnce();
    expect(html).not.toContain('Commande simple et sécurisée');
    expect(html).not.toContain('data-eyebrow=');
  });

  it('degrades a delivery-catalog outage to an empty, still-renderable checkout', async () => {
    mocks.catalog.mockRejectedValue(new Error('delivery API unavailable'));

    const element = await CheckoutPageContent({
      params: Promise.resolve({ locale: 'fr' }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('data-wilayas="0"');
    expect(html).toContain('data-communes="0"');
    expect(html).toContain('Finaliser votre commande');
  });
});
