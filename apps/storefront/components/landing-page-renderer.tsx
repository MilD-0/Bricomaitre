import type {
  LandingPageBlock,
  StorefrontLandingPageResponse,
} from '@bric/storefront-core/landing-pages';
import {
  BadgeCheck,
  Boxes,
  HandCoins,
  Phone,
  ShieldCheck,
  Sparkles,
  Target,
  Truck,
  Wrench,
  Zap,
} from 'lucide-react';

import { LandingPageTelemetry } from '@/components/landing-page-telemetry';
import {
  LandingFaqItem,
  LandingFinalCtaLink,
  LandingMobileCta,
} from '@/components/landing-page-interactions';
import { ProductActions } from '@/components/product-actions';
import { StorefrontImage } from '@/components/storefront-image';
import type { Locale } from '@/i18n/config';
import {
  formatProductPrice,
  hasProductDiscount,
  parseProductPrice,
} from '@/lib/product-presentation';
import { buildProductStructuredData, serializeStructuredData } from '@/lib/product-seo';
import { getStorefrontSiteUrl } from '@/lib/site-url';
import { LANDING_ORDER_SECTION_ID } from '@/lib/landing-order';

const benefitIcons = {
  power: Zap,
  shield: ShieldCheck,
  delivery: Truck,
  tool: Wrench,
  phone: Phone,
  payment: HandCoins,
  check: BadgeCheck,
  layers: Boxes,
  target: Target,
  sparkles: Sparkles,
};

function blockImage(
  block: { imageUrl: string | null; imageAlt: string },
  fallback: string | null,
  sizes: string,
  priority = false,
) {
  const src = block.imageUrl ?? fallback;
  return src ? (
    <StorefrontImage
      src={src}
      alt={block.imageAlt}
      width={900}
      height={900}
      sizes={sizes}
      quality={priority ? 75 : 60}
      priority={priority}
    />
  ) : (
    <span className="landing-media-placeholder" aria-hidden="true">
      BRICO
    </span>
  );
}

function blockClass(block: LandingPageBlock, ...classes: string[]) {
  return [
    ...classes,
    `is-${block.variant}`,
    `landing-surface-${block.surface}`,
    `landing-width-${block.width}`,
  ].join(' ');
}

