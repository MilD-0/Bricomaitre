export type ProposalReviewCopy = {
  filters: string;
  cancel: string;
  close: string;
  select: string;
  selectAll: string;
  selected: string;
  reviewDetails: string;
  selectPrompt: string;
  changes: string;
  current: string;
  proposed: string;
  reasoning: string;
  provenance: string;
  requestedBy: string;
  created: string;
  expires: string;
  task: string;
  model: string;
  reference: string;
  exactPayload: string;
  proposedFields: string;
  fieldsChanged: string;
  fieldsChangedMore: string;
  productsSelected: string;
  landingPage: string;
  relation: string;
  payloadFields: string;
  noStructuredChanges: string;
  confirmApproveTitle: string;
  confirmApprove: string;
  confirmRejectTitle: string;
  confirmReject: string;
  confirmBulkApprove: string;
  confirmBulkReject: string;
  expiredSelection: string;
  unknownRequester: string;
};

const copy: Record<'en' | 'fr' | 'ar', ProposalReviewCopy> = {
  en: {
    filters: 'Filters',
    cancel: 'Cancel',
    close: 'Close review',
    select: 'Select',
    selectAll: 'Select all visible proposals',
    selected: 'selected',
    reviewDetails: 'Review details',
    selectPrompt: 'Select a proposal to inspect its exact change and supporting evidence.',
    changes: 'Proposed change',
    current: 'Current',
    proposed: 'Proposed',
    reasoning: 'Reasoning',
    provenance: 'Provenance',
    requestedBy: 'Requested by',
    created: 'Created',
    expires: 'Expires',
    task: 'Task',
    model: 'Model',
    reference: 'Reference',
    exactPayload: 'Exact technical payload',
    proposedFields: 'Proposed values',
    fieldsChanged: '{fields}',
    fieldsChangedMore: '{fields} and {count} more',
    productsSelected: '{count} products selected',
    landingPage: '{locale} landing page',
    relation: '{relation} product relation',
    payloadFields: '{count} payload fields',
    noStructuredChanges: 'Technical proposal payload',
    confirmApproveTitle: 'Approve this proposal?',
    confirmApprove: 'The proposed change will be applied to the catalog.',
    confirmRejectTitle: 'Reject this proposal?',
    confirmReject: 'The proposal will leave the review queue without changing the catalog.',
    confirmBulkApprove: '{count} selected proposals will be applied in order.',
    confirmBulkReject: '{count} selected proposals will leave the review queue.',
    expiredSelection: 'Expired proposals cannot be approved.',
    unknownRequester: 'System',
  },
  fr: {
    filters: 'Filtres',
    cancel: 'Annuler',
    close: 'Fermer la révision',
    select: 'Sélectionner',
    selectAll: 'Sélectionner les propositions visibles',
    selected: 'sélectionnée(s)',
    reviewDetails: 'Détails de la révision',
    selectPrompt: 'Sélectionnez une proposition pour examiner le changement exact et ses preuves.',
    changes: 'Modification proposée',
    current: 'Actuel',
    proposed: 'Proposé',
    reasoning: 'Raisonnement',
    provenance: 'Provenance',
    requestedBy: 'Demandé par',
    created: 'Créée',
    expires: 'Expire',
    task: 'Tâche',
    model: 'Modèle',
    reference: 'Référence',
    exactPayload: 'Charge technique exacte',
    proposedFields: 'Valeurs proposées',
    fieldsChanged: '{fields}',
    fieldsChangedMore: '{fields} et {count} autre(s)',
    productsSelected: '{count} produits sélectionnés',
    landingPage: 'Page d’atterrissage {locale}',
    relation: 'Relation produit · {relation}',
    payloadFields: '{count} champs techniques',
    noStructuredChanges: 'Charge technique de la proposition',
    confirmApproveTitle: 'Approuver cette proposition ?',
    confirmApprove: 'La modification proposée sera appliquée au catalogue.',
    confirmRejectTitle: 'Rejeter cette proposition ?',
    confirmReject: 'La proposition quittera la file sans modifier le catalogue.',
    confirmBulkApprove: '{count} propositions sélectionnées seront appliquées dans l’ordre.',
    confirmBulkReject: '{count} propositions sélectionnées quitteront la file de révision.',
    expiredSelection: 'Les propositions expirées ne peuvent pas être approuvées.',
    unknownRequester: 'Système',
  },
  ar: {
    filters: 'التصفية',
    cancel: 'إلغاء',
    close: 'إغلاق المراجعة',
    select: 'تحديد',
    selectAll: 'تحديد الاقتراحات الظاهرة',
    selected: 'محدد',
    reviewDetails: 'تفاصيل المراجعة',
    selectPrompt: 'اختر اقتراحًا لمراجعة التغيير الدقيق والأدلة الداعمة.',
    changes: 'التغيير المقترح',
    current: 'الحالي',
    proposed: 'المقترح',
    reasoning: 'التعليل',
    provenance: 'المصدر',
    requestedBy: 'طلبه',
    created: 'تاريخ الإنشاء',
    expires: 'انتهاء الصلاحية',
    task: 'المهمة',
    model: 'النموذج',
    reference: 'المرجع',
    exactPayload: 'البيانات التقنية الكاملة',
    proposedFields: 'القيم المقترحة',
    fieldsChanged: '{fields}',
    fieldsChangedMore: '{fields} و{count} أخرى',
    productsSelected: 'تم اختيار {count} منتجات',
    landingPage: 'صفحة هبوط {locale}',
    relation: 'علاقة منتجات · {relation}',
    payloadFields: '{count} حقول تقنية',
    noStructuredChanges: 'البيانات التقنية للاقتراح',
    confirmApproveTitle: 'اعتماد هذا الاقتراح؟',
    confirmApprove: 'سيتم تطبيق التغيير المقترح على الكتالوج.',
    confirmRejectTitle: 'رفض هذا الاقتراح؟',
    confirmReject: 'سيغادر الاقتراح قائمة المراجعة دون تغيير الكتالوج.',
    confirmBulkApprove: 'سيتم تطبيق {count} اقتراحات محددة بالترتيب.',
    confirmBulkReject: 'ستغادر {count} اقتراحات محددة قائمة المراجعة.',
    expiredSelection: 'لا يمكن اعتماد الاقتراحات منتهية الصلاحية.',
    unknownRequester: 'النظام',
  },
};

export function getProposalReviewCopy(locale: string) {
  return copy[locale === 'ar' || locale === 'fr' ? locale : 'en'];
}

export function interpolateCopy(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}
