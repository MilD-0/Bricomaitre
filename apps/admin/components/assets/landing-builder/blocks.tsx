'use client';
import {
  type LandingPageBlock,
  type LandingPageDocument,
} from '@bric/storefront-core/landing-pages';

export type LandingPageDetail = {
  id: number;
  productId: number;
  productTitle: string;
  productSlug: string;
  locale: 'fr' | 'ar';
  slug: string;
  active: boolean;
  currentRevision: number;
  updatedAt: string;
  document: LandingPageDocument;
};

export const commonTypes: LandingPageBlock['type'][] = [
  'product-hero',
  'benefit-grid',
  'media-feature',
  'specifications',
  'faq',
  'final-cta',
];

export const moreTypes: LandingPageBlock['type'][] = [
  'editorial-intro',
  'image-gallery',
  'use-cases',
  'comparison',
  'process',
  'trust-band',
  'commerce-panel',
];

export function createBlock(type: LandingPageBlock['type'], locale: 'fr' | 'ar'): LandingPageBlock {
  const ar = locale === 'ar';
  const id = `${type}-${Date.now().toString(36)}`;
  const base = { id, surface: 'plain' as const, width: 'wide' as const };
  if (type === 'product-hero')
    return {
      ...base,
      type,
      variant: 'media-left',
      heading: ar ? 'عنوان الحملة' : 'Titre de campagne',
      subheading: '',
      imageUrl: null,
      imageAlt: '',
      primaryCtaLabel: ar ? 'اطلب الآن' : 'Commander maintenant',
      showAddToCart: true,
    };
  if (type === 'benefit-grid')
    return {
      ...base,
      type,
      variant: 'icons',
      heading: ar ? 'المزايا' : 'Les avantages',
      items: [
        {
          title: ar ? 'ميزة أولى' : 'Premier avantage',
          description: ar ? 'اشرح الفائدة.' : 'Expliquez le bénéfice client.',
          icon: 'tool',
        },
        {
          title: ar ? 'ميزة ثانية' : 'Deuxième avantage',
          description: ar ? 'اشرح الفائدة.' : 'Expliquez le bénéfice client.',
          icon: 'tool',
        },
      ],
    };
  if (type === 'media-feature')
    return {
      ...base,
      type,
      variant: 'media-left',
      heading: ar ? 'ميزة مهمة' : 'Un avantage concret',
      body: ar ? 'اشرح كيف يساعد المنتج العميل.' : 'Expliquez comment le produit aide le client.',
      imageUrl: null,
      imageAlt: '',
      bullets: [],
    };
  if (type === 'specifications')
    return {
      ...base,
      type,
      variant: 'table',
      heading: ar ? 'المواصفات' : 'Caractéristiques',
      items: [{ label: ar ? 'الخاصية' : 'Caractéristique', value: ar ? 'القيمة' : 'Valeur' }],
    };
  if (type === 'faq')
    return {
      ...base,
      type,
      variant: 'accordion',
      heading: ar ? 'أسئلة شائعة' : 'Questions fréquentes',
      items: [
        {
          question: ar ? 'السؤال؟' : 'Votre question ?',
          answer: ar ? 'الإجابة.' : 'Votre réponse.',
        },
      ],
    };
  if (type === 'editorial-intro')
    return {
      ...base,
      type,
      variant: 'statement',
      eyebrow: '',
      heading: ar ? 'فكرة الحملة' : 'Le parti pris de la campagne',
      body: ar ? 'قدّم المنتج من زاوية واضحة.' : 'Présentez le produit sous un angle clair.',
      highlights: [],
    };
  if (type === 'image-gallery')
    return {
      ...base,
      type,
      variant: 'mosaic',
      heading: ar ? 'شاهد التفاصيل' : 'Voyez chaque détail',
      images: [
        { imageUrl: null, imageAlt: '', caption: '' },
        { imageUrl: null, imageAlt: '', caption: '' },
      ],
    };
  if (type === 'use-cases')
    return {
      ...base,
      type,
      variant: 'cards',
      heading: ar ? 'مصمم لأعمالكم' : 'Pensé pour vos travaux',
      body: '',
      items: [
        {
          title: ar ? 'الاستخدام الأول' : 'Premier usage',
          description: ar ? 'استخدم معلومة موثقة.' : 'Utilisez une information vérifiée.',
          icon: 'target',
        },
        {
          title: ar ? 'الاستخدام الثاني' : 'Deuxième usage',
          description: ar ? 'استخدم معلومة موثقة.' : 'Utilisez une information vérifiée.',
          icon: 'tool',
        },
      ],
    };
  if (type === 'comparison')
    return {
      ...base,
      type,
      variant: 'table',
      heading: ar ? 'قارن بوضوح' : 'Comparez clairement',
      productLabel: ar ? 'هذا المنتج' : 'Ce produit',
      alternativeLabel: ar ? 'البديل' : 'Alternative',
      items: [
        {
          label: ar ? 'المعيار الأول' : 'Premier critère',
          productValue: ar ? 'القيمة' : 'Valeur',
          alternativeValue: ar ? 'القيمة' : 'Valeur',
        },
        {
          label: ar ? 'المعيار الثاني' : 'Deuxième critère',
          productValue: ar ? 'القيمة' : 'Valeur',
          alternativeValue: ar ? 'القيمة' : 'Valeur',
        },
      ],
      footnote: '',
    };
  if (type === 'process')
    return {
      ...base,
      type,
      variant: 'horizontal',
      heading: ar ? 'كيف يعمل؟' : 'Comment ça marche ?',
      body: '',
      steps: [
        {
          title: ar ? 'الخطوة الأولى' : 'Première étape',
          description: ar ? 'اشرح الخطوة.' : 'Expliquez cette étape.',
        },
        {
          title: ar ? 'الخطوة الثانية' : 'Deuxième étape',
          description: ar ? 'اشرح الخطوة.' : 'Expliquez cette étape.',
        },
      ],
    };
  if (type === 'trust-band')
    return {
      ...base,
      type,
      variant: 'ribbon',
      heading: '',
      items: [
        {
          title: ar ? 'الدفع عند الاستلام' : 'Paiement à la livraison',
          description: '',
          icon: 'payment',
        },
        { title: ar ? 'توصيل سريع' : 'Livraison rapide', description: '', icon: 'delivery' },
      ],
    };
  if (type === 'commerce-panel')
    return {
      ...base,
      type,
      variant: 'spotlight',
      heading: ar ? 'اطلب منتجك' : 'Commandez votre produit',
      body: '',
      bullets: [],
      imageUrl: null,
      imageAlt: '',
      primaryCtaLabel: ar ? 'اطلب الآن' : 'Commander maintenant',
      showAddToCart: true,
    };
  return {
    ...base,
    type: 'final-cta',
    variant: 'solid',
    heading: ar ? 'هل أنت مستعد؟' : 'Prêt à commander ?',
    body: '',
    primaryCtaLabel: ar ? 'اطلب الآن' : 'Commander maintenant',
    imageUrl: null,
    imageAlt: '',
  };
}

export function blockSummary(block: LandingPageBlock) {
  if ('heading' in block && block.heading) return block.heading;
  if (block.type === 'trust-band') return block.items.map((item) => item.title).join(' · ');
  return block.type;
}
