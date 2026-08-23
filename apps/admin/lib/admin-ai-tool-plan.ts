import type { PermissionKey } from './permissions';

export type AdminAiGroundingTool =
  | 'find_products'
  | 'inspect_products'
  | 'find_brands'
  | 'find_categories'
  | 'inspect_orders'
  | 'inspect_inventory'
  | 'inspect_assets'
  | 'inspect_landing_pages'
  | 'inspect_ai_proposals'
  | 'inspect_administration'
  | 'inspect_storefront_configuration'
  | 'inspect_bulletin'
  | 'query_analytics'
  | 'list_background_jobs';

export type AdminAiMutationTool =
  | 'update_order_status'
  | 'update_order_details'
  | 'adjust_inventory'
  | 'update_asset_state'
  | 'reorder_assets'
  | 'manage_assets'
  | 'create_landing_page'
  | 'edit_landing_page'
  | 'review_ai_proposals'
  | 'set_access_grant'
  | 'set_role_definition'
  | 'update_storefront_settings'
  | 'update_storefront_announcement'
  | 'create_bulletin_post'
  | 'reply_bulletin_post'
  | 'update_bulletin_post'
  | 'delete_bulletin_content'
  | 'categorize_catalog'
  | 'generate_product_content'
  | 'create_product'
  | 'update_products'
  | 'archive_products'
  | 'manage_taxonomy'
  | 'suggest_discount'
  | 'propose_brand_create'
  | 'propose_category_create';

export type AdminAiStepPlan =
  | { kind: 'force_tool'; toolName: AdminAiGroundingTool | AdminAiMutationTool }
  | { kind: 'analytics_only' }
  | { kind: 'answer_only' }
  | null;

export const ADMIN_AI_LONG_OPERATION_TIMEOUT_MS = 120_000;

export function adminAiRequestTimeoutMs(
  configuredTimeoutMs: number,
  mutationTool: AdminAiMutationTool | null,
) {
  return mutationTool === 'create_landing_page' || mutationTool === 'edit_landing_page'
    ? Math.max(configuredTimeoutMs, ADMIN_AI_LONG_OPERATION_TIMEOUT_MS)
    : configuredTimeoutMs;
}

/**
 * Converts the route's deterministic read/write plan into one model-loop step.
 * Once Analytics is selected, unrelated tools are removed from the loop. Up
 * to three distinct canonical views remain possible for an explicitly
 * cross-workspace question, while the prompt asks the model to answer after
 * one sufficient view instead of browsing alternatives.
 */
export function adminAiStepPlan(input: {
  stepNumber: number;
  groundingTool: AdminAiGroundingTool | null;
  mutationTool: AdminAiMutationTool | null;
  analyticsQueryCount?: number;
  analyticsQueryLimit?: 1 | 2 | 3;
}): AdminAiStepPlan {
  if (input.stepNumber === 0 && input.groundingTool) {
    return { kind: 'force_tool', toolName: input.groundingTool };
  }
  if (input.groundingTool === 'query_analytics') {
    return (input.analyticsQueryCount ?? 0) >= (input.analyticsQueryLimit ?? 3)
      ? { kind: 'answer_only' }
      : { kind: 'analytics_only' };
  }
  if (input.mutationTool && input.stepNumber === (input.groundingTool ? 1 : 0)) {
    return { kind: 'force_tool', toolName: input.mutationTool };
  }
  return null;
}

function containsAny(value: string, terms: readonly string[]) {
  return terms.some((term) => value.includes(term));
}

function asksForSurfaceHelp(value: string) {
  return containsAny(value, [
    'what can you do',
    'help me',
    'capabilities',
    'que peux-tu',
    'que pouvez-vous',
    'aide-moi',
    'fonctionnalités',
    'ماذا يمكنك',
    'ساعدني',
  ]);
}

function hasAnyPermission(
  permissions: readonly PermissionKey[],
  required: readonly PermissionKey[],
) {
  return required.some((permission) => permissions.includes(permission));
}

function referencesLandingPages(message: string, section: string) {
  return (
    section === 'landingpages' ||
    containsAny(message, [
      'landing page',
      'landing-page',
      'page d’atterrissage',
      "page d'atterrissage",
      'page de destination',
      'صفحة هبوط',
    ])
  );
}

