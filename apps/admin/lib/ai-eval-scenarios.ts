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
    id: 'admin-order-detail-correction',
    description:
      'Inspects an exact order before correcting delivery and address data through the canonical order workflow.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Corrige la commande 91 : livraison à domicile à Bab Ezzouar, wilaya 16, adresse 12 rue des Outils.',
      surface: 'orders',
    },
    expectations: {
      requiredTools: ['inspect_orders', 'update_order_details'],
      exactToolCounts: { update_order_details: 1 },
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
    id: 'admin-asset-activation',
    description:
      'Inspects the exact featured group before activating it and placing it at the top of products.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Active le groupe vedette 7 et affiche-le en haut de la page produits.',
      surface: 'assets',
    },
    expectations: {
      requiredTools: ['inspect_assets', 'update_asset_state'],
      exactToolCounts: { update_asset_state: 1 },
    },
  },
  {
    id: 'admin-asset-featured-group-create',
    description:
      'Inspects current merchandising before directly creating one bilingual featured group with exact product IDs.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Crée un groupe vedette « Sélection atelier » / « اختيار الورشة » avec les produits 12 et 18, inactif pour le moment.',
      surface: 'assets',
    },
    expectations: {
      requiredTools: ['inspect_assets', 'manage_assets'],
      exactToolCounts: { manage_assets: 1 },
      forbiddenTools: ['suggest_featured_products'],
    },
  },
  {
    id: 'admin-landing-page-create',
    description:
      'Resolves the exact product before directly generating and persisting one validated landing-page draft.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Crée une landing page française pour le produit 12, pensée pour les artisans mobiles. Garde-la en brouillon.',
      surface: 'assets/landingPages',
    },
    expectations: {
      requiredTools: ['find_products', 'create_landing_page'],
      exactToolCounts: { create_landing_page: 1 },
      forbiddenTools: ['suggest_landing_page'],
    },
  },
  {
    id: 'admin-landing-page-edit',
    description:
      'Reads the complete current landing-page revision before a staged, revision-safe content edit.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message:
        'Réécris uniquement le hero de la landing page 41 pour les artisans mobiles et préserve le reste.',
      surface: 'assets/landingPages',
    },
    expectations: {
      requiredTools: ['inspect_landing_pages', 'edit_landing_page'],
      exactToolCounts: { edit_landing_page: 1 },
      forbiddenTools: ['suggest_landing_page'],
    },
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
    id: 'admin-proposal-approval',
    description:
      'Inspects an exact pending proposal before applying the operator’s explicit approval.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Vérifie puis approuve la proposition 44.',
      surface: 'ai_proposals',
    },
    expectations: {
      requiredTools: ['inspect_ai_proposals', 'review_ai_proposals'],
      exactToolCounts: { review_ai_proposals: 1 },
    },
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
    id: 'admin-staff-access-assignment',
    description: 'Reads live roles and grants before assigning one exact staff account.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Donne le rôle employé à operator@example.com.',
      surface: 'administration',
    },
    expectations: {
      requiredTools: ['inspect_administration', 'set_access_grant'],
      exactToolCounts: { set_access_grant: 1 },
    },
  },
  {
    id: 'admin-custom-role-create',
    description:
      'Reads live roles and the permission catalog before creating one complete custom role.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Crée le rôle Support avec accès aux commandes et aux opérations.',
      surface: 'administration',
    },
    expectations: {
      requiredTools: ['inspect_administration', 'set_role_definition'],
      exactToolCounts: { set_role_definition: 1 },
    },
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
    id: 'admin-bulletin-reply',
    description: 'Reads the exact shared thread before posting an explicitly requested reply.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Réponds au sujet 7 que je terminerai les vérifications cet après-midi.',
      surface: 'bulletin',
    },
    expectations: {
      requiredTools: ['inspect_bulletin', 'reply_bulletin_post'],
      exactToolCounts: { reply_bulletin_post: 1 },
    },
  },
  {
    id: 'admin-bulletin-pin',
    description: 'Inspects the exact Bulletin post before explicitly pinning it.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Épingle le sujet 7.', surface: 'bulletin' },
    expectations: {
      requiredTools: ['inspect_bulletin', 'update_bulletin_post'],
      exactToolCounts: { update_bulletin_post: 1 },
    },
  },
  {
    id: 'admin-bulletin-reply-delete',
    description: 'Inspects the complete thread before deleting one exact permitted reply.',
    surface: 'admin',
    locale: 'fr',
    input: { message: 'Supprime la réponse 9 du sujet 7.', surface: 'bulletin' },
    expectations: {
      requiredTools: ['inspect_bulletin', 'delete_bulletin_content'],
      exactToolCounts: { delete_bulletin_content: 1 },
    },
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
    id: 'admin-product-commercial-update',
    description:
      'Reads the complete current product before directly changing exact selling and purchase prices.',
    surface: 'admin',
    locale: 'fr',
    input: {
      message: 'Change le prix du produit 12 à 14 900 DZD et son coût d’achat à 9 000 DZD.',
      surface: 'products',
    },
    expectations: {
      requiredTools: ['inspect_products', 'update_products'],
      exactToolCounts: { update_products: 1 },
      forbiddenTools: ['propose_product_edit', 'suggest_discount'],
    },
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
