import { storefrontOrigin } from './fixture-config.mjs';

export const product = {
  id: 12,
  canonicalToken: 'desk-lamp',
  title: 'Lampe de travail',
  titleAr: 'مصباح العمل',
  description:
    'Une lumière stable et puissante pour vos travaux, avec un format compact facile à déplacer.',
  descriptionAr: 'إضاءة قوية وثابتة لأعمالك، بتصميم مدمج وسهل النقل.',
  sku: 'DL-1',
  barcode: null,
  price: '4500.00',
  oldPrice: '5200.00',
  availability: { status: 'in_stock', inStock: true },
  media: [
    {
      url: `${storefrontOrigin}/product-placeholder.svg`,
      position: 0,
      width: 900,
      height: 900,
      blurDataUrl: null,
    },
    {
      url: `${storefrontOrigin}/product-placeholder.svg?view=2`,
      position: 1,
      width: 900,
      height: 900,
      blurDataUrl: null,
    },
  ],
  brand: {
    id: 2,
    name: 'Bric Pro',
    slug: 'bric-pro',
    image: `${storefrontOrigin}/brand-placeholder.svg`,
  },
  category: {
    id: 3,
    name: 'Éclairage',
    nameAr: 'الإضاءة',
    slug: 'lighting',
    image: null,
    parentId: 5,
    properties: [],
  },
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-02T10:00:00.000Z',
};

export function landingPage(locale) {
  const ar = locale === 'ar';
  return {
    id: 4,
    slug: 'lampe-atelier',
    locale,
    revision: 2,
    publishedAt: '2026-07-18T00:00:00.000Z',
    document: {
      schemaVersion: 1,
      theme: { accent: 'orange', density: 'comfortable', shell: 'campaign' },
      seo: {
        title: ar ? 'مصباح العمل' : 'Lampe de travail pour atelier',
        description: ar
          ? 'إضاءة قوية وثابتة لأعمالك.'
          : 'Une lumière stable et puissante pour vos travaux.',
        indexable: false,
      },
      blocks: [
        {
          id: 'hero',
          type: 'product-hero',
          variant: 'media-left',
          heading: ar ? 'أنِر كل مشروع' : 'Éclairez chaque chantier',
          subheading: ar
            ? 'إضاءة قوية ومدمجة للعمل اليومي.'
            : 'Une lumière puissante et compacte pour le travail quotidien.',
          imageUrl: null,
          imageAlt: ar ? 'مصباح العمل' : 'Lampe de travail',
          primaryCtaLabel: ar ? 'اطلب الآن' : 'Commander maintenant',
          showAddToCart: true,
        },
        {
          id: 'benefits',
          type: 'benefit-grid',
          variant: 'icons',
          heading: ar ? 'لماذا تختاره؟' : 'Pourquoi le choisir ?',
          items: [
            {
              title: ar ? 'إضاءة قوية' : 'Lumière puissante',
              description: ar
                ? 'رؤية واضحة أثناء العمل.'
                : 'Une visibilité nette pendant le travail.',
              icon: 'power',
            },
            {
              title: ar ? 'الدفع عند الاستلام' : 'Paiement à la livraison',
              description: ar ? 'ادفع عند استلام طلبك.' : 'Payez à la réception.',
              icon: 'payment',
            },
            {
              title: ar ? 'توصيل سريع' : 'Livraison rapide',
              description: ar ? 'إلى جميع أنحاء الجزائر.' : 'Partout en Algérie.',
              icon: 'delivery',
            },
          ],
        },
        {
          id: 'details',
          type: 'media-feature',
          variant: 'media-right',
          heading: ar ? 'مصمم للعمل' : 'Pensée pour le travail',
          body: ar ? 'هيكل مدمج وسهل النقل.' : 'Un format compact, stable et facile à déplacer.',
          imageUrl: null,
          imageAlt: ar ? 'مصباح مدمج' : 'Lampe compacte',
          bullets: [],
        },
        {
          id: 'specifications',
          type: 'specifications',
          variant: 'table',
          heading: ar ? 'المواصفات' : 'Caractéristiques',
          items: [{ label: ar ? 'المرجع' : 'Référence', value: 'DL-1' }],
        },
        {
          id: 'faq',
          type: 'faq',
          variant: 'accordion',
          heading: ar ? 'أسئلة شائعة' : 'Questions fréquentes',
          items: [
            {
              question: ar ? 'كيف يتم تأكيد الطلب؟' : 'Comment confirmer la commande ?',
              answer: ar ? 'نتصل بك عبر الهاتف.' : 'Nous vous appelons par téléphone.',
            },
          ],
        },
        {
          id: 'final',
          type: 'final-cta',
          variant: 'solid',
          heading: ar ? 'جاهز لإضاءة ورشتك؟' : 'Prêt à mieux éclairer votre atelier ?',
          body: ar
            ? 'اطلب الآن وادفع عند الاستلام.'
            : 'Commandez maintenant et payez à la livraison.',
          primaryCtaLabel: ar ? 'اطلب الآن' : 'Commander maintenant',
          imageUrl: null,
          imageAlt: '',
        },
      ],
    },
    product,
  };
}

