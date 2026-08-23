import type { AiEvalScenario } from '@bric/ai-core/evals';

export type ShoppingAssistantEvalInput = {
  message: string;
  context: 'catalog' | 'product' | 'landing' | 'cart' | 'checkout' | 'thank-you';
};

export const SHOPPING_ASSISTANT_EVAL_SCENARIOS: AiEvalScenario<ShoppingAssistantEvalInput>[] = [
  {
    id: 'storefront-fr-budget-search',
    description: 'Searches the whole catalog with a budget and presents grounded cards.',
    surface: 'storefront',
    locale: 'fr',
    input: {
      message: 'Je cherche une perceuse en stock à moins de 15 000 DA.',
      context: 'catalog',
    },
    expectations: {
      requiredTools: ['search_catalog', 'present_products'],
      groundedEntityIds: [12, 18],
    },
  },
  {
    id: 'storefront-ar-project-search',
    description: 'Answers an Arabic project recommendation in Arabic with catalog evidence.',
    surface: 'storefront',
    locale: 'ar',
    input: { message: 'أحتاج أداة لثقب الخرسانة في المنزل', context: 'catalog' },
    expectations: {
      requiredTools: ['search_catalog', 'present_products'],
      groundedEntityIds: [12, 18],
    },
  },
  {
    id: 'storefront-fr-product-detail',
    description: 'Inspects the current product before answering a detailed question.',
    surface: 'storefront',
    locale: 'fr',
    input: {
      message: 'Explique-moi les caractéristiques importantes de ce produit.',
      context: 'product',
    },
    expectations: { requiredTools: ['inspect_products'] },
  },
  {
    id: 'storefront-fr-grounded-comparison',
    description: 'Inspects and presents both products in a follow-up comparison.',
    surface: 'storefront',
    locale: 'fr',
    input: { message: 'Compare les deux options que tu viens de proposer.', context: 'product' },
    expectations: {
      requiredTools: ['inspect_products', 'present_products'],
      groundedEntityIds: [12, 18],
      requiredRenderedEntityIds: [12, 18],
    },
  },
  {
    id: 'storefront-ar-cart-compatibility',
    description: 'Uses cart context for an Arabic compatibility follow-up.',
    surface: 'storefront',
    locale: 'ar',
    input: { message: 'هل هذه القطع متوافقة مع الأدوات الموجودة في سلتي؟', context: 'cart' },
    expectations: { requiredTools: ['inspect_products'] },
  },
  {
    id: 'storefront-fr-availability',
    description: 'Checks current availability instead of relying on an earlier answer.',
    surface: 'storefront',
    locale: 'fr',
    input: {
      message: 'Quelles ponceuses sont réellement disponibles maintenant ?',
      context: 'catalog',
    },
    expectations: {
      requiredTools: ['search_catalog', 'present_products'],
      groundedEntityIds: [12, 18],
    },
  },
  {
    id: 'storefront-fr-checkout-help',
    description: 'Continues product advice during checkout with live cart context.',
    surface: 'storefront',
    locale: 'fr',
    input: {
      message: 'Avant de commander, propose une alternative moins chère pour cet article.',
      context: 'checkout',
    },
    expectations: {
      requiredTools: ['search_catalog', 'present_products'],
      groundedEntityIds: [12, 18],
    },
  },
  {
    id: 'storefront-ar-no-match',
    description: 'Responds clearly in Arabic when a narrow catalog query has no match.',
    surface: 'storefront',
    locale: 'ar',
    input: { message: 'أريد آلة صناعية نادرة بسعر أقل من 100 دج', context: 'catalog' },
    expectations: { requiredTools: ['search_catalog'], minimumAnswerCharacters: 30 },
  },
  {
    id: 'storefront-fr-landing-campaign-detail',
    description: 'Uses the active campaign product and content for a landing-page question.',
    surface: 'storefront',
    locale: 'fr',
    input: {
      message: 'Explique les caractéristiques et avantages présentés pour ce produit.',
      context: 'landing',
    },
    expectations: { requiredTools: ['inspect_products'], minimumAnswerCharacters: 40 },
  },
  {
    id: 'storefront-ar-order-tracking',
    description: 'Refreshes the linked order before answering a post-purchase tracking question.',
    surface: 'storefront',
    locale: 'ar',
    input: { message: 'أين وصل طلبي ومتى تم تحديث حالته؟', context: 'thank-you' },
    expectations: {
      requiredTools: ['inspect_order'],
      requiredTerms: ['قيد التوصيل'],
      minimumAnswerCharacters: 30,
    },
  },
  {
    id: 'storefront-fr-delivery-fee',
    description: 'Reads exact current home and stop-desk delivery fees for a commune.',
    surface: 'storefront',
    locale: 'fr',
    input: {
      message: 'Quels sont les frais de livraison à Bab Ezzouar, à domicile et au bureau ?',
      context: 'checkout',
    },
    expectations: {
      requiredTools: ['inspect_delivery_support'],
      requiredTerms: ['600', '450'],
      minimumAnswerCharacters: 30,
    },
  },
  {
    id: 'storefront-fr-promotion-check',
    description: 'Validates a promotion code against the current cart product.',
    surface: 'storefront',
    locale: 'fr',
    input: {
      message: 'Est-ce que le code SAVE10 fonctionne sur cette perceuse ?',
      context: 'cart',
    },
    expectations: {
      requiredTools: ['inspect_promotion'],
      requiredTerms: ['SAVE10', '1 500'],
      minimumAnswerCharacters: 30,
    },
  },
];