function requestsDirectProductUpdate(message: string) {
  return (
    containsAny(message, [
      'modifie',
      'mets à jour',
      'change ',
      'corrige',
      'active ',
      'désactive',
      'desactive',
      'marque comme',
      'update ',
      'set ',
      'edit ',
      'deactivate',
      'غيّر',
      'عدّل',
      'فعّل',
    ]) &&
    containsAny(message, [
      'produit',
      'product',
      'prix',
      'price',
      'coût',
      'cout',
      'cost',
      'titre',
      'title',
      'description',
      'sku',
      'barcode',
      'code-barres',
      'marque',
      'brand',
      'catégorie',
      'categorie',
      'category',
      'image',
      'promo',
      'rupture',
      'stock',
      'منتج',
      'سعر',
    ])
  );
}

function requestsProductCreation(message: string) {
  return (
    containsAny(message, [
      'crée un produit',
      'cree un produit',
      'ajoute un produit',
      'nouveau produit',
      'create a product',
      'create product',
      'add a product',
      'new product',
      'أنشئ منتج',
      'أضف منتج',
    ]) && !containsAny(message, ['landing page', 'page de destination', 'صفحة هبوط'])
  );
}

function requestsProductArchive(message: string) {
  return (
    containsAny(message, [
      'archive',
      'supprime',
      'retire du catalogue',
      'delete',
      'remove from catalog',
      'احذف',
      'أرشف',
    ]) && containsAny(message, ['produit', 'product', 'catalogue', 'catalog', 'منتج'])
  );
}

/**
 * Chooses the one canonical read tool that must ground the first model step.
 * Mutating tools are planned separately so inspection always occurs first when
 * a canonical reader exists for the current surface.
 */
export function adminAiGroundingTool(input: {
  message: string;
  surface?: string | null;
  section?: string | null;
  permissions: readonly PermissionKey[];
}): AdminAiGroundingTool | null {
  const message = input.message.toLocaleLowerCase().normalize('NFKC');
  const surface = (input.surface ?? '').replace(/[-_]/g, '').toLocaleLowerCase();
  const section = (input.section ?? '').replace(/[-_]/g, '').toLocaleLowerCase();
  const permissions = input.permissions;

  if (asksForSurfaceHelp(message)) return null;

  if (
    containsAny(message, [
      'background job',
      'job ',
      'queue',
      'export',
      'import',
      'synchronisation',
      'synchronization',
      'tâche',
      'file d’attente',
      "file d'attente",
      'مهمة',
      'تصدير',
    ]) &&
    hasAnyPermission(permissions, [
      'products_write',
      'orders_write',
      'analytics_manage',
      'ops_view',
    ])
  ) {
    return 'list_background_jobs';
  }

  if (surface === 'analytics' || surface === 'stats') {
    return permissions.includes('analytics_manage') ? 'query_analytics' : null;
  }
  if (surface === 'orders') {
    return permissions.includes('orders_write') ? 'inspect_orders' : null;
  }
  if (surface === 'inventory') {
    return permissions.includes('products_write') ? 'inspect_inventory' : null;
  }
  if (surface === 'assets') {
    if (referencesLandingPages(message, section) && permissions.includes('assets_write')) {
      if (
        containsAny(message, ['crée', 'cree', 'create', 'génère', 'genere', 'generate', 'أنشئ'])
      ) {
        return 'find_products';
      }
      return 'inspect_landing_pages';
    }
    return permissions.includes('assets_write') ? 'inspect_assets' : null;
  }
  if (surface === 'aiproposals') {
    return hasAnyPermission(permissions, [
      'products_write',
      'assets_write',
      'brands_categories_write',
    ])
      ? 'inspect_ai_proposals'
      : null;
  }
  if (surface === 'bulletin') return 'inspect_bulletin';
  if (surface === 'administration') {
    const storefrontQuestion =
      section === 'storefront' ||
      containsAny(message, [
        'storefront',
        'boutique',
        'announcement',
        'annonce',
        'contact',
        'assistant model',
        'modèle ia',
        'واجهة المتجر',
        'إعلان',
      ]);
    if (storefrontQuestion && permissions.includes('settings_manage')) {
      return 'inspect_storefront_configuration';
    }
    return permissions.includes('settings_manage') ? 'inspect_administration' : null;
  }
  if (surface === 'brandscategories') {
    if (!permissions.includes('brands_categories_write')) return null;
    return containsAny(message, ['category', 'catégorie', 'categorie', 'تصنيف', 'فئة'])
      ? 'find_categories'
      : 'find_brands';
  }
  if (surface === 'products') {
    if (
      (requestsProductCreation(message) ||
        requestsProductArchive(message) ||
        requestsDirectProductUpdate(message)) &&
      permissions.includes('products_write')
    ) {
      return 'inspect_products';
    }
    if (
      containsAny(message, [
        'discount',
        'remise',
        'price',
        'prix',
        'product',
        'produit',
        'sku',
        'barcode',
        'référence',
        'منتج',
      ]) &&
      hasAnyPermission(permissions, [
        'products_write',
        'orders_write',
        'assets_write',
        'brands_categories_write',
      ])
    ) {
      return 'find_products';
    }
  }

  return null;
}

