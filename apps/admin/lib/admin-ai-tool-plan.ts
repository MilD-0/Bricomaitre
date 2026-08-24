import type { PermissionKey } from './permissions';
import { asksAdminAiAnalyticsQuestion } from './admin-ai-analytics-plan';

export type AdminAiGroundingTool =
  | 'find_products'
  | 'inspect_products'
  | 'inspect_archived_products'
  | 'find_brands'
  | 'find_categories'
  | 'inspect_orders'
  | 'preview_order_export'
  | 'inspect_order_shopping_list'
  | 'preview_ecotrack_posting'
  | 'load_ecotrack_requirements'
  | 'inspect_ecotrack_shipments'
  | 'inspect_action_history'
  | 'inspect_inventory'
  | 'scan_inventory'
  | 'inspect_assets'
  | 'inspect_landing_pages'
  | 'inspect_ai_proposals'
  | 'inspect_administration'
  | 'inspect_storefront_configuration'
  | 'inspect_bulletin'
  | 'query_analytics'
  | 'list_background_jobs';

export type AdminAiMutationTool =
  | 'create_order'
  | 'delete_orders'
  | 'start_order_export'
  | 'get_order_tracking_links'
  | 'save_order_shopping_list'
  | 'apply_order_shopping_list_inventory'
  | 'update_order_status'
  | 'update_order_details'
  | 'post_orders_to_ecotrack'
  | 'manage_ecotrack_shipments'
  | 'change_ecotrack_shipments'
  | 'recover_action_history'
  | 'adjust_inventory'
  | 'receive_inventory'
  | 'update_inventory_state'
  | 'update_asset_state'
  | 'reorder_assets'
  | 'manage_assets'
  | 'create_landing_page'
  | 'edit_landing_page'
  | 'review_ai_proposals'
  | 'delete_expired_ai_proposals'
  | 'set_access_grant'
  | 'revoke_access_grants'
  | 'set_role_definition'
  | 'update_storefront_settings'
  | 'update_storefront_announcement'
  | 'create_bulletin_post'
  | 'reply_bulletin_post'
  | 'set_bulletin_reaction'
  | 'update_bulletin_post'
  | 'delete_bulletin_content'
  | 'categorize_catalog'
  | 'generate_product_content'
  | 'create_product'
  | 'update_products'
  | 'archive_products'
  | 'restore_products'
  | 'manage_taxonomy'
  | 'update_analytics_settings'
  | 'manage_analytics_costs'
  | 'manage_analytics_day_overrides'
  | 'sync_analytics_source'
  | 'start_background_job'
  | 'stop_background_job'
  | 'suggest_discount'
  | 'propose_brand_create'
  | 'propose_category_create';

export type AdminAiStepPlan =
  | { kind: 'force_tool'; toolName: AdminAiGroundingTool | AdminAiMutationTool }
  | { kind: 'analytics_only' }
  | { kind: 'answer_only' }
  | null;

export const ADMIN_AI_LONG_OPERATION_TIMEOUT_MS = 120_000;
export const ADMIN_AI_LANDING_PAGE_OPERATION_TIMEOUT_MS = 10 * 60_000;

