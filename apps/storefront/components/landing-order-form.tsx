import type { StorefrontLandingPageResponse } from '@bric/storefront-core/landing-pages';
import { getTranslations } from 'next-intl/server';

import { CheckoutForm } from '@/components/checkout-form';
import type { Locale } from '@/i18n/config';
import { buildCheckoutLabels } from '@/lib/checkout-labels';
import { parseProductPrice } from '@/lib/product-presentation';
import { getStorefrontEcotrackCatalog, getStorefrontSettings } from '@/lib/storefront-api';

export async function LandingOrderForm({
  page,
  locale,
}: {
  page: StorefrontLandingPageResponse;
  locale: Locale;
}) {
  const [translate, catalog, contact] = await Promise.all([
    getTranslations({ locale, namespace: 'Checkout' }),
    getStorefrontEcotrackCatalog().catch(() => null),
    getStorefrontSettings(),
  ]);
  const { product } = page;
  const title = locale === 'ar' && product.titleAr?.trim() ? product.titleAr : product.title;
  const directItem = {
    productId: product.id,
    token: product.canonicalToken,
    title,
    imageUrl: product.media[0]?.url ?? null,
    unitPrice: parseProductPrice(product.price),
    quantity: 1,
    availabilityStatus: product.availability.status,
  };

  if (!product.availability.inStock) {
    return (
      <section id="landing-order" className="landing-order-unavailable" role="status">
        <h2>{translate('title')}</h2>
        <p>
          {locale === 'ar'
            ? 'هذا المنتج غير متوفر حالياً.'
            : 'Ce produit est actuellement indisponible.'}
        </p>
      </section>
    );
  }

  if (!catalog?.wilayas.length || !catalog.communes.length) {
    return (
      <section id="landing-order" className="landing-order-unavailable" role="alert">
        <h2>{translate('title')}</h2>
        <p>
          {locale === 'ar'
            ? 'تعذر تحميل مناطق التوصيل. أعد المحاولة لإتمام طلبك.'
            : 'Les destinations de livraison n’ont pas pu être chargées. Réessayez pour commander.'}
        </p>
        <form
          method="get"
          action={`/${locale}/landing/${encodeURIComponent(page.slug)}#landing-order`}
        >
          <button className="button button-primary" type="submit">
            {translate('retry')}
          </button>
        </form>
      </section>
    );
  }

  return (
    <CheckoutForm
      locale={locale}
      catalog={catalog}
      directItem={directItem}
      landingAttribution={{ landingPageId: page.id, landingRevision: page.revision }}
      embedded
      labels={buildCheckoutLabels(translate)}
      support={{
        contact,
        labels: {
          title: translate('supportTitle'),
          description: translate('supportDescription'),
          call: translate('supportCall'),
        },
      }}
    />
  );
}