export function LandingPageRenderer({
  page,
  locale,
}: {
  page: StorefrontLandingPageResponse;
  locale: Locale;
}) {
  const { product, document } = page;
  const token = product.canonicalToken;
  const title = locale === 'ar' && product.titleAr ? product.titleAr : product.title;
  const image = product.media[0]?.url ?? null;
  const actionLabels =
    locale === 'ar'
      ? {
          quantity: 'الكمية',
          decrease: 'تقليل الكمية',
          increase: 'زيادة الكمية',
          addToCart: 'أضف إلى السلة',
          buyNow: 'اطلب الآن',
          added: 'تمت إضافة المنتج إلى السلة.',
          unavailable: 'هذا المنتج غير متوفر حالياً.',
        }
      : {
          quantity: 'Quantité',
          decrease: 'Diminuer la quantité',
          increase: 'Augmenter la quantité',
          addToCart: 'Ajouter au panier',
          buyNow: 'Commander maintenant',
          added: 'Produit ajouté au panier.',
          unavailable: 'Ce produit est actuellement indisponible.',
        };
  const hero = document.blocks.find((block) => block.type === 'product-hero');
  const analyticsFor = (blockId: string) => ({
    categoryId: product.category?.id ?? null,
    categorySlug: product.category?.slug ?? null,
    brandId: product.brand?.id ?? null,
    brandSlug: product.brand?.slug ?? null,
    metadata: { landingPageId: page.id, landingRevision: page.revision, landingBlockId: blockId },
  });
  const landingUrl = `${getStorefrontSiteUrl()}/${locale}/landing/${page.slug}`;
  const [productStructuredData] = buildProductStructuredData(product, locale);
  const structuredData = {
    ...productStructuredData,
    '@id': `${landingUrl}#product`,
    offers: { ...productStructuredData.offers, url: landingUrl },
  };
  return (
    <div
      className={`landing-page landing-accent-${document.theme.accent} landing-density-${document.theme.density}`}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeStructuredData(structuredData) }}
      />
      <LandingPageTelemetry
        locale={locale}
        landingPageId={page.id}
        revision={page.revision}
        productId={product.id}
        productSlug={token}
      />
      {document.blocks.map((block) => {
        if (block.type === 'product-hero')
          return (
            <section key={block.id} id={block.id} className={blockClass(block, 'landing-hero')}>
              <div className="landing-hero-media">
                {blockImage(block, image, '(max-width: 760px) 100vw, 50vw', true)}
              </div>
              <div className="landing-hero-copy">
                {product.brand ? <p>{product.brand.name}</p> : null}
                <h1>{block.heading}</h1>
                {block.subheading ? <p>{block.subheading}</p> : null}
                <div className="landing-price">
                  <strong>{formatProductPrice(product.price, locale)}</strong>
                  {hasProductDiscount(product) ? (
                    <del>{formatProductPrice(product.oldPrice!, locale)}</del>
                  ) : null}
                </div>
                <span className={product.availability.inStock ? 'is-stocked' : 'is-unavailable'}>
                  {product.availability.inStock
                    ? locale === 'ar'
                      ? 'متوفر'
                      : 'En stock'
                    : locale === 'ar'
                      ? 'غير متوفر'
                      : 'Indisponible'}
                </span>
                <ProductActions
                  locale={locale}
                  item={{
                    productId: product.id,
                    token,
                    title,
                    imageUrl: image,
                    unitPrice: parseProductPrice(product.price),
                    availabilityStatus: product.availability.status,
                  }}
                  analytics={analyticsFor(block.id)}
                  available={product.availability.inStock}
                  showAddToCart={block.showAddToCart}
                  buyNowTarget={`#${LANDING_ORDER_SECTION_ID}`}
                  labels={{ ...actionLabels, buyNow: block.primaryCtaLabel }}
                />
              </div>
            </section>
          );
        if (block.type === 'benefit-grid')
          return (
            <section
              key={block.id}
              id={block.id}
              className={blockClass(block, 'landing-section', 'landing-benefits')}
            >
              <h2>{block.heading}</h2>
              <div>
                {block.items.map((item, index) => {
                  const Icon = benefitIcons[item.icon];
                  return (
                    <article key={`${block.id}-${index}`}>
                      <span>
                        <Icon aria-hidden="true" />
                      </span>
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        if (block.type === 'media-feature')
          return (
            <section
              key={block.id}
              id={block.id}
              className={blockClass(block, 'landing-section', 'landing-media-feature')}
            >
              <div>{blockImage(block, image, '(max-width: 760px) 100vw, 48vw')}</div>
              <div>
                <h2>{block.heading}</h2>
                <p>{block.body}</p>
                {block.bullets.length ? (
                  <ul>
                    {block.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          );
        if (block.type === 'specifications')
          return (
            <section
              key={block.id}
              id={block.id}
              className={blockClass(block, 'landing-section', 'landing-specifications')}
            >
              <h2>{block.heading}</h2>
              <dl>
                {block.items.map((item) => (
                  <div key={`${item.label}-${item.value}`}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        if (block.type === 'faq')
          return (
            <section
              key={block.id}
              id={block.id}
              className={blockClass(block, 'landing-section', 'landing-faq')}
            >
              <h2>{block.heading}</h2>
              <div>
                {block.items.map((item) => (
                  <LandingFaqItem
                    key={item.question}
                    question={item.question}
                    answer={item.answer}
                  />
                ))}
              </div>
            </section>
          );
        if (block.type === 'editorial-intro')
          return (
            <section
              key={block.id}
              id={block.id}
              className={blockClass(block, 'landing-section', 'landing-editorial')}
            >
              <div>
                {block.eyebrow ? <p className="landing-eyebrow">{block.eyebrow}</p> : null}
                <h2>{block.heading}</h2>
              </div>
              <div>
                <p>{block.body}</p>
                {block.highlights.length ? (
                  <ul>
                    {block.highlights.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          );
        if (block.type === 'image-gallery')
          return (
            <section
              key={block.id}
              id={block.id}
              className={blockClass(block, 'landing-section', 'landing-gallery')}
            >
              <h2>{block.heading}</h2>
              <div>
                {block.images.map((item, index) => (
                  <figure key={`${block.id}-${index}`}>
                    {blockImage(
                      item,
                      product.media[index]?.url ?? image,
                      '(max-width: 760px) 88vw, 40vw',
                    )}{' '}
                    {item.caption ? <figcaption>{item.caption}</figcaption> : null}
                  </figure>
                ))}
              </div>
            </section>
          );
        if (block.type === 'use-cases')
          return (
            <section
              key={block.id}
              id={block.id}
              className={blockClass(block, 'landing-section', 'landing-use-cases')}
            >
              <header>
                <h2>{block.heading}</h2>
                {block.body ? <p>{block.body}</p> : null}
              </header>
              <div>
                {block.items.map((item, index) => {
                  const Icon = benefitIcons[item.icon];
                  return (
                    <article key={`${block.id}-${index}`}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <Icon aria-hidden="true" />
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        if (block.type === 'comparison')
          return (
            <section
              key={block.id}
              id={block.id}
              className={blockClass(block, 'landing-section', 'landing-comparison')}
            >
              <h2>{block.heading}</h2>
              <div className="landing-comparison-table" role="table" aria-label={block.heading}>
                <div className="landing-comparison-header" role="row">
                  <span role="columnheader">{locale === 'ar' ? 'المعيار' : 'Critère'}</span>
                  <strong role="columnheader">{block.productLabel}</strong>
                  <strong role="columnheader">{block.alternativeLabel}</strong>
                </div>
                {block.items.map((item) => (
                  <div
                    className="landing-comparison-row"
                    role="row"
                    key={`${block.id}-${item.label}`}
                  >
                    <b role="rowheader">{item.label}</b>
                    <span role="cell">{item.productValue}</span>
                    <span role="cell">{item.alternativeValue}</span>
                  </div>
                ))}
              </div>
              {block.footnote ? <p className="landing-footnote">{block.footnote}</p> : null}
            </section>
          );
        if (block.type === 'process')
          return (
            <section
              key={block.id}
              id={block.id}
              className={blockClass(block, 'landing-section', 'landing-process')}
            >
              <header>
                <h2>{block.heading}</h2>
                {block.body ? <p>{block.body}</p> : null}
              </header>
              <ol>
                {block.steps.map((step, index) => (
                  <li key={`${block.id}-${index}`}>
                    <span>{index + 1}</span>
                    <div>
                      <h3>{step.title}</h3>
                      <p>{step.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          );
        if (block.type === 'trust-band')
          return (
            <section
              key={block.id}
              id={block.id}
              className={blockClass(block, 'landing-section', 'landing-trust-band')}
            >
              {block.heading ? <h2>{block.heading}</h2> : null}
              <div>
                {block.items.map((item, index) => {
                  const Icon = benefitIcons[item.icon];
                  return (
                    <article key={`${block.id}-${index}`}>
                      <Icon aria-hidden="true" />
                      <div>
                        <h3>{item.title}</h3>
                        {item.description ? <p>{item.description}</p> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        if (block.type === 'commerce-panel')
          return (
            <section
              key={block.id}
              id={block.id}
              className={blockClass(block, 'landing-section', 'landing-commerce-panel')}
            >
              <div className="landing-commerce-media">
                {blockImage(block, image, '(max-width: 760px) 100vw, 42vw')}
              </div>
              <div className="landing-commerce-copy">
                <h2>{block.heading}</h2>
                {block.body ? <p>{block.body}</p> : null}
                {block.bullets.length ? (
                  <ul>
                    {block.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="landing-price">
                  <strong>{formatProductPrice(product.price, locale)}</strong>
                  {hasProductDiscount(product) ? (
                    <del>{formatProductPrice(product.oldPrice!, locale)}</del>
                  ) : null}
                </div>
                <ProductActions
                  locale={locale}
                  item={{
                    productId: product.id,
                    token,
                    title,
                    imageUrl: image,
                    unitPrice: parseProductPrice(product.price),
                    availabilityStatus: product.availability.status,
                  }}
                  analytics={analyticsFor(block.id)}
                  available={product.availability.inStock}
                  showAddToCart={block.showAddToCart}
                  buyNowTarget={`#${LANDING_ORDER_SECTION_ID}`}
                  labels={{ ...actionLabels, buyNow: block.primaryCtaLabel }}
                />
              </div>
            </section>
          );
        return (
          <section
            key={block.id}
            id={block.id}
            className={blockClass(block, 'landing-section', 'landing-final-cta')}
          >
            <div>
              <h2>{block.heading}</h2>
              {block.body ? <p>{block.body}</p> : null}
              <LandingFinalCtaLink
                href={`#${LANDING_ORDER_SECTION_ID}`}
                label={block.primaryCtaLabel}
              />
            </div>
            {block.variant === 'split' ? (
              <div>{blockImage(block, image, '(max-width: 760px) 100vw, 38vw')}</div>
            ) : null}
          </section>
        );
      })}
      {product.availability.inStock && hero ? (
        <LandingMobileCta
          href={`#${LANDING_ORDER_SECTION_ID}`}
          label={hero.primaryCtaLabel}
          price={formatProductPrice(product.price, locale)}
        />
      ) : null}
    </div>
  );
}