export function adminAiRequestTimeoutMs(
  configuredTimeoutMs: number,
  mutationTool: AdminAiMutationTool | null,
  groundingTool: AdminAiGroundingTool | null = null,
) {
  if (mutationTool === 'create_landing_page' || mutationTool === 'edit_landing_page') {
    return Math.max(configuredTimeoutMs, ADMIN_AI_LANDING_PAGE_OPERATION_TIMEOUT_MS);
  }
  return mutationTool === 'sync_analytics_source' ||
    mutationTool === 'manage_ecotrack_shipments' ||
    mutationTool === 'change_ecotrack_shipments' ||
    groundingTool === 'preview_ecotrack_posting' ||
    groundingTool === 'inspect_ecotrack_shipments'
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
    if (input.mutationTool) {
      return input.stepNumber === 1
        ? { kind: 'force_tool', toolName: input.mutationTool }
        : { kind: 'answer_only' };
    }
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

function requestsLandingPageCreation(message: string) {
  return containsAny(message, [
    'crée',
    'cree',
    'génère',
    'genere',
    'conçois une',
    'concois une',
    'compose une',
    'fais une',
    'create',
    'generate',
    'build a',
    'design a',
    'compose a',
    'make a',
    'draft a',
    'أنشئ',
    'صمّم',
    'صمم',
  ]);
}

function requestsLandingPageEdit(message: string) {
  return containsAny(message, [
    'modifie',
    'édite',
    'edite',
    'réécris',
    'reecris',
    'améliore',
    'ameliore',
    'retravaille',
    'corrige',
    'change ',
    'ajoute',
    'supprime',
    'déplace',
    'deplace',
    'réordonne',
    'reordonne',
    'publie ',
    'active la',
    'active le',
    'désactive',
    'desactive',
    'edit',
    'rewrite',
    'improve',
    'rework',
    'fix ',
    'change ',
    'add ',
    'remove',
    'move ',
    'reorder',
    'publish',
    'unpublish',
    'activate ',
    'deactivate',
    'عدّل',
    'حسّن',
    'أضف',
    'احذف',
    'انقل',
    'انشر',
  ]);
}

function requestsEcotrackPosting(message: string) {
  const postingAction = containsAny(message, [
    'post ',
    'poste ',
    'postez ',
    'publie ',
    'envoie ',
    'envoyer ',
    'send ',
    'retry ',
    'réessaie',
    'reessaie',
    'renvoie ',
    'أرسل',
    'اعد الإرسال',
    'أعد الإرسال',
  ]);
  const postingTarget = containsAny(message, [
    'ecotrack',
    'eco track',
    'delivro',
    'emir',
    'expédition',
    'expedition',
    'shipment',
    'إيكوتراك',
    'الشحن',
  ]);
  return postingAction && postingTarget;
}

function requestsEcotrackFailureRepair(message: string) {
  return (
    containsAny(message, ['ecotrack', 'delivro', 'emir', 'expédition', 'shipment', 'إيكوتراك']) &&
    containsAny(message, [
      'corrige',
      'répare',
      'repare',
      'fix ',
      'erreur',
      'error',
      'rejet',
      'reject',
      'invalide',
      'invalid',
      'champ manquant',
      'missing field',
      'أصلح',
      'خطأ',
      'مرفوض',
    ])
  );
}

function mentionsEcotrackShipment(message: string) {
  return containsAny(message, [
    'shipment',
    'tracking',
    'numéro de suivi',
    'numero de suivi',
    'expédition ecotrack',
    'expedition ecotrack',
    'en_livraison',
    'prete_a_expedier',
    'mise à jour ecotrack',
    'maj ecotrack',
    'colis ecotrack',
    'شحنة',
    'رقم التتبع',
    'تتبع',
  ]);
}

function referencesEcotrackShipments(message: string, section: string) {
  return section === 'ecotrack' || mentionsEcotrackShipment(message);
}

function requestsEcotrackShipmentAction(message: string, section: string) {
  return (
    referencesEcotrackShipments(message, section) &&
    containsAny(message, [
      'rafraîch',
      'rafraich',
      'refresh',
      'actualise',
      'dispatch',
      'expédie',
      'expedie',
      'en ramassage',
      'ramassage',
      'ajoute une mise à jour',
      'ajoute une maj',
      'add update',
      'demande le retour',
      'request return',
      'imprime',
      'print',
      'étiquette',
      'etiquette',
      'label',
      'supprime',
      'delete',
      'احذف',
      'حدّث',
      'أرسل',
      'اطلب الإرجاع',
      'ملصق',
    ])
  );
}

function requestsEcotrackShipmentChange(message: string, section: string) {
  return (
    referencesEcotrackShipments(message, section) &&
    containsAny(message, [
      'corrige',
      'modifie',
      'change',
      'édite',
      'edite',
      'recrée',
      'recree',
      'recreate',
      'update ',
      'correct',
      'عدّل',
      'صحح',
    ]) &&
    containsAny(message, [
      'nom',
      'téléphone',
      'telephone',
      'phone',
      'livraison',
      'wilaya',
      'commune',
      'adresse',
      'address',
      'note',
      'produit',
      'montant',
      'frais',
      'subtotal',
      'sous-total',
      'الاسم',
      'الهاتف',
      'الولاية',
      'البلدية',
      'العنوان',
    ])
  );
}

function referencesActionHistory(message: string, surface: string, section: string) {
  return (
    (surface === 'administration' && section === 'history') ||
    containsAny(message, [
      'historique des actions',
      'historique d’action',
      "historique d'action",
      'action history',
      'journal d’audit',
      "journal d'audit",
      'audit log',
      'dernière modification',
      'derniere modification',
      'last change',
      'undo ',
      'redo ',
      'annule l’action',
      "annule l'action",
      'annule la modification',
      'rétablis l’action',
      "retablis l'action",
      'سجل الإجراءات',
      'تراجع عن التعديل',
      'أعد الإجراء',
    ])
  );
}

function requestsActionHistoryRecovery(message: string, surface: string, section: string) {
  return (
    referencesActionHistory(message, surface, section) &&
    containsAny(message, [
      'undo ',
      'redo ',
      'annule l’action',
      "annule l'action",
      'annule la modification',
      'annule cette action',
      'rétablis',
      'retablis',
      'refais cette action',
      'reapply',
      'تراجع',
      'أعد الإجراء',
    ])
  );
}

function ecotrackProviderChoice(message: string) {
  const compact = message
    .trim()
    .replace(/[.!؟]+$/u, '')
    .trim();
  const directChoice = /^(?:(?:use|via|with|avec|utilise|choisis)\s+)?(delivro|emir)$/iu.exec(
    compact,
  );
  if (directChoice?.[1]) return directChoice[1].toLocaleLowerCase() as 'delivro' | 'emir';
  const namedProvider = compact.includes('delivro')
    ? ('delivro' as const)
    : compact.includes('emir')
      ? ('emir' as const)
      : null;
  if (
    namedProvider &&
    containsAny(compact, ['use ', 'via ', 'with ', 'avec ', 'utilise', 'choisis', 'اختر', 'استخدم'])
  ) {
    return namedProvider;
  }
  if (!requestsEcotrackPosting(message)) return null;
  return namedProvider;
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

function requestsProductRestore(message: string) {
  return containsAny(message, [
    'restore product',
    'restore the product',
    'restore archived',
    'unarchive',
    'restaure le produit',
    'restaure ce produit',
    'rétablis le produit',
    'retablis le produit',
    'remets le produit au catalogue',
    'استعد المنتج',
    'أعد المنتج',
  ]);
}

function requestsOrderCreation(message: string) {
  return containsAny(message, [
    'crée une commande',
    'cree une commande',
    'nouvelle commande pour',
    'ajoute une commande',
    'create an order',
    'create order',
    'new order for',
    'add an order',
    'أنشئ طلب',
    'أضف طلب',
  ]);
}

function requestsOrderDeletion(message: string) {
  return (
    containsAny(message, [
      'supprime la commande',
      'supprime les commandes',
      'efface la commande',
      'delete order',
      'delete the order',
      'remove order',
      'احذف الطلب',
    ]) && !mentionsEcotrackShipment(message)
  );
}

function requestsInventoryScan(message: string) {
  return (
    containsAny(message, ['scan', 'scanne', 'scanner', 'امسح']) &&
    containsAny(message, [
      'commande',
      'order',
      'code-barres',
      'code barre',
      'barcode',
      'inventaire',
      'inventory',
      'stock',
      'طلب',
      'مخزون',
    ])
  );
}

function requestsInventoryReceipt(message: string) {
  return (
    requestsInventoryScan(message) &&
    containsAny(message, [
      'ajoute',
      'remets',
      'rentre',
      'réintègre',
      'reintegre',
      'receive',
      'add ',
      'put back',
      'restock',
      'أضف',
      'أعد',
    ])
  );
}

function requestsInventoryStateChange(message: string) {
  const action = containsAny(message, [
    'ajoute',
    'modifie',
    'change',
    'remplace',
    'supprime',
    'efface',
    'retire',
    'marque',
    'set ',
    'update',
    'change',
    'clear',
    'remove',
    'أضف',
    'غيّر',
    'احذف',
  ]);
  const field = containsAny(message, [
    'code-barres',
    'code barre',
    'barcode',
    'en stock',
    'hors stock',
    'vendable',
    'disponible',
    'in stock',
    'out of stock',
    'sellable',
    'مخزون',
    'متاح',
  ]);
  return action && field && !requestsInventoryScan(message);
}

function referencesOrderShoppingList(message: string) {
  return containsAny(message, [
    "liste d'achat",
    'liste d’achat',
    'liste des achats',
    'shopping list',
    'purchase list',
    'قائمة المشتريات',
  ]);
}

function requestsOrderShoppingListSave(message: string) {
  return (
    referencesOrderShoppingList(message) &&
    containsAny(message, [
      'crée',
      'cree',
      'prépare',
      'prepare',
      'génère',
      'genere',
      'actualise',
      'rafraîch',
      'rafraich',
      'enregistre',
      'create',
      'build',
      'generate',
      'refresh',
      'save',
      'أنشئ',
      'حضّر',
      'حدّث',
    ])
  );
}

function requestsOrderShoppingListInventoryApply(message: string) {
  return (
    referencesOrderShoppingList(message) &&
    containsAny(message, [
      'applique',
      'déduis',
      'deduis',
      'retire du stock',
      'mets à jour le stock',
      'apply',
      'deduct',
      'remove from stock',
      'update inventory',
      'طبّق',
      'اخصم',
    ])
  );
}

function referencesOrderExport(message: string) {
  return containsAny(message, ['export', 'excel', 'xlsx', 'تصدير']);
}

function requestsOrderExportStart(message: string) {
  if (!referencesOrderExport(message)) return false;
  if (
    containsAny(message, [
      'dernier export',
      'latest export',
      'statut de l’export',
      "statut de l'export",
      'export status',
      'où en est',
      'ou en est',
      'progression',
    ])
  ) {
    return false;
  }
  return containsAny(message, [
    'exporte',
    'exporter',
    'export ',
    'lance',
    'démarre',
    'demarre',
    'génère',
    'genere',
    'generate',
    'create',
    'start',
    'ابدأ',
    'صدّر',
  ]);
}

function requestsOrderTrackingLinks(message: string) {
  return (
    containsAny(message, [
      'lien de suivi',
      'lien suivi',
      'tracking link',
      'customer tracking',
      'رابط التتبع',
    ]) &&
    containsAny(message, [
      'donne',
      'génère',
      'genere',
      'crée',
      'cree',
      'copie',
      'envoie',
      'give',
      'generate',
      'create',
      'copy',
      'send',
      'أعط',
      'أنشئ',
      'انسخ',
    ])
  );
}

function requestsBackgroundJobStart(message: string) {
  return containsAny(message, [
    'exporte tous les produits',
    'exporte tout le catalogue',
    "lance l'export produits",
    'lance l’export produits',
    'start the product export',
    'export all products',
    'actualise le flux catalogue',
    'rafraîchis le flux catalogue',
    'rafraichis le flux catalogue',
    'refresh the catalog feed',
    'actualise le reporting',
    'rafraîchis le reporting',
    'rafraichis le reporting',
    'refresh reporting',
    'synchronise le catalogue ecotrack',
    'sync the ecotrack catalog',
    'synchronise les expéditions ecotrack',
    'synchronise les expeditions ecotrack',
    'sync ecotrack shipments',
    'صدّر كل المنتجات',
    'حدّث موجز الكتالوج',
    'حدّث التقارير',
    'زامن كتالوج ecotrack',
    'زامن شحنات ecotrack',
  ]);
}

function requestsBackgroundJobStop(message: string) {
  return (
    containsAny(message, ['arrête', 'arrete', 'annule', 'stop ', 'cancel ', 'أوقف', 'ألغ']) &&
    containsAny(message, [
      'tâche',
      'tache',
      'job',
      'export',
      'synchronisation',
      'synchronization',
      'مهمة',
      'تصدير',
      'مزامنة',
    ])
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

  if (asksAdminAiAnalyticsQuestion(message) && permissions.includes('analytics_manage')) {
    return 'query_analytics';
  }

  if (
    permissions.includes('settings_manage') &&
    referencesActionHistory(message, surface, section)
  ) {
    return 'inspect_action_history';
  }

  if (referencesLandingPages(message, section) && permissions.includes('assets_write')) {
    return requestsLandingPageCreation(message) ? 'find_products' : 'inspect_landing_pages';
  }

  if (permissions.includes('orders_write')) {
    if (surface === 'orders' && requestsOrderExportStart(message)) return 'preview_order_export';
    if (requestsEcotrackPosting(message)) return 'preview_ecotrack_posting';
    if (surface === 'orders' && ecotrackProviderChoice(message)) return null;
    if (requestsEcotrackFailureRepair(message) && !mentionsEcotrackShipment(message)) {
      return 'load_ecotrack_requirements';
    }
    if (surface === 'orders' && referencesEcotrackShipments(message, section)) {
      return 'inspect_ecotrack_shipments';
    }
    if (requestsEcotrackFailureRepair(message)) return 'load_ecotrack_requirements';
  }

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
    if (!permissions.includes('orders_write')) return null;
    if (referencesOrderShoppingList(message)) return 'inspect_order_shopping_list';
    // Every assistant-created order must be grounded in current catalog IDs.
    // This also covers natural product wording such as a concrete title or a
    // plural noun that does not literally contain "produit".
    if (requestsOrderCreation(message)) return 'find_products';
    return 'inspect_orders';
  }
  if (surface === 'inventory') {
    if (!permissions.includes('products_write')) return null;
    return requestsInventoryScan(message) ? 'scan_inventory' : 'inspect_inventory';
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
        'adresse',
        'address',
        'map ',
        'carte',
        'facebook',
        'assistant boutique',
        'storefront assistant',
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
    if (section === 'archive' && permissions.includes('products_write')) {
      return 'inspect_archived_products';
    }
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
  const analyticsSurface = surface === 'analytics' || surface === 'stats';

  if (asksForSurfaceHelp(message)) return null;

  if (
    hasAnyPermission(permissions, [
      'products_write',
      'orders_write',
      'analytics_manage',
      'ops_view',
    ])
  ) {
    if (requestsBackgroundJobStop(message)) return 'stop_background_job';
    if (requestsBackgroundJobStart(message)) return 'start_background_job';
  }

  if (
    permissions.includes('settings_manage') &&
    requestsActionHistoryRecovery(message, surface, section)
  ) {
    return 'recover_action_history';
  }

  if (referencesLandingPages(message, section) && permissions.includes('assets_write')) {
    if (requestsLandingPageCreation(message)) return 'create_landing_page';
    if (requestsLandingPageEdit(message)) return 'edit_landing_page';
  }

  if (permissions.includes('orders_write')) {
    if (surface === 'orders' && requestsOrderExportStart(message)) return 'start_order_export';
    if (surface === 'orders' && requestsOrderTrackingLinks(message)) {
      return 'get_order_tracking_links';
    }
    const provider = ecotrackProviderChoice(message);
    if (provider) return 'post_orders_to_ecotrack';
    if (requestsEcotrackPosting(message)) return null;
    if (
      surface === 'orders' &&
      requestsEcotrackShipmentChange(message, section) &&
      (!requestsEcotrackFailureRepair(message) || mentionsEcotrackShipment(message))
    ) {
      return 'change_ecotrack_shipments';
    }
    if (surface === 'orders' && requestsEcotrackShipmentAction(message, section)) {
      return 'manage_ecotrack_shipments';
    }
  }

  const explicitlyChanges = containsAny(message, [
    'adopte',
    'utilise',
    'définis',
    'definis',
    'mets ',
    'change ',
    'modifie',
    'enregistre',
    'lance ',
    'ajoute',
    'crée',
    'cree',
    'supprime',
    'réinitialise',
    'reinitialise',
    'synchronise',
    'sync ',
    'set ',
    'update ',
    'create ',
    'delete ',
    'reset ',
    'استخدم',
    'غيّر',
    'أضف',
    'احذف',
    'زامن',
  ]);
  if (permissions.includes('analytics_manage') && explicitlyChanges) {
    const requestsSync = containsAny(message, [
      'synchronise',
      'synchronisation',
      'synchronization',
      'sync ',
      'زامن',
    ]);
    if (
      requestsSync &&
      (containsAny(message, ['meta', 'search console']) ||
        (analyticsSurface && (section === 'acquisition' || section === 'search')))
    ) {
      return 'sync_analytics_source';
    }
    if (
      containsAny(message, [
        'cout operationnel',
        'couts operationnels',
        'coût opérationnel',
        'coûts opérationnels',
        'cout mensuel',
        'coût mensuel',
        'operating cost',
        'monthly cost',
        'charge mensuelle',
        'تكلفة تشغيلية',
        'تكاليف تشغيلية',
      ]) ||
      (analyticsSurface &&
        section === 'assumptions' &&
        containsAny(message, ['coût', 'cout', 'cost', 'charge']))
    ) {
      return 'manage_analytics_costs';
    }
    if (
      containsAny(message, [
        'override quotidien',
        'daily override',
        'remplacement quotidien',
        'valeurs automatiques',
        'automatic values',
        'تجاوز يومي',
      ])
    ) {
      return 'manage_analytics_day_overrides';
    }
    if (
      containsAny(message, [
        'taux de retour',
        'return rate',
        'taux de change',
        'fx',
        'eur',
        'vendredi',
        'friday',
        'معدل الإرجاع',
        'سعر الصرف',
        'الجمعة',
      ])
    ) {
      return 'update_analytics_settings';
    }
  }

  if (surface === 'orders' && permissions.includes('orders_write')) {
    if (
      permissions.includes('products_write') &&
      requestsOrderShoppingListInventoryApply(message)
    ) {
      return 'apply_order_shopping_list_inventory';
    }
    if (requestsOrderShoppingListSave(message)) return 'save_order_shopping_list';
    if (requestsOrderCreation(message)) return 'create_order';
    if (requestsOrderDeletion(message)) return 'delete_orders';
    const changesDetails =
      containsAny(message, [
        'corrige',
        'modifie',
        'change',
        'remplace',
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

  if (surface === 'inventory' && permissions.includes('products_write')) {
    if (requestsInventoryReceipt(message)) return 'receive_inventory';
    if (requestsInventoryStateChange(message)) return 'update_inventory_state';
    if (
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
  }

  if (surface === 'assets' && permissions.includes('assets_write')) {
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
        'active la',
        'active le',
        'active les',
        'désactive',
        'desactive',
        'affiche ',
        'masque',
        'place ',
        'activate ',
        'deactivate ',
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
    containsAny(message, [
      'supprime les propositions expirées',
      'supprime les propositions expirees',
      'efface les propositions expirées',
      'delete expired proposals',
      'remove expired proposals',
      'احذف الاقتراحات منتهية الصلاحية',
    ])
  ) {
    return 'delete_expired_ai_proposals';
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
      containsAny(message, [
        'révoque l’accès',
        "révoque l'accès",
        'retire l’accès',
        "retire l'accès",
        'supprime l’accès',
        "supprime l'accès",
        'revoke access',
        'remove access',
        'delete access grant',
        'ألغ وصول',
        'اسحب صلاحية',
      ]) &&
      (message.includes('@') ||
        containsAny(message, [
          'accès de',
          "accès d'",
          'access for',
          'access grant',
          'وصول المستخدم',
        ]))
    ) {
      return 'revoke_access_grants';
    }
    if (
      (section === 'storefront' || containsAny(message, ['storefront', 'boutique'])) &&
      containsAny(message, ['annonce', 'announcement', 'إعلان']) &&
      containsAny(message, ['active', 'désactive', 'modifie', 'change', 'update', 'فعّل', 'غيّر'])
    ) {
      return 'update_storefront_announcement';
    }
    if (
      (section === 'storefront' || containsAny(message, ['storefront', 'boutique'])) &&
      containsAny(message, [
        'contact',
        'email',
        'téléphone',
        'telephone',
        'adresse',
        'address',
        'map ',
        'carte',
        'facebook',
        'assistant',
        'modèle',
        'model',
        'البريد',
        'الهاتف',
        'العنوان',
      ]) &&
      containsAny(message, [
        'modifie',
        'change',
        'remplace',
        'mets à jour',
        'active',
        'désactive',
        'desactive',
        'efface',
        'supprime',
        'update',
        'set ',
        'enable',
        'disable',
        'clear',
        'remove',
        'غيّر',
        'فعّل',
        'عطّل',
      ])
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
      containsAny(message, [
        'réagis',
        'reagis',
        'réaction',
        'reaction',
        'ajoute 👍',
        'ajoute ❤️',
        'ajoute 👏',
        'ajoute 🎉',
        'ajoute 🔥',
        'ajoute 👀',
        'retire 👍',
        'retire ❤️',
        'retire 👏',
        'retire 🎉',
        'retire 🔥',
        'retire 👀',
        'react ',
        'like ',
        'تفاعل',
      ]) &&
      containsAny(message, ['👍', '❤️', '👏', '🎉', '🔥', '👀'])
    ) {
      return 'set_bulletin_reaction';
    }
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
    if (requestsProductRestore(message)) return 'restore_products';
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
