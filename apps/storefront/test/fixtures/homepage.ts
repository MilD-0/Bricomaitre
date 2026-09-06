import type { StorefrontHomepageResponse } from '@bric/storefront-core/contracts';

type Localized = { fr: string; ar: string };

type HomepageCategory = {
  id: number;
  name: Localized;
  slug: string;
  image: string;
};

type HomepageProduct = {
  product: StorefrontHomepageResponse['topProducts'][number];
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
): StorefrontHomepageResponse['topProducts'][number] => ({
  id,
  slug,
  mongoId: null,
  title,
  titleAr,
  description: null,
  descriptionAr: null,
  sku: `FIXTURE-${id}`,
  barcode: null,
  price,
  oldPrice,
  inStock: true,
  availabilityStatus: 'in_stock',
  brandId,
  categoryId,
  images: [image],
  createdAt: now,
  updatedAt: now,
});

const homepageCategories: HomepageCategory[] = [
  {
    id: 1,
    name: { fr: 'Outillage électrique', ar: 'أدوات كهربائية' },
    slug: 'outillage-electrique',
    image: '/fixture/homepage/drill.svg',
  },
  {
    id: 2,
    name: { fr: 'Outillage mécanique', ar: 'أدوات ميكانيكية' },
    slug: 'outillage-mecanique',
    image: '/fixture/homepage/wrench.svg',
  },
  {
    id: 3,
    name: { fr: 'Jardinage', ar: 'معدات الحدائق' },
    slug: 'jardinage',
    image: '/fixture/homepage/garden.svg',
  },
  {
    id: 4,
    name: { fr: 'Mesure & précision', ar: 'القياس والدقة' },
    slug: 'mesure',
    image: '/fixture/homepage/measure.svg',
  },
  {
    id: 5,
    name: { fr: 'Accessoires', ar: 'اللوازم' },
    slug: 'accessoires',
    image: '/fixture/homepage/accessories.svg',
  },
  {
    id: 6,
    name: { fr: 'Équipement d’atelier', ar: 'تجهيز الورشات' },
    slug: 'atelier',
    image: '/fixture/homepage/workshop.svg',
  },
];

const homepageProducts: HomepageProduct[] = [
  {
    product: product(
      101,
      'perceuse-sans-fil-20v',
      'Perceuse sans fil 20V',
      'مثقاب لاسلكي 20 فولت',
      '12900.00',
      '14800.00',
      '/fixture/homepage/drill.svg',
      1,
      1,
    ),
    brand: 'TOTAL',
    category: homepageCategories[0].name,
  },
  {
    product: product(
      102,
      'cle-a-choc-480nm',
      'Clé à choc brushless 480 N·m',
      'مفتاح صدمات 480 نيوتن',
      '18900.00',
      null,
      '/fixture/homepage/wrench.svg',
      2,
      2,
    ),
    brand: 'WADFOW',
    category: homepageCategories[1].name,
  },
  {
    product: product(
      103,
      'coffret-douilles-46-pieces',
      'Coffret de douilles 46 pièces',
      'طقم مقابس 46 قطعة',
      '4900.00',
      '5500.00',
      '/fixture/homepage/accessories.svg',
      3,
      2,
    ),
    brand: 'BEETRO',
    category: homepageCategories[1].name,
  },
  {
    product: product(
      104,
      'nettoyeur-haute-pression',
      'Nettoyeur haute pression 1800W',
      'غسالة ضغط عالي 1800 واط',
      '24500.00',
      null,
      '/fixture/homepage/workshop.svg',
      4,
      6,
    ),
    brand: 'CROWN',
    category: homepageCategories[5].name,
  },
];

export const homepageFixtureResponse: StorefrontHomepageResponse = {
  banners: [
    {
      id: 1,
      title: 'Les essentiels de votre atelier',
      titleAr: 'أساسيات ورشتك',
      imageUrl: '/fixture/homepage/banner-workshop-wide.svg',
      imageUrlLandscape: '/fixture/homepage/banner-workshop-wide.svg',
      imageUrlPortrait: '/fixture/homepage/banner-workshop-portrait.svg',
      productId: 101,
      sortOrder: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 2,
      title: 'La gamme 20V',
      titleAr: 'مجموعة 20 فولت',
      imageUrl: '/fixture/homepage/banner-power-wide.svg',
      imageUrlLandscape: '/fixture/homepage/banner-power-wide.svg',
      imageUrlPortrait: '/fixture/homepage/banner-power-portrait.svg',
      productId: 102,
      sortOrder: 1,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
  ],
  topProducts: homepageProducts.map(({ product }) => product),
  categories: homepageCategories.map((category) => ({
    id: category.id,
    name: category.name.fr,
    nameAr: category.name.ar,
    nameEn: null,
    slug: category.slug,
    image: category.image,
    parentId: null,
    properties: [],
    featured: true,
    productCount: 0,
    createdAt: now,
    updatedAt: now,
  })),
  productCards: homepageProducts.slice(0, 2).map(({ product }, index) => ({
    id: index + 1,
    productId: product.id,
    titleFr:
      index === 0 ? 'Une seule batterie, tous vos projets' : 'La force qu’il faut à l’atelier',
    titleAr: index === 0 ? 'بطارية واحدة لكل مشاريعك' : 'القوة التي تحتاجها ورشتك',
    descriptionFr:
      index === 0
        ? 'Une perceuse polyvalente, compacte et prête pour les travaux du quotidien.'
        : 'Un couple puissant et un moteur brushless pour les travaux exigeants.',
    descriptionAr:
      index === 0
        ? 'مثقاب متعدد الاستعمالات ومدمج وجاهز للأعمال اليومية.'
        : 'عزم قوي ومحرك بدون فحم للأعمال الصعبة.',
    characteristicsFr:
      index === 0
        ? ['Batterie 20V', 'Mandrin auto-serrant', 'Deux vitesses']
        : ['480 N·m', 'Moteur brushless', 'Deux batteries'],
    characteristicsAr:
      index === 0
        ? ['بطارية 20 فولت', 'ظرف تلقائي', 'سرعتان']
        : ['480 نيوتن متر', 'محرك بدون فحم', 'بطاريتان'],
    sortOrder: index,
    active: true,
    createdAt: now,
    updatedAt: now,
    product,
  })),
  brands: ['TOTAL', 'CROWN', 'BEETRO', 'WADFOW', 'HIKOKI'].map((name, index) => ({
    id: index + 1,
    name,
    slug: name.toLowerCase(),
    image: '/brand-placeholder.svg',
    featured: true,
    createdAt: now,
    updatedAt: now,
  })),
  featuredGroups: [
    {
      id: 1,
      name: 'Pour équiper votre atelier',
      nameAr: 'لتجهيز ورشتك',
      cta: 'Voir la sélection',
      ctaAr: 'عرض المجموعة',
      link: '/products',
      sortOrder: 0,
      prioritizeRecommendations: false,
      active: true,
      productIds: homepageProducts.map(({ product }) => product.id),
      brandIds: [],
      categoryIds: [],
      createdAt: now,
      updatedAt: now,
      products: homepageProducts.map(({ product }) => product),
    },
  ],
};
