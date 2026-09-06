import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMetadata } from './page';
import { CheckoutPageContent } from './page-content';

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  product: vi.fn(),
  settings: vi.fn(),
  promo: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@/lib/storefront-api', () => ({
  getStorefrontEcotrackCatalog: mocks.catalog,
  getStorefrontProductDetail: mocks.product,
  getStorefrontSettings: mocks.settings,
  fetchStorefrontProductPromo: mocks.promo,
}));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(
    async () => (key: string) =>
      (
        ({
          title: 'Finaliser votre commande',
          description: 'Vos coordonnées et votre mode de livraison.',
          officeDelivery: 'Bureau de livraison',
        }) as Record<string, string>
      )[key] ?? key,
  ),
}));
vi.mock('@/components/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) =>
    React.createElement('main', null, children),
}));
vi.mock('@/components/checkout-form', () => ({
  CheckoutForm: ({
    catalog,
    labels,
    support,
    directItem,
    initialNotice,
  }: {
    catalog: { wilayas: unknown[]; communes: unknown[] };
    labels: { title: string; officeDelivery: string; eyebrow?: string };
    support?: { contact: { phoneDisplay: string } };
    directItem: { promoCode?: string; unitPrice: number } | null;
    initialNotice?: string;
  }) =>
    React.createElement(
      'section',
      {
        'data-wilayas': catalog.wilayas.length,
        'data-communes': catalog.communes.length,
        'data-eyebrow': labels.eyebrow,
        'data-promo': directItem?.promoCode,
        'data-unit-price': directItem?.unitPrice,
        'data-notice': initialNotice,
      },
      `${labels.title}|${labels.officeDelivery}|${support?.contact.phoneDisplay ?? ''}`,
    ),
}));

const catalog = {
  wilayas: [{ wilayaId: 16, name: 'Alger' }],
  communes: [
    { communeId: 1, wilayaId: 16, name: 'Alger Centre', postalCode: '16000', hasStopDesk: true },
  ],
  serviceFees: [{ serviceType: 'livraison', wilayaId: 16, homeFee: '500', stopDeskFee: '300' }],
  weightFees: [],
  lastSync: null,
};

describe('localized Checkout Page', () => {
  it('explains an expired promotion before the customer confirms a direct purchase', async () => {
    mocks.product.mockResolvedValue({
      item: {
        id: 12,
        canonicalToken: 'desk-lamp',
        title: 'Lampe',
        price: '1500',
        media: [],
        availability: { status: 'in_stock' },
      },
    });
    mocks.promo.mockResolvedValue({ ok: false, promo: null });
    const html = renderToStaticMarkup(
      await CheckoutPageContent({
        params: Promise.resolve({ locale: 'fr' }),
        searchParams: Promise.resolve({ product: 'desk-lamp', promo: 'EXPIRED' }),
      }),
    );
    expect(html).toContain('data-notice="promoUnavailable"');
    expect(html).toContain('data-unit-price="1500"');
    expect(html).not.toContain('data-promo=');
  });
  it.each(['fr', 'ar'])('loads the promotion from a direct-checkout URL in %s', async (locale) => {
    mocks.product.mockResolvedValue({
      item: {
        id: 12,
        canonicalToken: 'desk-lamp',
        title: 'Lampe',
        titleAr: 'مصباح',
        price: '1500',
        media: [],
        availability: { status: 'in_stock' },
      },
    });
    mocks.promo.mockResolvedValue({ ok: true, promo: { code: 'AUDIT10', promoPrice: 1200 } });
    const html = renderToStaticMarkup(
      await CheckoutPageContent({
        params: Promise.resolve({ locale }),
        searchParams: Promise.resolve({ product: 'desk-lamp', promo: 'AUDIT10', quantity: '2' }),
      }),
    );
    expect(mocks.promo).toHaveBeenCalledWith(12, 'AUDIT10');
    expect(html).toContain('data-promo="AUDIT10"');
    expect(html).toContain('data-unit-price="1200"');
  });
  beforeEach(() => {
    mocks.catalog.mockReset().mockResolvedValue(catalog);
    mocks.product.mockReset();
    mocks.settings.mockReset().mockResolvedValue({
      phoneDisplay: '0795 34 28 26',
      phoneHref: 'tel:+213795342826',
      phoneEnabled: true,
    });
    mocks.notFound.mockClear();
  });

  it('publishes localized, non-indexable transactional metadata', async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ locale: 'fr' }) }),
    ).resolves.toMatchObject({
      title: 'Finaliser votre commande',
      robots: { index: false, follow: false },
    });
    await expect(
      generateMetadata({ params: Promise.resolve({ locale: 'ar' }) }),
    ).resolves.toMatchObject({
      title: 'إتمام الطلب',
      description: expect.stringContaining('الدفع عند الاستلام'),
      robots: { index: false, follow: false },
    });
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

  it.each(['fr', 'ar'])(
    'keeps unavailable Buy Now intent out of ordinary basket checkout in %s',
    async (locale) => {
      mocks.product.mockResolvedValue(null);
      await expect(
        CheckoutPageContent({
          params: Promise.resolve({ locale }),
          searchParams: Promise.resolve({ product: 'removed-product' }),
        }),
      ).rejects.toThrow('NEXT_NOT_FOUND');
    },
  );

  it('does not fabricate an empty delivery catalog during an outage', async () => {
    mocks.catalog.mockRejectedValue(new Error('delivery API unavailable'));

    await expect(
      CheckoutPageContent({
        params: Promise.resolve({ locale: 'fr' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('delivery API unavailable');
  });
});