/**
 * Forces the one mutation explicitly requested by the operator after the
 * grounding step. This keeps ordinary application commands reliable without
 * letting an informational question drift into a write.
 */
export function adminAiMutationTool(input: {
  message: string;
  surface?: string | null;
  section?: string | null;
  permissions: readonly PermissionKey[];
}): AdminAiMutationTool | null {
  const message = input.message.toLocaleLowerCase().normalize('NFKC');
  const surface = (input.surface ?? '').replace(/[-_]/g, '').toLocaleLowerCase();
  const section = (input.section ?? '').replace(/[-_]/g, '').toLocaleLowerCase();
  const permissions = input.permissions;

  if (asksForSurfaceHelp(message)) return null;

  if (surface === 'orders' && permissions.includes('orders_write')) {
    const changesDetails =
      containsAny(message, [
        'corrige',
        'modifie',
        'change',
        'mets à jour',
        'update',
        'correct',
        'غيّر',
        'صحح',
      ]) &&
      containsAny(message, [
        'adresse',
        'address',
        'téléphone',
        'telephone',
        'phone',
        'livraison à domicile',
        'stop desk',
        'bureau',
        'wilaya',
        'commune',
        'note',
        'produit',
        'article',
        'العنوان',
        'الهاتف',
        'الولاية',
        'البلدية',
      ]);
    if (changesDetails) return 'update_order_details';
    if (
      containsAny(message, [
        'confirme',
        'annule',
        'expédie',
        'expedie',
        'termine',
        'retourne',
        'marque',
        'set ',
        'confirm ',
        'cancel ',
        'dispatch ',
        'أكّد',
        'الغِ',
      ])
    ) {
      return 'update_order_status';
    }
  }

  if (
    surface === 'inventory' &&
    permissions.includes('products_write') &&
    containsAny(message, [
      'ajoute',
      'augmente',
      'diminue',
      'retire',
      'déduis',
      'deduis',
      'adjust',
      'increase',
      'decrease',
      'أضف',
      'زد',
      'أنقص',
    ])
  ) {
    return 'adjust_inventory';
  }

  if (surface === 'assets' && permissions.includes('assets_write')) {
    if (referencesLandingPages(message, section)) {
      if (
        containsAny(message, ['crée', 'cree', 'create', 'génère', 'genere', 'generate', 'أنشئ'])
      ) {
        return 'create_landing_page';
      }
      if (
        containsAny(message, [
          'modifie',
          'édite',
          'edite',
          'réécris',
          'reecris',
          'ajoute',
          'supprime',
          'déplace',
          'deplace',
          'publie',
          'active',
          'désactive',
          'desactive',
          'edit',
          'rewrite',
          'add ',
          'remove',
          'publish',
          'unpublish',
          'عدّل',
          'انشر',
        ])
      ) {
        return 'edit_landing_page';
      }
    }
    if (
      containsAny(message, [
        'crée',
        'cree',
        'ajoute',
        'modifie',
        'édite',
        'edite',
        'remplace',
        'supprime',
        'create',
        'add ',
        'edit',
        'replace',
        'delete',
        'أنشئ',
        'عدّل',
        'احذف',
      ]) &&
      containsAny(message, [
        'bannière',
        'banniere',
        'banner',
        'groupe vedette',
        'featured group',
        'carte produit',
        'product card',
        'لافتة',
      ])
    ) {
      return 'manage_assets';
    }
    if (containsAny(message, ['réordonne', 'reordonne', 'ordre ', 'reorder', 'رتب'])) {
      return 'reorder_assets';
    }
    if (
      containsAny(message, [
        'active',
        'désactive',
        'desactive',
        'affiche',
        'masque',
        'place',
        'activate',
        'deactivate',
        'show ',
        'hide ',
        'فعّل',
        'اعرض',
        'اخف',
      ])
    ) {
      return 'update_asset_state';
    }
  }

  if (
    surface === 'aiproposals' &&
    hasAnyPermission(permissions, ['products_write', 'assets_write', 'brands_categories_write']) &&
    containsAny(message, ['approuve', 'rejette', 'refuse', 'approve', 'reject', 'وافق', 'ارفض'])
  ) {
    return 'review_ai_proposals';
  }

  if (surface === 'administration' && permissions.includes('settings_manage')) {
    if (
      (section === 'storefront' || containsAny(message, ['storefront', 'boutique'])) &&
      containsAny(message, ['annonce', 'announcement', 'إعلان']) &&
      containsAny(message, ['active', 'désactive', 'modifie', 'change', 'update', 'فعّل', 'غيّر'])
    ) {
      return 'update_storefront_announcement';
    }
    if (
      (section === 'storefront' || containsAny(message, ['storefront', 'boutique'])) &&
      containsAny(message, ['contact', 'email', 'téléphone', 'telephone', 'modèle', 'model']) &&
      containsAny(message, ['modifie', 'change', 'mets à jour', 'update', 'set ', 'غيّر'])
    ) {
      return 'update_storefront_settings';
    }
    if (
      containsAny(message, [
        'crée le rôle',
        'crée un rôle',
        'cree le role',
        'cree un role',
        'modifie le rôle',
        'modifie ce rôle',
        'create role',
        'update role',
        'role definition',
        'أنشئ دور',
      ])
    ) {
      return 'set_role_definition';
    }
    if (containsAny(message, ['donne', 'attribue', 'assigne', 'rôle', 'role', 'grant', 'عيّن'])) {
      return 'set_access_grant';
    }
  }

  if (surface === 'bulletin') {
    if (
      containsAny(message, ['supprime', 'efface', 'delete', 'remove', 'احذف']) &&
      containsAny(message, ['sujet', 'post', 'publication', 'réponse', 'reponse', 'reply', 'رد'])
    ) {
      return 'delete_bulletin_content';
    }
    if (
      containsAny(message, [
        'modifie',
        'édite',
        'edite',
        'corrige',
        'épingle',
        'epingle',
        'désépingle',
        'desepingle',
        'change les tags',
        'edit',
        'update',
        'pin ',
        'unpin',
        'عدّل',
        'ثبّت',
      ])
    ) {
      return 'update_bulletin_post';
    }
    if (containsAny(message, ['réponds', 'reponds', 'reply', 'أجب', 'ردّ'])) {
      return 'reply_bulletin_post';
    }
    if (containsAny(message, ['publie', 'crée un sujet', 'cree un sujet', 'post ', 'انشر'])) {
      return 'create_bulletin_post';
    }
  }

  if (surface === 'products' && permissions.includes('products_write')) {
    if (requestsProductCreation(message)) return 'create_product';
    if (requestsProductArchive(message)) return 'archive_products';
    if (requestsDirectProductUpdate(message)) return 'update_products';
    if (containsAny(message, ['catégoris', 'categoris', 'classifie', 'صنّف'])) {
      return 'categorize_catalog';
    }
    if (
      containsAny(message, ['complète', 'complete', 'génère', 'genere', 'fill ', 'generate']) &&
      containsAny(message, ['titre', 'title', 'description', 'arab', 'عرب'])
    ) {
      return 'generate_product_content';
    }
    if (
      containsAny(message, ['propose', 'applique', 'crée', 'create']) &&
      containsAny(message, ['remise', 'discount', 'promotion', '%'])
    ) {
      return 'suggest_discount';
    }
  }

  if (surface === 'brandscategories' && permissions.includes('brands_categories_write')) {
    const changesTaxonomy = containsAny(message, [
      'crée',
      'cree',
      'create',
      'ajoute',
      'modifie',
      'renomme',
      'active',
      'désactive',
      'desactive',
      'déplace',
      'deplace',
      'supprime',
      'edit',
      'rename',
      'deactivate',
      'move',
      'delete',
      'أنشئ',
      'عدّل',
      'فعّل',
      'احذف',
    ]);
    if (
      changesTaxonomy &&
      containsAny(message, [
        'catégorie',
        'categorie',
        'category',
        'marque',
        'brand',
        'فئة',
        'علامة',
      ])
    ) {
      return 'manage_taxonomy';
    }
  }

  return null;
}
