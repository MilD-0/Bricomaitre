'use client';

import {
  landingPageDocumentSchema,
  type LandingPageBlock,
  type LandingPageDocument,
} from '@bric/storefront-core/landing-pages';
import { ArrowLeft, ExternalLink, Eye } from 'lucide-react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import * as React from 'react';

import { AdminApiError, requestJson } from '../../lib/admin-api';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { CompactMenu, CompactMenuItem } from '../ui/compact-menu';
import { FieldError } from '../ui/field';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
} from '../ui/workspace';
import { getLandingWorkspaceCopy } from './landing-copy';
import { blockLabels, StructuredBlockEditor } from './structured-block-editor';

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

const commonTypes: LandingPageBlock['type'][] = [
  'product-hero',
  'benefit-grid',
  'media-feature',
  'specifications',
  'faq',
  'final-cta',
];
const moreTypes: LandingPageBlock['type'][] = [
  'editorial-intro',
  'image-gallery',
  'use-cases',
  'comparison',
  'process',
  'trust-band',
  'commerce-panel',
];

function createBlock(type: LandingPageBlock['type'], locale: 'fr' | 'ar'): LandingPageBlock {
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

function blockSummary(block: LandingPageBlock) {
  if ('heading' in block && block.heading) return block.heading;
  if (block.type === 'trust-band') return block.items.map((item) => item.title).join(' · ');
  return block.type;
}

type LocalLandingDraft = {
  version: 1;
  baseRevision: number;
  active: boolean;
  document: LandingPageDocument;
};

function readLocalDraft(value: string | null): LocalLandingDraft | null {
  if (!value) return null;
  try {
    const draft = JSON.parse(value) as LocalLandingDraft;
    if (
      draft.version !== 1 ||
      !Number.isSafeInteger(draft.baseRevision) ||
      draft.baseRevision < 1 ||
      typeof draft.active !== 'boolean'
    )
      return null;
    const parsed = landingPageDocumentSchema.safeParse(draft.document);
    // Drafts can contain empty required text, unfinished URLs and incomplete
    // lists. Reject broken structure, while retaining those editable values.
    if (
      !parsed.success &&
      parsed.error.issues.some(
        (issue) => !['too_small', 'too_big', 'invalid_format', 'custom'].includes(issue.code),
      )
    )
      return null;
    return draft;
  } catch {
    return null;
  }
}

export function LandingPageBuilder({
  initialPage,
  storefrontBaseUrl,
}: {
  initialPage: LandingPageDetail;
  storefrontBaseUrl: string;
}) {
  const adminLocaleValue = useLocale();
  const adminLocale =
    adminLocaleValue === 'ar' || adminLocaleValue === 'fr' ? adminLocaleValue : 'en';
  const t = getLandingWorkspaceCopy(adminLocale);
  const labels = blockLabels[adminLocale];
  const [page, setPage] = React.useState(initialPage);
  const [document, setDocument] = React.useState(() => structuredClone(initialPage.document));
  const [savedDocument, setSavedDocument] = React.useState(() =>
    structuredClone(initialPage.document),
  );
  const [active, setActive] = React.useState(initialPage.active);
  const [savedActive, setSavedActive] = React.useState(initialPage.active);
  const [selectedId, setSelectedId] = React.useState(initialPage.document.blocks[0]?.id ?? '');
  const [showEditor, setShowEditor] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [stale, setStale] = React.useState(false);
  const draftKey = `bric:landing-draft:${initialPage.id}`;
  const draftReady = React.useSyncExternalStore(
    React.useCallback(() => () => {}, []),
    () => true,
    () => false,
  );
  const [initialRecovery] = React.useState(() => {
    try {
      const draft =
        typeof window === 'undefined'
          ? null
          : readLocalDraft(window.sessionStorage.getItem(draftKey));
      return {
        draft:
          draft &&
          (JSON.stringify(draft.document) !== JSON.stringify(initialPage.document) ||
            draft.active !== initialPage.active)
            ? draft
            : null,
        failed: false,
      };
    } catch {
      return { draft: null, failed: true };
    }
  });
  const [recovery, setRecovery] = React.useState<LocalLandingDraft | null>(initialRecovery.draft);
  const [draftStorageFailed, setDraftStorageFailed] = React.useState(initialRecovery.failed);
  const dirty = React.useMemo(
    () => JSON.stringify(document) !== JSON.stringify(savedDocument) || active !== savedActive,
    [active, document, savedActive, savedDocument],
  );
  const localDraft = JSON.stringify({
    version: 1,
    baseRevision: page.currentRevision,
    active,
    document,
  } satisfies LocalLandingDraft);
  React.useLayoutEffect(() => {
    if (!draftReady || recovery) return;
    try {
      if (dirty) window.sessionStorage.setItem(draftKey, localDraft);
      else window.sessionStorage.removeItem(draftKey);
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- A failed external storage write must be visible to the operator.
      setDraftStorageFailed(true);
    }
  }, [dirty, draftKey, draftReady, localDraft, recovery]);
  const restoreDraft = () => {
    if (!recovery) return;
    setDocument(structuredClone(recovery.document));
    setActive(recovery.active);
    setSelectedId(recovery.document.blocks[0]?.id ?? '');
    setRecovery(null);
  };
  const discardDraft = () => {
    try {
      window.sessionStorage.removeItem(draftKey);
      setRecovery(null);
    } catch {
      setDraftStorageFailed(true);
    }
  };
  const selectedIndex = document.blocks.findIndex((block) => block.id === selectedId);
  const selected = document.blocks[selectedIndex] ?? document.blocks[0];

  React.useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const navigate = (event: MouseEvent) => {
      if (
        !dirty ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const destination = new URL(link.href, window.location.href);
      if (
        destination.href === window.location.href ||
        (destination.pathname === window.location.pathname &&
          destination.search === window.location.search)
      )
        return;
      if (!window.confirm(t.unsavedConfirm)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.document.removeEventListener('click', navigate, true);
    };
  }, [dirty, t.unsavedConfirm]);
  const patchBlock = (index: number, block: LandingPageBlock) =>
    setDocument((current) => ({
      ...current,
      schemaVersion: 2,
      blocks: current.blocks.map((item, itemIndex) => (itemIndex === index ? block : item)),
    }));
  const move = (index: number, offset: number) =>
    setDocument((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.blocks.length) return current;
      const blocks = [...current.blocks];
      [blocks[index], blocks[target]] = [blocks[target]!, blocks[index]!];
      return { ...current, blocks };
    });
  const duplicate = (index: number) =>
    setDocument((current) => {
      const source = current.blocks[index];
      if (!source) return current;
      const clone = {
        ...structuredClone(source),
        id: `${source.id}-copy-${Date.now().toString(36)}`,
      } as LandingPageBlock;
      const blocks = [...current.blocks];
      blocks.splice(index + 1, 0, clone);
      setSelectedId(clone.id);
      return { ...current, blocks };
    });
  const remove = (index: number) =>
    setDocument((current) => {
      const next = current.blocks.filter((_, itemIndex) => itemIndex !== index);
      setSelectedId(next[Math.max(0, index - 1)]?.id ?? '');
      return { ...current, blocks: next };
    });
  const add = (type: LandingPageBlock['type']) => {
    const block = createBlock(type, page.locale);
    setDocument((current) => ({ ...current, blocks: [...current.blocks, block] }));
    setSelectedId(block.id);
    setShowEditor(true);
  };

  const save = async () => {
    if (pending || recovery || !draftReady) return;
    const parsed = landingPageDocumentSchema.safeParse({
      ...document,
      seo: { ...document.seo, indexable: false },
    });
    if (!parsed.success) {
      setMessage(parsed.error.issues.map((issue) => issue.message).join(' · '));
      return;
    }
    setPending(true);
    setMessage('');
    setStale(false);
    try {
      const result = await requestJson<{ id: number; active: boolean; currentRevision: number }>(
        `/api/landing-pages/${page.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            action: 'save-active',
            document: parsed.data,
            active,
            expectedRevision: page.currentRevision,
          }),
        },
      );
      try {
        if (window.sessionStorage.getItem(draftKey) === localDraft)
          window.sessionStorage.removeItem(draftKey);
      } catch {
        setDraftStorageFailed(true);
      }
      setPage((current) => ({
        ...current,
        active: result.active,
        currentRevision: result.currentRevision,
        document: parsed.data,
      }));
      setDocument(structuredClone(parsed.data));
      setSavedDocument(structuredClone(parsed.data));
      setSavedActive(result.active);
      setMessage(t.saved);
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 409) {
        setStale(true);
        setMessage(t.stale);
      } else setMessage(error instanceof Error ? error.message : t.validation);
    } finally {
      setPending(false);
    }
  };

  const reload = async () => {
    const latest = await requestJson<LandingPageDetail>(`/api/landing-pages/${page.id}`);
    setPage(latest);
    setDocument(structuredClone(latest.document));
    setSavedDocument(structuredClone(latest.document));
    setActive(latest.active);
    setSavedActive(latest.active);
    setSelectedId(latest.document.blocks[0]?.id ?? '');
    setStale(false);
    setMessage('');
  };

  return (
    <WorkspaceFrame data-landing-builder>
      <div className="sticky top-0 z-20 bg-background/92 backdrop-blur-xl">
        <WorkspaceHeader>
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={`/${adminLocale}/assets/landing-pages`}
              className="grid size-9 shrink-0 place-items-center rounded-md hover:bg-muted"
              aria-label={t.back}
            >
              <ArrowLeft className="size-4 rtl:rotate-180" />
            </Link>
            <WorkspaceHeading
              title={page.productTitle}
              meta={`${t.revision} ${page.currentRevision}`}
              description={`/${page.locale}/landing/${page.slug}`}
              showTitleOnMobile
            />
          </div>
          <WorkspaceActions>
            <a
              href={`/api/landing-pages/${page.id}?view=preview`}
              target="_blank"
              rel="noreferrer"
              aria-label={t.preview}
              className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <Eye className="size-4" aria-hidden="true" />
            </a>
            {savedActive ? (
              <a
                href={`${storefrontBaseUrl}/${page.locale}/landing/${encodeURIComponent(page.slug)}`}
                target="_blank"
                rel="noreferrer"
                aria-label={t.live}
                className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <span className="hidden sm:inline">{active ? t.active : t.inactive}</span>
              <Switch
                aria-label={`${t.status} · ${active ? t.active : t.inactive}`}
                checked={active}
                disabled={pending || Boolean(recovery) || !draftReady}
                onCheckedChange={setActive}
              />
            </label>
            <Button
              disabled={pending || !dirty || Boolean(recovery) || !draftReady}
              onClick={() => void save()}
            >
              {pending ? t.saving : t.save}
            </Button>
          </WorkspaceActions>
        </WorkspaceHeader>
        <div className="flex min-h-9 items-center justify-between gap-3 border-b border-border/60 px-3 py-1.5 text-xs sm:px-4 lg:px-5">
          <span
            className={cn(
              message ? 'text-destructive' : 'text-muted-foreground',
              message === t.saved && !dirty && 'text-primary',
            )}
          >
            {dirty && message === t.saved ? t.unsaved : message || (dirty ? t.unsaved : t.saved)}
          </span>
          {stale ? (
            <Button size="sm" variant="outline" onClick={() => void reload()}>
              {t.reload}
            </Button>
          ) : null}
        </div>
      </div>

      {draftReady && recovery ? (
        <section aria-label={t.draftFound} className="border-b border-border/60 px-4 py-4 sm:px-6">
          <p className="text-sm font-medium">{t.draftFound}</p>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {recovery.baseRevision !== page.currentRevision
              ? t.draftChanged
                  .replace('{draftRevision}', String(recovery.baseRevision))
                  .replace('{currentRevision}', String(page.currentRevision))
              : t.draftRecover}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={restoreDraft}>{t.restoreDraft}</Button>
            <Button variant="outline" onClick={discardDraft}>
              {t.discardDraft}
            </Button>
          </div>
        </section>
      ) : null}
      {draftReady && draftStorageFailed ? (
        <p
          role="alert"
          className="border-b border-border/60 px-4 py-3 text-sm text-destructive sm:px-6"
        >
          {t.draftStorageFailed}
        </p>
      ) : null}
      <div
        inert={pending || Boolean(recovery) || !draftReady}
        className="grid min-h-[calc(100dvh-11rem)] md:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[24rem_minmax(0,1fr)]"
      >
        <aside className={cn('border-e border-border/60', showEditor && 'hidden md:block')}>
          <div className="border-b border-border/60 px-3 py-3 text-sm font-semibold">
            {t.outline}
          </div>
          <div className="divide-y divide-border/55">
            {document.blocks.map((block, index) => (
              <div
                key={block.id}
                className={cn(
                  'flex items-center gap-2 px-2 py-2',
                  block.id === selected?.id && 'bg-primary/5',
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 px-1 py-1 text-start"
                  onClick={() => {
                    setSelectedId(block.id);
                    setShowEditor(true);
                  }}
                >
                  <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {index + 1} · {labels[block.type]}
                  </span>
                  <span className="mt-0.5 block truncate text-sm">{blockSummary(block)}</span>
                </button>
                <CompactMenu label={`${labels[block.type]} · ${t.more}`}>
                  <CompactMenuItem disabled={index === 0} onClick={() => move(index, -1)}>
                    {t.moveUp}
                  </CompactMenuItem>
                  <CompactMenuItem
                    disabled={index === document.blocks.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    {t.moveDown}
                  </CompactMenuItem>
                  <CompactMenuItem onClick={() => duplicate(index)}>{t.duplicate}</CompactMenuItem>
                  {block.type !== 'product-hero' && block.type !== 'final-cta' ? (
                    <CompactMenuItem destructive onClick={() => remove(index)}>
                      {t.delete}
                    </CompactMenuItem>
                  ) : null}
                </CompactMenu>
              </div>
            ))}
          </div>
          <div className="space-y-3 border-t border-border/60 p-3">
            <label className="grid gap-1.5 text-sm font-medium">
              {t.addBlock}
              <select
                defaultValue=""
                className="h-10 rounded-md border border-input bg-background px-3"
                onChange={(event) => {
                  if (event.target.value) add(event.target.value as LandingPageBlock['type']);
                  event.target.value = '';
                }}
              >
                <option value="" disabled>
                  {t.addBlock}
                </option>
                {commonTypes.map((type) => (
                  <option key={type} value={type}>
                    {labels[type]}
                  </option>
                ))}
              </select>
            </label>
            <details>
              <summary className="cursor-pointer text-sm font-medium">{t.more}</summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {moreTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className="rounded-md border border-border/60 px-2 py-1.5 text-xs hover:bg-muted"
                    onClick={() => add(type)}
                  >
                    {labels[type]}
                  </button>
                ))}
              </div>
            </details>
          </div>
        </aside>

        <main className={cn('min-w-0', !showEditor && 'hidden md:block')}>
          <div className="border-b border-border/60 px-3 py-3 md:hidden">
            <button
              type="button"
              className="inline-flex items-center gap-2 text-sm font-medium"
              onClick={() => setShowEditor(false)}
            >
              <ArrowLeft className="size-4 rtl:rotate-180" />
              {t.back}
            </button>
          </div>
          <section className="space-y-4 border-b border-border/60 p-4 sm:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t.pageDetails}
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium">
                {t.seoTitle}
                <Input
                  value={document.seo.title}
                  maxLength={70}
                  onChange={(event) =>
                    setDocument((current) => ({
                      ...current,
                      seo: { ...current.seo, title: event.target.value, indexable: false },
                    }))
                  }
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                {t.seoDescription}
                <Textarea
                  value={document.seo.description}
                  maxLength={170}
                  onChange={(event) =>
                    setDocument((current) => ({
                      ...current,
                      seo: { ...current.seo, description: event.target.value, indexable: false },
                    }))
                  }
                />
              </label>
            </div>
          </section>
          {selected ? (
            <section className="p-4 sm:p-6">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {selectedIndex + 1} · {labels[selected.type]}
                </p>
                <h2 className="mt-1 text-xl font-semibold">{blockSummary(selected)}</h2>
              </div>
              {message && !stale && message !== t.saved ? (
                <FieldError className="mb-4">{message}</FieldError>
              ) : null}
              <StructuredBlockEditor
                block={selected}
                locale={adminLocale}
                copy={t}
                onChange={(block) => patchBlock(selectedIndex, block)}
              />
            </section>
          ) : null}
        </main>
      </div>
    </WorkspaceFrame>
  );
}
