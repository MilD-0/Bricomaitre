import type { PermissionKey } from './permissions';

export type AdminAiGroundingTool =
  | 'find_products'
  | 'find_brands'
  | 'find_categories'
  | 'inspect_orders'
  | 'inspect_inventory'
  | 'inspect_assets'
  | 'inspect_ai_proposals'
  | 'inspect_administration'
  | 'inspect_storefront_configuration'
  | 'inspect_bulletin'
  | 'query_analytics'
  | 'list_background_jobs';

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

/**
 * Chooses the one canonical read tool that must ground the first model step.
 * Mutating tools are intentionally excluded: the model may call them only after
 * it has resolved current application state and the operator's target.
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
