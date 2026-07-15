import type { CatalogProduct } from '@/components/catalog-card';
import type { StorefrontHomepageResponse } from '@bric/storefront-core/contracts';
import type { Locale } from '@/i18n/config';

export type HomepageConcept = '1' | '2' | '3';

type Localized = { fr: string; ar: string };

export type HomepageCategory = {
  id: number;
  name: Localized;
  slug: string;
  image: string;
};

export type HomepageProduct = {
  product: CatalogProduct;
  brand: string;
  category: Localized;
};

const now = '2026-07-01T10:00:00.000Z';

const product = (
  id: number,
  slug: string,
  title: string,
  titleAr: string,
  price: string,
  oldPrice: string | null,
  image: string,
  brandId: number,
  categoryId: number,
): CatalogProduct => ({
  id, slug, mongoId: null, title, titleAr, description: null, descriptionAr: null,
  sku: `MOCK-${id}`, barcode: null, price, oldPrice, active: true, inStock: true,
  availabilityStatus: 'in_stock', inventoryQuantity: 12, brandId, categoryId,
  images: [image], createdAt: now, updatedAt: now,
});

export const homepageCategories: HomepageCategory[] = [
  { id: 1, name: { fr: 'Outillage électrique', ar: 'أدوات كهربائية' }, slug: 'outillage-electrique', image: '/mock/drill.svg' },
  { id: 2, name: { fr: 'Outillage mécanique', ar: 'أدوات ميكانيكية' }, slug: 'outillage-mecanique', image: '/mock/wrench.svg' },
  { id: 3, name: { fr: 'Jardinage', ar: 'معدات الحدائق' }, slug: 'jardinage', image: '/mock/garden.svg' },
  { id: 4, name: { fr: 'Mesure & précision', ar: 'القياس والدقة' }, slug: 'mesure', image: '/mock/measure.svg' },
  { id: 5, name: { fr: 'Accessoires', ar: 'اللوازم' }, slug: 'accessoires', image: '/mock/accessories.svg' },
  { id: 6, name: { fr: 'Équipement d’atelier', ar: 'تجهيز الورشات' }, slug: 'atelier', image: '/mock/workshop.svg' },
];

export const homepageProducts: HomepageProduct[] = [
  { product: product(101, 'perceuse-sans-fil-20v', 'Perceuse sans fil 20V', 'مثقاب لاسلكي 20 فولت', '12900.00', '14800.00', '/mock/drill.svg', 1, 1), brand: 'TOTAL', category: homepageCategories[0].name },
  { product: product(102, 'cle-a-choc-480nm', 'Clé à choc brushless 480 N·m', 'مفتاح صدمات 480 نيوتن', '18900.00', null, '/mock/wrench.svg', 2, 2), brand: 'WADFOW', category: homepageCategories[1].name },
  { product: product(103, 'coffret-douilles-46-pieces', 'Coffret de douilles 46 pièces', 'طقم مقابس 46 قطعة', '4900.00', '5500.00', '/mock/accessories.svg', 3, 2), brand: 'BEETRO', category: homepageCategories[1].name },
  { product: product(104, 'nettoyeur-haute-pression', 'Nettoyeur haute pression 1800W', 'غسالة ضغط عالي 1800 واط', '24500.00', null, '/mock/workshop.svg', 4, 6), brand: 'CROWN', category: homepageCategories[5].name },
];

