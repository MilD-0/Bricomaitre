import type {
  StorefrontHomepageResponse,
  StorefrontSettingsResponse,
} from '@bric/storefront-core/contracts';
import { HomepageBannerCarousel } from '@/components/homepage-banner-carousel';
import { HomepageAddToCart } from '@/components/homepage-add-to-cart';
import {
  HomepageBrandCarousel,
  HomepageCategoryCarousel,
  HomepageProductCarousel,
} from '@/components/homepage-carousels';
import { StorefrontImage } from '@/components/storefront-image';
import { ProductTrustSignal } from '@/components/product-trust-signal';
import type { Locale } from '@/i18n/config';
import { formatProductPrice, parseProductPrice } from '@/lib/product-presentation';

const copy = {
  fr: {
    top: 'Top produits',
    categories: 'Acheter par catégorie',
    featured: 'Nos sélections',
    brands: 'Nos marques',
    cards: 'Bien choisir pour mieux travailler',
    add: 'Ajouter au panier',
    view: 'Voir le produit',
    delivery: 'Livraison rapide partout en Algérie',
    payment: 'Paiement à la livraison',
    unavailable:
      'Nos produits sont momentanément indisponibles. Veuillez réessayer dans quelques instants.',
  },
  ar: {
    top: 'أفضل المنتجات',
    categories: 'تسوق حسب الفئة',
    featured: 'اختياراتنا',
    brands: 'علاماتنا',
    cards: 'الاختيار الصحيح لعمل أفضل',
    add: 'أضف إلى السلة',
    view: 'عرض المنتج',
    delivery: 'توصيل سريع إلى كل ولايات الجزائر',
    payment: 'الدفع عند الاستلام',
    unavailable: 'منتجاتنا غير متاحة مؤقتًا. يرجى المحاولة مرة أخرى بعد قليل.',
  },
} as const;
const HOMEPAGE_CATEGORY_LIMIT = 16;

type Product = StorefrontHomepageResponse['topProducts'][number];
type Category = StorefrontHomepageResponse['categories'][number];
type Brand = StorefrontHomepageResponse['brands'][number];

export function selectHomepageCategories(categories: Category[]) {
  const roots = categories.filter((category) => category.parentId === null);
  return (roots.length > 0 ? roots : categories).slice(0, HOMEPAGE_CATEGORY_LIMIT);
}

export function selectCarouselTaxonomy(
  products: Product[],
  brands: Brand[],
  categories: Category[],
) {
  const brandIds = new Set(
    products.flatMap((product) => (product.brandId ? [product.brandId] : [])),
  );
  const categoryIds = new Set(
    products.flatMap((product) => (product.categoryId ? [product.categoryId] : [])),
  );
  return {
    brands: brands.filter((brand) => brandIds.has(brand.id)),
    categories: categories.filter((category) => categoryIds.has(category.id)),
  };
}

function SectionHeading({ title, lead }: { title: string; lead?: string }) {
  return (
    <header className="home-section-heading">
      <div>
        <h2>{title}</h2>
        {lead ? <p>{lead}</p> : null}
      </div>
    </header>
  );
}