export const catalogProducts = [
  {
    id: 12,
    slug: 'desk-lamp',
    mongoId: 'legacy-lamp',
    title: 'Lampe de travail',
    titleAr: 'مصباح العمل',
    description: product.description,
    descriptionAr: product.descriptionAr,
    sku: 'DL-1',
    barcode: null,
    price: '4500.00',
    oldPrice: '5200.00',
    inStock: true,
    availabilityStatus: 'in_stock',
    brandId: 2,
    categoryId: 3,
    images: ['/product-placeholder.svg'],
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  },
  {
    id: 42,
    slug: 'work-light-tripod',
    mongoId: null,
    title: 'Projecteur de chantier sur trépied',
    titleAr: 'كشاف ورشة على حامل',
    description: 'Un éclairage stable pour les chantiers et ateliers.',
    descriptionAr: 'إضاءة ثابتة للورشات ومواقع العمل.',
    sku: 'WL-42',
    barcode: null,
    price: '7200.00',
    oldPrice: null,
    inStock: true,
    availabilityStatus: 'in_stock',
    brandId: 2,
    categoryId: 3,
    images: ['/product-placeholder.svg?light=2'],
    createdAt: '2026-06-29T10:00:00.000Z',
    updatedAt: '2026-07-01T12:00:00.000Z',
  },
  {
    id: 13,
    slug: 'impact-drill',
    mongoId: null,
    title: 'Perceuse à percussion',
    titleAr: 'مثقاب طرقي',
    description: 'Une perceuse compacte pour les travaux courants.',
    descriptionAr: 'مثقاب مدمج للأعمال اليومية.',
    sku: 'PD-13',
    barcode: null,
    price: '8900.00',
    oldPrice: null,
    inStock: false,
    availabilityStatus: 'out_of_stock',
    brandId: 2,
    categoryId: 4,
    images: ['/product-placeholder.svg?drill=1'],
    createdAt: '2026-06-28T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
  },
];

for (let id = 14; id <= 41; id += 1) {
  catalogProducts.push({
    id,
    slug: `workshop-tool-${id}`,
    mongoId: null,
    title: `Outil d’atelier ${id}`,
    titleAr: `أداة ورشة ${id}`,
    description: 'Un outil fiable pour les travaux courants.',
    descriptionAr: 'أداة موثوقة للأعمال اليومية.',
    sku: `WT-${id}`,
    barcode: null,
    price: `${3000 + id * 100}.00`,
    oldPrice: null,
    inStock: true,
    availabilityStatus: 'in_stock',
    brandId: 2,
    categoryId: 4,
    images: ['/product-placeholder.svg?tool=1'],
    createdAt: '2026-06-20T10:00:00.000Z',
    updatedAt: `2026-06-${String(Math.min(28, id)).padStart(2, '0')}T10:00:00.000Z`,
  });
}

for (let id = 43; id <= 50; id += 1) {
  catalogProducts.push({
    id,
    slug: `work-light-${id}`,
    mongoId: null,
    title: `Éclairage de chantier ${id}`,
    titleAr: `إضاءة ورشة ${id}`,
    description: 'Un éclairage complémentaire pour les travaux.',
    descriptionAr: 'إضاءة إضافية لأعمال الورشة.',
    sku: `WL-${id}`,
    barcode: null,
    price: `${5000 + id * 50}.00`,
    oldPrice: null,
    inStock: true,
    availabilityStatus: 'in_stock',
    brandId: 2,
    categoryId: 3,
    images: ['/product-placeholder.svg?light=3'],
    createdAt: '2026-06-21T10:00:00.000Z',
    updatedAt: `2026-06-${String(id - 20).padStart(2, '0')}T10:00:00.000Z`,
  });
}

// Exercise list payloads with bilingual catalog copy, not empty descriptions.
for (const item of catalogProducts) {
  item.description = (item.description ?? 'Outil robuste pour les travaux de chantier. ').repeat(
    80,
  );
  item.descriptionAr = (
    item.descriptionAr ?? 'أداة متينة للاستخدام في الورشة ومواقع العمل. '
  ).repeat(80);
}

export const categories = [
  {
    id: 5,
    name: 'Équipement d’atelier',
    slug: 'workshop-equipment',
    nameEn: 'Workshop equipment',
    nameAr: 'معدات الورشة',
    image: null,
    parentId: null,
    properties: [],
    featured: false,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
  },
  {
    id: 3,
    name: 'Éclairage',
    slug: 'lighting',
    nameEn: 'Lighting',
    nameAr: 'الإضاءة',
    image: null,
    parentId: 5,
    properties: [],
    featured: true,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
  },
  {
    id: 4,
    name: 'Outillage électrique',
    slug: 'power-tools',
    nameEn: 'Power tools',
    nameAr: 'أدوات كهربائية',
    image: null,
    parentId: null,
    properties: [],
    featured: true,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
  },
];

for (let id = 20; id < 44; id += 1) {
  categories.push({
    id,
    name: `Catégorie test ${id}`,
    slug: `test-category-${id}`,
    nameEn: `Test category ${id}`,
    nameAr: `فئة اختبار ${id}`,
    image: null,
    parentId: 4,
    properties: [],
    featured: false,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
  });
}

export const ecotrackCatalog = {
  wilayas: [
    { wilayaId: 16, name: 'Alger' },
    { wilayaId: 31, name: 'Oran' },
  ],
  communes: [
    { communeId: 1, wilayaId: 16, name: 'Alger Centre', postalCode: '16000', hasStopDesk: true },
    { communeId: 2, wilayaId: 31, name: 'Oran', postalCode: '31000', hasStopDesk: false },
  ],
  serviceFees: [
    { serviceType: 'livraison', wilayaId: 16, homeFee: '500', stopDeskFee: '300' },
    { serviceType: 'livraison', wilayaId: 31, homeFee: '700', stopDeskFee: '500' },
  ],
  weightFees: [],
  lastSync: null,
};
