import type { StorefrontHomepageResponse } from '@bric/storefront-core/contracts';
import { HomepageBannerCarousel } from '@/components/homepage-banner-carousel';
import { HomepageAddToCart } from '@/components/homepage-add-to-cart';
import { HomepageBrandCarousel, HomepageCategoryCarousel, HomepageProductCarousel } from '@/components/homepage-carousels';
import { StorefrontImage } from '@/components/storefront-image';
import { ProductTrustSignal } from '@/components/product-trust-signal';
import type { Locale } from '@/i18n/config';
import { formatProductPrice, parseProductPrice } from '@/lib/product-presentation';

const copy = {
  fr: { top: 'Top produits', topLead: 'Les outils les plus appréciés en ce moment.', categories: 'Acheter par catégorie', categoriesLead: 'Trouvez plus vite ce qu’il vous faut.', featured: 'Nos sélections', brands: 'Nos marques', cards: 'Bien choisir pour mieux travailler', add: 'Ajouter au panier', view: 'Voir le produit', delivery: 'Livraison partout en Algérie', payment: 'Paiement à la livraison', help: 'Conseil par téléphone' },
  ar: { top: 'أفضل المنتجات', topLead: 'الأدوات الأكثر طلباً في الوقت الحالي.', categories: 'تسوق حسب الفئة', categoriesLead: 'اعثر بسرعة على ما تحتاجه.', featured: 'اختياراتنا', brands: 'علاماتنا', cards: 'الاختيار الصحيح لعمل أفضل', add: 'أضف إلى السلة', view: 'عرض المنتج', delivery: 'توصيل إلى كل ولايات الجزائر', payment: 'الدفع عند الاستلام', help: 'نصيحة عبر الهاتف' },
} as const;

function SectionHeading({ title, lead }: { title: string; lead?: string }) {
  return <header className="home-section-heading"><div><h2>{title}</h2>{lead ? <p>{lead}</p> : null}</div></header>;
}

function localizeHomepageLink(link: string, locale: Locale) {
  if (/^https?:\/\//i.test(link)) return link;
  const path = link.startsWith('/') ? link : `/${link}`;
  return path === `/${locale}` || path.startsWith(`/${locale}/`) ? path : `/${locale}${path}`;
}

function TrustSignals({ locale }: { locale: Locale }) {
  const text = copy[locale];
  return <section className="home-trust-band" aria-label="Services"><ul><ProductTrustSignal icon="delivery"><strong>{text.delivery}</strong></ProductTrustSignal><ProductTrustSignal icon="payment"><strong>{text.payment}</strong></ProductTrustSignal><ProductTrustSignal icon="confirmation"><strong>{text.help}</strong></ProductTrustSignal></ul></section>;
}

function EditorialCards({ cards, locale }: { cards: StorefrontHomepageResponse['productCards']; locale: Locale }) {
  if (!cards.length) return null;
  const text = copy[locale];
  return <section className="home-section"><SectionHeading title={text.cards} /><div className="home-editorial-grid">{cards.map((card) => {
    const title = locale === 'ar' ? card.titleAr : card.titleFr; const description = locale === 'ar' ? card.descriptionAr : card.descriptionFr; const features = locale === 'ar' ? card.characteristicsAr : card.characteristicsFr; const token = card.product.slug || card.product.id;
    return <article key={card.id} className="home-editorial-card"><a className="home-editorial-media" href={`/${locale}/products/${token}`}>{card.product.images[0] ? <StorefrontImage src={card.product.images[0]} alt="" width={620} height={620} sizes="(max-width: 620px) 90vw, 36vw" quality={60} /> : <span>BRICO</span>}</a><div><p>{card.product.inStock ? (locale === 'ar' ? 'متوفر' : 'En stock') : (locale === 'ar' ? 'غير متوفر' : 'Indisponible')}</p><h3>{title}</h3><strong>{card.product.price ? formatProductPrice(card.product.price, locale) : ''}</strong><p>{description}</p>{features.length ? <ul>{features.slice(0, 4).map((feature) => <li key={feature}>{feature}</li>)}</ul> : null}<div><HomepageAddToCart locale={locale} label={text.add} available={card.product.inStock} item={{ productId: card.product.id, token: String(token), title: locale === 'ar' && card.product.titleAr ? card.product.titleAr : card.product.title, imageUrl: card.product.images[0] ?? null, unitPrice: card.product.price ? parseProductPrice(card.product.price) : 0, availabilityStatus: card.product.availabilityStatus }} /><a className="home-editorial-view" href={`/${locale}/products/${token}`}>{text.view}</a></div></div></article>;
  })}</div></section>;
}

export function Homepage({ data, locale }: { data: StorefrontHomepageResponse; locale: Locale }) {
  const text = copy[locale];
  return <div className="home-page home-production"><h1 className="sr-only">{locale === 'ar' ? 'بريكوميتر، أدوات ومعدات لكل أعمالكم' : 'Bricomaitre, outils et matériel pour tous vos travaux'}</h1>
    <HomepageBannerCarousel banners={data.banners} locale={locale} />
    <TrustSignals locale={locale} />
    {data.topProducts.length ? <section className="home-section"><SectionHeading title={text.top} lead={text.topLead} /><HomepageProductCarousel products={data.topProducts} locale={locale} brands={data.brands} categories={data.categories} /></section> : null}
    {data.categories.length ? <section className="home-section"><SectionHeading title={text.categories} lead={text.categoriesLead} /><HomepageCategoryCarousel categories={data.categories} locale={locale} /></section> : null}
    <EditorialCards cards={data.productCards} locale={locale} />
    {data.brands.length ? <section className="home-section home-brand-section"><SectionHeading title={text.brands} /><div className="home-brand-band"><HomepageBrandCarousel brands={data.brands} locale={locale} /></div></section> : null}
    {data.featuredGroups.length ? <section className="home-featured-groups" aria-label={text.featured}>{data.featuredGroups.map((group) => <section className="home-section" key={group.id}><header className="home-section-heading"><div><h2>{locale === 'ar' && group.nameAr ? group.nameAr : group.name}</h2></div>{group.cta && group.link ? <a href={localizeHomepageLink(group.link, locale)}>{locale === 'ar' && group.ctaAr ? group.ctaAr : group.cta}</a> : null}</header><HomepageProductCarousel products={group.products} locale={locale} brands={data.brands} categories={data.categories} /></section>)}</section> : null}
  </div>;
}