function localizeHomepageLink(link: string, locale: Locale) {
  if (/^https?:\/\//i.test(link)) return link;
  const path = link.startsWith('/') ? link : `/${link}`;
  return path === `/${locale}` || path.startsWith(`/${locale}/`) ? path : `/${locale}${path}`;
}

function TrustSignals({
  locale,
  contact,
}: {
  locale: Locale;
  contact: StorefrontSettingsResponse;
}) {
  const text = copy[locale];
  return (
    <section className="home-trust-band" aria-label="Services">
      <ul>
        <ProductTrustSignal icon="delivery">
          <strong>{text.delivery}</strong>
        </ProductTrustSignal>
        <ProductTrustSignal icon="payment">
          <strong>{text.payment}</strong>
        </ProductTrustSignal>
        <ProductTrustSignal icon="confirmation">
          <strong dir="ltr">{contact.phoneDisplay}</strong>
        </ProductTrustSignal>
      </ul>
    </section>
  );
}

function EditorialCards({
  cards,
  locale,
}: {
  cards: StorefrontHomepageResponse['productCards'];
  locale: Locale;
}) {
  if (!cards.length) return null;
  const text = copy[locale];
  return (
    <section className="home-section">
      <SectionHeading title={text.cards} />
      <div className="home-editorial-grid">
        {cards.map((card) => {
          const title = locale === 'ar' ? card.titleAr : card.titleFr;
          const description = locale === 'ar' ? card.descriptionAr : card.descriptionFr;
          const features = locale === 'ar' ? card.characteristicsAr : card.characteristicsFr;
          const token = card.product.slug || card.product.id;
          return (
            <article key={card.id} className="home-editorial-card">
              <a
                className="home-editorial-media"
                href={`/${locale}/products/${token}`}
                aria-label={title}
              >
                {card.product.images[0] ? (
                  <StorefrontImage
                    src={card.product.images[0]}
                    alt=""
                    width={620}
                    height={620}
                    sizes="(max-width: 620px) 90vw, 36vw"
                    quality={60}
                  />
                ) : (
                  <span aria-hidden="true">BRICO</span>
                )}
              </a>
              <div>
                <p>
                  {card.product.inStock
                    ? locale === 'ar'
                      ? 'متوفر'
                      : 'En stock'
                    : locale === 'ar'
                      ? 'غير متوفر'
                      : 'Indisponible'}
                </p>
                <h3>{title}</h3>
                <strong>
                  {card.product.price ? formatProductPrice(card.product.price, locale) : ''}
                </strong>
                <p>{description}</p>
                {features.length ? (
                  <ul>
                    {features.slice(0, 4).map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                ) : null}
                <div>
                  <HomepageAddToCart
                    locale={locale}
                    label={text.add}
                    available={card.product.inStock}
                    item={{
                      productId: card.product.id,
                      token: String(token),
                      title:
                        locale === 'ar' && card.product.titleAr
                          ? card.product.titleAr
                          : card.product.title,
                      imageUrl: card.product.images[0] ?? null,
                      unitPrice: card.product.price ? parseProductPrice(card.product.price) : 0,
                      availabilityStatus: card.product.availabilityStatus,
                    }}
                  />
                  <a className="home-editorial-view" href={`/${locale}/products/${token}`}>
                    {text.view}
                  </a>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CuratedProductCarousel({
  products,
  brands,
  categories,
  locale,
  featuredGroupId,
  eagerImages = false,
}: {
  products: Product[];
  brands: Brand[];
  categories: Category[];
  locale: Locale;
  featuredGroupId?: number;
  eagerImages?: boolean;
}) {
  const taxonomy = selectCarouselTaxonomy(products, brands, categories);
  return (
    <HomepageProductCarousel
      products={products}
      locale={locale}
      featuredGroupId={featuredGroupId}
      eagerImages={eagerImages}
      {...taxonomy}
    />
  );
}

export function Homepage({
  data,
  locale,
  contact,
}: {
  data: StorefrontHomepageResponse;
  locale: Locale;
  contact: StorefrontSettingsResponse;
}) {
  const text = copy[locale];
  const hasMerchandising = Object.values(data).some((items) => items.length > 0);
  return (
    <div className="home-page home-production">
      <h1 className="sr-only">
        {locale === 'ar'
          ? 'بريكوميتر، أدوات ومعدات لكل أعمالكم'
          : 'Bricomaitre, outils et matériel pour tous vos travaux'}
      </h1>
      <HomepageBannerCarousel banners={data.banners} locale={locale} />
      <TrustSignals locale={locale} contact={contact} />
      {!hasMerchandising ? (
        <section className="home-section home-unavailable" role="status">
          <p>{text.unavailable}</p>
        </section>
      ) : null}
      {data.topProducts.length ? (
        <section className="home-section">
          <SectionHeading title={text.top} />
          <CuratedProductCarousel
            products={data.topProducts}
            locale={locale}
            brands={data.brands}
            categories={data.categories}
            eagerImages
          />
        </section>
      ) : null}
      {data.categories.length ? (
        <section className="home-section">
          <SectionHeading title={text.categories} />
          <HomepageCategoryCarousel
            categories={selectHomepageCategories(data.categories)}
            locale={locale}
          />
        </section>
      ) : null}
      <EditorialCards cards={data.productCards} locale={locale} />
      {data.brands.length ? (
        <section className="home-section home-brand-section">
          <SectionHeading title={text.brands} />
          <div className="home-brand-band">
            <HomepageBrandCarousel brands={data.brands} locale={locale} />
          </div>
        </section>
      ) : null}
      {data.featuredGroups.length ? (
        <section className="home-featured-groups" aria-label={text.featured}>
          {data.featuredGroups.map((group) => (
            <section className="home-section" key={group.id}>
              <header className="home-section-heading home-featured-heading">
                <div>
                  <h2>{locale === 'ar' && group.nameAr ? group.nameAr : group.name}</h2>
                </div>
              </header>
              <CuratedProductCarousel
                products={group.products}
                locale={locale}
                brands={data.brands}
                categories={data.categories}
                featuredGroupId={group.id}
              />
              {group.cta && group.link ? (
                <a className="home-featured-cta" href={localizeHomepageLink(group.link, locale)}>
                  {locale === 'ar' && group.ctaAr ? group.ctaAr : group.cta}
                </a>
              ) : null}
            </section>
          ))}
        </section>
      ) : null}
    </div>
  );
}
