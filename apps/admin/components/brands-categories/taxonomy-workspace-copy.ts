export type TaxonomyView = 'brands' | 'categories';

export type TaxonomyCopy = {
  title: string;
  brands: string;
  categories: string;
  brand: string;
  category: string;
  create: string;
  edit: string;
  delete: string;
  cancel: string;
  close: string;
  save: string;
  saving: string;
  search: string;
  sort: string;
  recentlyModified: string;
  alphabetically: string;
  mostProducts: string;
  image: string;
  name: string;
  arabicName: string;
  parent: string;
  noParent: string;
  products: string;
  active: string;
  inactive: string;
  actions: string;
  select: string;
  selectAll: string;
  selected: string;
  activate: string;
  deactivate: string;
  loading: string;
  empty: string;
  noMatches: string;
  loadFailed: string;
  saveFailed: string;
  saved: string;
  deleted: string;
  bulkSaved: string;
  confirmDelete: string;
  confirmBulkDelete: string;
  editorDescription: string;
  reviewFields: string;
  readOnly: string;
};

const copy: Record<'en' | 'fr' | 'ar', TaxonomyCopy> = {
  en: {
    title: 'Catalog organization',
    brands: 'Brands',
    categories: 'Categories',
    brand: 'Brand',
    category: 'Category',
    create: 'Create',
    edit: 'Edit',
    delete: 'Delete',
    cancel: 'Cancel',
    close: 'Close',
    save: 'Save',
    saving: 'Saving…',
    search: 'Search by name or slug',
    sort: 'Sort',
    recentlyModified: 'Recently modified',
    alphabetically: 'Name A–Z',
    mostProducts: 'Most products',
    image: 'Image',
    name: 'Name',
    arabicName: 'Arabic name',
    parent: 'Parent category',
    noParent: 'No parent category',
    products: 'products',
    active: 'Active',
    inactive: 'Inactive',
    actions: 'Actions',
    select: 'Select',
    selectAll: 'Select all visible',
    selected: 'selected',
    activate: 'Activate',
    deactivate: 'Deactivate',
    loading: 'Loading…',
    empty: 'Nothing has been created yet.',
    noMatches: 'No matching records.',
    loadFailed: 'The records could not be loaded.',
    saveFailed: 'The change could not be saved.',
    saved: 'Saved.',
    deleted: 'Deleted.',
    bulkSaved: 'Selected records updated.',
    confirmDelete: 'Delete this record? Products using it may prevent deletion.',
    confirmBulkDelete: 'Delete the selected records? Products using them may prevent deletion.',
    editorDescription: 'Customer-facing identity and catalog grouping.',
    reviewFields: 'Review the highlighted information.',
    readOnly: 'This data source is read-only.',
  },
  fr: {
    title: 'Organisation du catalogue',
    brands: 'Marques',
    categories: 'Catégories',
    brand: 'Marque',
    category: 'Catégorie',
    create: 'Créer',
    edit: 'Modifier',
    delete: 'Supprimer',
    cancel: 'Annuler',
    close: 'Fermer',
    save: 'Enregistrer',
    saving: 'Enregistrement…',
    search: 'Rechercher par nom ou slug',
    sort: 'Trier',
    recentlyModified: 'Modifiés récemment',
    alphabetically: 'Nom A–Z',
    mostProducts: 'Plus de produits',
    image: 'Image',
    name: 'Nom',
    arabicName: 'Nom arabe',
    parent: 'Catégorie parente',
    noParent: 'Aucune catégorie parente',
    products: 'produits',
    active: 'Actif',
    inactive: 'Inactif',
    actions: 'Actions',
    select: 'Sélectionner',
    selectAll: 'Sélectionner les éléments visibles',
    selected: 'sélectionné(s)',
    activate: 'Activer',
    deactivate: 'Désactiver',
    loading: 'Chargement…',
    empty: 'Aucun élément créé.',
    noMatches: 'Aucun résultat.',
    loadFailed: 'Impossible de charger les éléments.',
    saveFailed: 'Impossible d’enregistrer la modification.',
    saved: 'Enregistré.',
    deleted: 'Supprimé.',
    bulkSaved: 'Les éléments sélectionnés ont été modifiés.',
    confirmDelete: 'Supprimer cet élément ? Les produits associés peuvent empêcher la suppression.',
    confirmBulkDelete:
      'Supprimer les éléments sélectionnés ? Les produits associés peuvent empêcher la suppression.',
    editorDescription: 'Identité visible par les clients et organisation du catalogue.',
    reviewFields: 'Vérifiez les informations saisies.',
    readOnly: 'Cette source de données est en lecture seule.',
  },
  ar: {
    title: 'تنظيم الكتالوج',
    brands: 'العلامات',
    categories: 'الفئات',
    brand: 'علامة',
    category: 'فئة',
    create: 'إنشاء',
    edit: 'تعديل',
    delete: 'حذف',
    cancel: 'إلغاء',
    close: 'إغلاق',
    save: 'حفظ',
    saving: 'جارٍ الحفظ…',
    search: 'البحث بالاسم أو المعرّف',
    sort: 'الترتيب',
    recentlyModified: 'آخر تعديل',
    alphabetically: 'الاسم أ–ي',
    mostProducts: 'الأكثر منتجات',
    image: 'الصورة',
    name: 'الاسم',
    arabicName: 'الاسم العربي',
    parent: 'الفئة الرئيسية',
    noParent: 'بدون فئة رئيسية',
    products: 'منتج',
    active: 'نشط',
    inactive: 'غير نشط',
    actions: 'الإجراءات',
    select: 'تحديد',
    selectAll: 'تحديد العناصر الظاهرة',
    selected: 'محدد',
    activate: 'تفعيل',
    deactivate: 'إلغاء التفعيل',
    loading: 'جارٍ التحميل…',
    empty: 'لم يتم إنشاء أي عناصر.',
    noMatches: 'لا توجد نتائج مطابقة.',
    loadFailed: 'تعذّر تحميل العناصر.',
    saveFailed: 'تعذّر حفظ التغيير.',
    saved: 'تم الحفظ.',
    deleted: 'تم الحذف.',
    bulkSaved: 'تم تحديث العناصر المحددة.',
    confirmDelete: 'حذف هذا العنصر؟ قد تمنع المنتجات المرتبطة حذفه.',
    confirmBulkDelete: 'حذف العناصر المحددة؟ قد تمنع المنتجات المرتبطة حذفها.',
    editorDescription: 'الهوية الظاهرة للعملاء وتنظيم الكتالوج.',
    reviewFields: 'راجع المعلومات المدخلة.',
    readOnly: 'مصدر البيانات هذا للقراءة فقط.',
  },
};

export function getTaxonomyCopy(locale: string) {
  return copy[locale === 'ar' || locale === 'fr' ? locale : 'en'];
}