export const homepageCopy = {
  fr: {
    preview: 'Comparer les concepts', concept: 'Concept', mock: 'Aperçu avec données fictives',
    browse: 'Voir tous les produits', shopNow: 'Découvrir l’offre', categories: 'Acheter par catégorie',
    categoriesLead: 'Allez droit à l’outil qu’il vous faut.', popular: 'Les plus demandés',
    popularLead: 'Les outils choisis par les professionnels et les bricoleurs cette semaine.',
    allProducts: 'Voir tout', inStock: 'En stock', outOfStock: 'Indisponible', priceOnRequest: 'Prix sur demande', view: 'Voir',
    trustDelivery: 'Livraison partout en Algérie', trustPayment: 'Paiement à la livraison', trustHelp: 'Conseil par téléphone',
    brands: 'Les marques que vous connaissez', heroTag: 'Équipement professionnel · Prix juste',
    heroTitle: 'Les bons outils. Sans perdre de temps.', heroText: 'Outillage fiable, commande simple et accompagnement humain pour tous vos travaux.',
    offerTag: 'Offre atelier', offerTitle: 'Équipez votre atelier sans dépasser votre budget', offerText: 'Une sélection robuste pour travailler mieux, dès aujourd’hui.',
    catalogTitle: 'Tout commence par le bon outil.', catalogText: 'Parcourez nos univers, comparez simplement et commandez en quelques minutes.',
    campaignTag: 'Choix du moment', campaignTitle: 'La puissance 20V, prête pour vos chantiers.', campaignText: 'Une gamme polyvalente pensée pour avancer plus vite.',
    from: 'À partir de', promoOne: 'Essentiels de l’atelier', promoTwo: 'Mesure précise, travail propre',
  },
  ar: {
    preview: 'مقارنة التصاميم', concept: 'التصميم', mock: 'معاينة ببيانات تجريبية',
    browse: 'عرض كل المنتجات', shopNow: 'اكتشف العرض', categories: 'تسوق حسب الفئة',
    categoriesLead: 'انتقل مباشرة إلى الأداة التي تحتاجها.', popular: 'الأكثر طلباً',
    popularLead: 'الأدوات التي اختارها المحترفون وهواة الأعمال اليدوية هذا الأسبوع.',
    allProducts: 'عرض الكل', inStock: 'متوفر', outOfStock: 'غير متوفر', priceOnRequest: 'السعر عند الطلب', view: 'عرض',
    trustDelivery: 'توصيل إلى كل ولايات الجزائر', trustPayment: 'الدفع عند الاستلام', trustHelp: 'نصيحة عبر الهاتف',
    brands: 'العلامات التي تعرفها', heroTag: 'معدات احترافية · سعر مناسب',
    heroTitle: 'الأداة المناسبة. دون تضييع الوقت.', heroText: 'أدوات موثوقة، طلب بسيط ومرافقة بشرية لكل أعمالك.',
    offerTag: 'عرض الورشة', offerTitle: 'جهّز ورشتك دون تجاوز ميزانيتك', offerText: 'اختيار متين يساعدك على العمل بشكل أفضل من اليوم.',
    catalogTitle: 'كل عمل يبدأ بالأداة المناسبة.', catalogText: 'تصفح الأقسام، قارن بسهولة واطلب خلال دقائق.',
    campaignTag: 'اختيارنا الآن', campaignTitle: 'قوة 20 فولت جاهزة لمشاريعك.', campaignText: 'مجموعة متعددة الاستخدامات لتنجز أسرع.',
    from: 'ابتداءً من', promoOne: 'أساسيات الورشة', promoTwo: 'قياس دقيق، عمل متقن',
  },
} satisfies Record<Locale, Record<string, string>>;

export function normalizeHomepageConcept(value: string | string[] | undefined): HomepageConcept {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === '2' || candidate === '3' ? candidate : '1';
}

export const mockHomepageResponse: StorefrontHomepageResponse = {
  banners: [
    { id: 1, title: 'Les essentiels de votre atelier', titleAr: 'أساسيات ورشتك', imageUrl: '/mock/banner-workshop-wide.svg', imageUrlLandscape: '/mock/banner-workshop-wide.svg', imageUrlPortrait: '/mock/banner-workshop-portrait.svg', productId: 101, sortOrder: 0, active: true, createdAt: now, updatedAt: now },
    { id: 2, title: 'La gamme 20V', titleAr: 'مجموعة 20 فولت', imageUrl: '/mock/banner-power-wide.svg', imageUrlLandscape: '/mock/banner-power-wide.svg', imageUrlPortrait: '/mock/banner-power-portrait.svg', productId: 102, sortOrder: 1, active: true, createdAt: now, updatedAt: now },
  ],
  topProducts: homepageProducts.map(({ product }) => product),
  categories: homepageCategories.map((category) => ({ id: category.id, name: category.name.fr, nameAr: category.name.ar, nameEn: null, slug: category.slug, image: category.image, parentId: null, properties: [], featured: true, createdAt: now, updatedAt: now })),
  productCards: homepageProducts.slice(0, 2).map(({ product }, index) => ({ id: index + 1, productId: product.id, titleFr: index === 0 ? 'Une seule batterie, tous vos projets' : 'La force qu’il faut à l’atelier', titleAr: index === 0 ? 'بطارية واحدة لكل مشاريعك' : 'القوة التي تحتاجها ورشتك', descriptionFr: index === 0 ? 'Une perceuse polyvalente, compacte et prête pour les travaux du quotidien.' : 'Un couple puissant et un moteur brushless pour les travaux exigeants.', descriptionAr: index === 0 ? 'مثقاب متعدد الاستعمالات ومدمج وجاهز للأعمال اليومية.' : 'عزم قوي ومحرك بدون فحم للأعمال الصعبة.', characteristicsFr: index === 0 ? ['Batterie 20V', 'Mandrin auto-serrant', 'Deux vitesses'] : ['480 N·m', 'Moteur brushless', 'Deux batteries'], characteristicsAr: index === 0 ? ['بطارية 20 فولت', 'ظرف تلقائي', 'سرعتان'] : ['480 نيوتن متر', 'محرك بدون فحم', 'بطاريتان'], sortOrder: index, active: true, createdAt: now, updatedAt: now, product })),
  brands: ['TOTAL', 'CROWN', 'BEETRO', 'WADFOW', 'HIKOKI'].map((name, index) => ({ id: index + 1, name, slug: name.toLowerCase(), image: '/brand-placeholder.svg', featured: true, createdAt: now, updatedAt: now })),
  featuredGroups: [{ id: 1, name: 'Pour équiper votre atelier', nameAr: 'لتجهيز ورشتك', cta: 'Voir la sélection', ctaAr: 'عرض المجموعة', link: '/products', sortOrder: 0, showAtTopOfProductsPage: false, active: true, productIds: homepageProducts.map(({ product }) => product.id), brandIds: [], categoryIds: [], createdAt: now, updatedAt: now, products: homepageProducts.map(({ product }) => product) }],
};
