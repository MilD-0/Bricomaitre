'use client';
import {
  landingPageDocumentSchema,
  type LandingPageBlock,
} from '@bric/storefront-core/landing-pages';
import { useLocale } from 'next-intl';
import * as React from 'react';
import { AdminApiError, requestJson } from '../../../lib/admin-api';
import { getLandingWorkspaceCopy } from '../landing-copy';
import { blockLabels } from '../structured-block-editor';
import { createBlock, type LandingPageDetail } from './blocks';
import { readLocalDraft, type LocalLandingDraft } from './draft-storage';

export function useLandingPageBuilder({
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

  return {
    view: {
      adminLocale,
      t,
      page,
      savedActive,
      storefrontBaseUrl,
      active,
      pending,
      recovery,
      draftReady,
      setActive,
      dirty,
      save,
      message,
      stale,
      reload,
      restoreDraft,
      discardDraft,
      draftStorageFailed,
      showEditor,
      document,
      selected,
      setSelectedId,
      setShowEditor,
      labels,
      move,
      duplicate,
      remove,
      add,
      setDocument,
      selectedIndex,
      patchBlock,
    } as const,
    fallback: null,
  };
}
