import type { AiEvalScenario } from '@bric/ai-core/evals';

export type AdminAiEvalInput = {
  message: string;
  surface: string;
  locale?: 'fr' | 'ar';
};

export const ADMIN_AI_EVAL_SCENARIOS: AiEvalScenario<AdminAiEvalInput>[] = [
  {
    id: 'admin-orders-awaiting-confirmation',
    description: 'Uses the canonical order reader for an operational queue question.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Quels clients attendent encore une confirmation aujourd’hui ?',
      surface: 'orders',
    },
    expectations: { requiredTools: ['inspect_orders'], minimumAnswerCharacters: 40 },
  },
  {
    id: 'admin-order-status-update',
    description:
      'Inspects an exact order before executing one explicitly requested canonical status update.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Confirme la commande 91.',
      surface: 'orders',
    },
    expectations: {
      requiredTools: ['inspect_orders', 'update_order_status'],
      exactToolCounts: { update_order_status: 1 },
    },
  },
  {
    id: 'admin-inventory-low-stock',
    description: 'Routes low-stock diagnosis to live inventory data.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Montre-moi les références presque épuisées.', surface: 'inventory' },
    expectations: { requiredTools: ['inspect_inventory'] },
  },
  {
    id: 'admin-inventory-adjustment',
    description: 'Resolves an exact SKU before applying an explicitly requested inventory delta.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Ajoute 6 unités au stock de la référence PB-1.',
      surface: 'inventory',
    },
    expectations: {
      requiredTools: ['inspect_inventory', 'adjust_inventory'],
      exactToolCounts: { adjust_inventory: 1 },
    },
  },
  {
    id: 'admin-assets-performance',
    description: 'Inspects live asset inventory instead of guessing from product data.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Quelles images produits manquent ou sont trop lourdes ?',
      surface: 'assets',
    },
    expectations: { requiredTools: ['inspect_assets'] },
  },
  {
    id: 'admin-proposal-backlog',
    description: 'Reads the proposal inbox with its active filters.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Résume les propositions IA qui attendent une revue.',
      surface: 'ai_proposals',
    },
    expectations: { requiredTools: ['inspect_ai_proposals'] },
  },
  {
    id: 'admin-staff-access',
    description: 'Uses complete administration access records for a staff question.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Qui a accès aux commandes et à la gestion du catalogue ?',
      surface: 'administration',
    },
    expectations: { requiredTools: ['inspect_administration'] },
  },
  {
    id: 'admin-bulletin-follow-up',
    description: 'Reads the full Bulletin thread before summarizing open follow-ups.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Quels sujets du Bulletin demandent encore une réponse ?',
      surface: 'bulletin',
    },
    expectations: { requiredTools: ['inspect_bulletin'] },
  },
  {
    id: 'admin-analytics-acquisition',
    description: 'Routes acquisition analysis through the canonical analytics workspace.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Compare les canaux payants par commandes et revenu ce mois-ci.',
      surface: 'analytics',
    },
    expectations: { requiredTools: ['query_analytics'], forbiddenTools: ['inspect_orders'] },
  },
  {
    id: 'admin-categorize-entire-catalog',
    description: 'Starts exactly one resumable bulk categorization job.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Catégorise tout le catalogue actif.', surface: 'products' },
    expectations: {
      requiredTools: ['categorize_catalog'],
      exactToolCounts: { categorize_catalog: 1 },
      forbiddenTools: ['propose_product_edit'],
    },
  },
  {
    id: 'admin-fill-arabic-content',
    description: 'Uses one bulk content job for missing Arabic product content.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Complète tous les titres arabes manquants.', surface: 'products' },
    expectations: {
      requiredTools: ['generate_product_content'],
      exactToolCounts: { generate_product_content: 1 },
      forbiddenTools: ['propose_product_edit'],
    },
  },
  {
    id: 'admin-discount-proposal',
    description: 'Resolves the product and produces one reviewable discount proposal.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Propose 10 % de remise sur la perceuse Bosch 18 V.', surface: 'products' },
    expectations: { requiredTools: ['find_products', 'suggest_discount'] },
  },
  {
    id: 'admin-taxonomy-create',
    description: 'Checks taxonomy matches before proposing a new inactive brand.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Crée la marque Atelier Pro.', surface: 'brands_categories' },
    expectations: { requiredTools: ['find_brands', 'propose_brand_create'] },
  },
  {
    id: 'admin-background-work',
    description: 'Reads the server-owned queue for background progress.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Où en est mon dernier export produits ?', surface: 'products' },
    expectations: { requiredTools: ['list_background_jobs'] },
  },
  {
    id: 'admin-storefront-announcement',
    description:
      'Reads the current storefront configuration before applying an explicitly requested bilingual announcement.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Active l’annonce « Livraison offerte ce week-end » / « توصيل مجاني نهاية هذا الأسبوع ».',
      surface: 'administration/storefront',
    },
    expectations: {
      requiredTools: ['inspect_storefront_configuration', 'update_storefront_announcement'],
      exactToolCounts: { update_storefront_announcement: 1 },
    },
  },
];
