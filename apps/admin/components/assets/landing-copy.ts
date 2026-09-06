export type LandingWorkspaceCopy = {
  landingPages: string;
  create: string;
  search: string;
  product: string;
  locale: string;
  status: string;
  active: string;
  inactive: string;
  revision: string;
  modified: string;
  open: string;
  preview: string;
  live: string;
  noPages: string;
  createTitle: string;
  createDescription: string;
  cancel: string;
  close: string;
  save: string;
  saving: string;
  saved: string;
  unsaved: string;
  validation: string;
  stale: string;
  reload: string;
  unsavedConfirm: string;
  draftFound: string;
  draftRecover: string;
  draftChanged: string;
  restoreDraft: string;
  discardDraft: string;
  draftStorageFailed: string;
  pageDetails: string;
  seoTitle: string;
  seoDescription: string;
  outline: string;
  editor: string;
  addBlock: string;
  more: string;
  moveUp: string;
  moveDown: string;
  duplicate: string;
  delete: string;
  advanced: string;
  surface: string;
  width: string;
  variant: string;
  addItem: string;
  removeItem: string;
  field: string;
  productSearch: string;
  productEmpty: string;
  selected: string;
  remove: string;
  back: string;
};

const copy: Record<'en' | 'fr' | 'ar', LandingWorkspaceCopy> = {
  en: {
    landingPages: 'Landing pages',
    create: 'Create',
    search: 'Search landing pages',
    product: 'Product',
    locale: 'Content language',
    status: 'Status',
    active: 'Active',
    inactive: 'Inactive',
    revision: 'Revision',
    modified: 'Modified',
    open: 'Open',
    preview: 'Preview saved page',
    live: 'View live page',
    noPages: 'No landing pages match this search.',
    createTitle: 'Create landing page',
    createDescription: 'Choose a product and the language of the campaign content.',
    cancel: 'Cancel',
    close: 'Close',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved',
    unsaved: 'Unsaved changes',
    validation: 'Review the fields that could not be saved.',
    stale: 'A newer revision exists. Your edits are still here.',
    reload: 'Reload latest revision',
    unsavedConfirm: 'Leave without saving your changes?',
    draftFound: 'Unsaved changes from this tab',
    draftRecover:
      'Restore your changes to continue editing, or discard them to use the saved page. Nothing is published until you save.',
    draftChanged:
      'These changes began at revision {draftRevision}. The saved page is now revision {currentRevision}. Restoring replaces its content in the editor. Review it before saving.',
    restoreDraft: 'Restore changes',
    discardDraft: 'Discard changes',
    draftStorageFailed:
      'This browser could not keep a recovery copy. Save your changes before leaving this page.',
    pageDetails: 'Page details',
    seoTitle: 'Browser and social title',
    seoDescription: 'Browser and social description',
    outline: 'Page outline',
    editor: 'Block editor',
    addBlock: 'Add block',
    more: 'More',
    moveUp: 'Move up',
    moveDown: 'Move down',
    duplicate: 'Duplicate',
    delete: 'Delete',
    advanced: 'Advanced',
    surface: 'Surface',
    width: 'Width',
    variant: 'Variant',
    addItem: 'Add item',
    removeItem: 'Remove item',
    field: 'Field',
    productSearch: 'Search products',
    productEmpty: 'No products match.',
    selected: 'Selected product',
    remove: 'Remove',
    back: 'Back to outline',
  },
  fr: {
    landingPages: 'Pages d’atterrissage',
    create: 'Créer',
    search: 'Rechercher une page',
    product: 'Produit',
    locale: 'Langue du contenu',
    status: 'Statut',
    active: 'Active',
    inactive: 'Inactive',
    revision: 'Révision',
    modified: 'Modifié',
    open: 'Ouvrir',
    preview: 'Aperçu de la version enregistrée',
    live: 'Voir la page active',
    noPages: 'Aucune page ne correspond à cette recherche.',
    createTitle: 'Créer une page d’atterrissage',
    createDescription: 'Choisissez un produit et la langue du contenu de campagne.',
    cancel: 'Annuler',
    close: 'Fermer',
    save: 'Enregistrer',
    saving: 'Enregistrement…',
    saved: 'Enregistré',
    unsaved: 'Modifications non enregistrées',
    validation: 'Vérifiez les champs qui ne peuvent pas être enregistrés.',
    stale: 'Une révision plus récente existe. Vos modifications sont conservées.',
    reload: 'Charger la dernière révision',
    unsavedConfirm: 'Quitter sans enregistrer les modifications ?',
    draftFound: 'Modifications non enregistrées dans cet onglet',
    draftRecover:
      'Restaurez vos modifications pour continuer, ou abandonnez-les pour utiliser la page enregistrée. Rien ne sera publié avant votre enregistrement.',
    draftChanged:
      'Ces modifications datent de la révision {draftRevision}. La page enregistrée est maintenant à la révision {currentRevision}. Restaurer remplace son contenu dans cet éditeur. Vérifiez-le avant de sauvegarder.',
    restoreDraft: 'Restaurer les modifications',
    discardDraft: 'Abandonner les modifications',
    draftStorageFailed:
      'Ce navigateur ne peut pas conserver de copie de récupération. Enregistrez vos modifications avant de quitter cette page.',
    pageDetails: 'Détails de la page',
    seoTitle: 'Titre navigateur et réseaux sociaux',
    seoDescription: 'Description navigateur et réseaux sociaux',
    outline: 'Structure de la page',
    editor: 'Éditeur du bloc',
    addBlock: 'Ajouter un bloc',
    more: 'Autres',
    moveUp: 'Monter',
    moveDown: 'Descendre',
    duplicate: 'Dupliquer',
    delete: 'Supprimer',
    advanced: 'Avancé',
    surface: 'Surface',
    width: 'Largeur',
    variant: 'Variante',
    addItem: 'Ajouter un élément',
    removeItem: 'Retirer l’élément',
    field: 'Champ',
    productSearch: 'Rechercher des produits',
    productEmpty: 'Aucun produit correspondant.',
    selected: 'Produit sélectionné',
    remove: 'Retirer',
    back: 'Retour à la structure',
  },
  ar: {
    landingPages: 'صفحات الهبوط',
    create: 'إنشاء',
    search: 'البحث في صفحات الهبوط',
    product: 'المنتج',
    locale: 'لغة المحتوى',
    status: 'الحالة',
    active: 'نشطة',
    inactive: 'غير نشطة',
    revision: 'المراجعة',
    modified: 'آخر تعديل',
    open: 'فتح',
    preview: 'معاينة النسخة المحفوظة',
    live: 'عرض الصفحة النشطة',
    noPages: 'لا توجد صفحات مطابقة للبحث.',
    createTitle: 'إنشاء صفحة هبوط',
    createDescription: 'اختر المنتج ولغة محتوى الحملة.',
    cancel: 'إلغاء',
    close: 'إغلاق',
    save: 'حفظ',
    saving: 'جارٍ الحفظ…',
    saved: 'تم الحفظ',
    unsaved: 'تغييرات غير محفوظة',
    validation: 'راجع الحقول التي تعذّر حفظها.',
    stale: 'توجد مراجعة أحدث، وما زالت تعديلاتك محفوظة هنا.',
    reload: 'تحميل أحدث مراجعة',
    unsavedConfirm: 'المغادرة دون حفظ التغييرات؟',
    draftFound: 'تغييرات غير محفوظة من علامة التبويب هذه',
    draftRecover:
      'استعد تغييراتك لمواصلة التحرير، أو تجاهلها لاستخدام الصفحة المحفوظة. لن يُنشر شيء حتى تحفظ.',
    draftChanged:
      'بدأت هذه التغييرات من المراجعة {draftRevision}. الصفحة المحفوظة الآن في المراجعة {currentRevision}. الاستعادة تستبدل محتواها في المحرر. راجعها قبل الحفظ.',
    restoreDraft: 'استعادة التغييرات',
    discardDraft: 'تجاهل التغييرات',
    draftStorageFailed:
      'تعذّر على هذا المتصفح الاحتفاظ بنسخة للاستعادة. احفظ تغييراتك قبل مغادرة هذه الصفحة.',
    pageDetails: 'تفاصيل الصفحة',
    seoTitle: 'عنوان المتصفح والمشاركة',
    seoDescription: 'وصف المتصفح والمشاركة',
    outline: 'بنية الصفحة',
    editor: 'محرر القسم',
    addBlock: 'إضافة قسم',
    more: 'المزيد',
    moveUp: 'تحريك للأعلى',
    moveDown: 'تحريك للأسفل',
    duplicate: 'تكرار',
    delete: 'حذف',
    advanced: 'إعدادات متقدمة',
    surface: 'الخلفية',
    width: 'العرض',
    variant: 'النمط',
    addItem: 'إضافة عنصر',
    removeItem: 'إزالة العنصر',
    field: 'الحقل',
    productSearch: 'البحث في المنتجات',
    productEmpty: 'لا توجد منتجات مطابقة.',
    selected: 'المنتج المختار',
    remove: 'إزالة',
    back: 'العودة إلى البنية',
  },
};

export function getLandingWorkspaceCopy(locale: string) {
  return copy[locale === 'ar' || locale === 'fr' ? locale : 'en'];
}
