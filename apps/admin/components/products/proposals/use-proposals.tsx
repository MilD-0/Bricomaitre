'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import type { AiProposalInboxData, AiProposalInboxItem } from '../../../lib/ai-proposal-inbox';
import { proposalPreview } from '../../../lib/ai-proposal-presentation';
import { toast } from '../../../lib/toast';
import { useAdminAiSurfaceDetails } from '../../admin-ai-surface-context';
import { useMediaQuery } from '../../ui/use-media-query';

import { AiProposalInspector } from '../ai-proposal-inspector';
import {
  getProposalReviewCopy,
  interpolateCopy,
  type ProposalReviewCopy,
} from '../ai-proposal-workspace-copy';

const wideLayoutQuery = '(min-width: 1280px)';

export function pageHref(data: AiProposalInboxData, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...data.query, page })) {
    if (value !== null && value !== '' && value !== 'all') params.set(key, String(value));
  }
  return `?${params.toString()}`;
}

export function previewText(item: AiProposalInboxItem, copy: ProposalReviewCopy) {
  const preview = proposalPreview(item);
  switch (preview.kind) {
    case 'fields': {
      const fields = preview.fields.join(', ');
      return interpolateCopy(preview.remaining > 0 ? copy.fieldsChangedMore : copy.fieldsChanged, {
        fields,
        count: preview.remaining,
      });
    }
    case 'relation':
      return interpolateCopy(copy.relation, { relation: preview.relation ?? 'Product' });
    case 'payload':
      return preview.count > 0
        ? interpolateCopy(copy.payloadFields, { count: preview.count })
        : copy.noStructuredChanges;
  }
}

export function useAiProposalWorkspace({
  initialData,
  now,
}: {
  initialData: AiProposalInboxData;
  now: string;
}) {
  const t = useTranslations('aiProposalInbox');
  const localeValue = useLocale();
  const locale = localeValue === 'ar' || localeValue === 'fr' ? localeValue : 'en';
  const copy = getProposalReviewCopy(locale);
  const router = useRouter();
  const isWideLayout = useMediaQuery(wideLayoutQuery);
  const [filtersOpen, setFiltersOpen] = React.useState(() =>
    Boolean(
      initialData.query.proposalType ||
      initialData.query.entityType ||
      initialData.query.model ||
      initialData.query.expiry !== 'all' ||
      initialData.query.evidence !== 'all' ||
      initialData.query.pageSize !== 20,
    ),
  );
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [mobileInspectorOpen, setMobileInspectorOpen] = React.useState(false);
  const [reviewRequest, setReviewRequest] = React.useState<{
    ids: number[];
    action: 'approve' | 'reject';
  } | null>(null);
  const [deleteExpiredRequest, setDeleteExpiredRequest] = React.useState(false);
  const [removedIds, setRemovedIds] = React.useState<Set<number>>(new Set());
  const [pending, setPending] = React.useState(false);
  const nowMs = Date.parse(now);
  useAdminAiSurfaceDetails({
    filters: {
      proposalType: initialData.query.proposalType,
      entityType: initialData.query.entityType,
      model: initialData.query.model,
      expiry: initialData.query.expiry,
      evidence: initialData.query.evidence,
      page: initialData.query.page,
    },
    selection: {
      entityType: 'proposal',
      ids: [...selectedIds],
      focusedId: selectedId,
    },
  });

  const proposals = initialData.items.filter((proposal) => !removedIds.has(proposal.id));
  const remainingTotal = Math.max(0, initialData.pagination.total - removedIds.size);
  const remainingTotalPages = Math.max(
    1,
    Math.ceil(remainingTotal / initialData.pagination.pageSize),
  );
  const effectiveSelected =
    proposals.find((proposal) => proposal.id === selectedId) ?? proposals[0] ?? null;
  const selectedProposals = proposals.filter((proposal) => selectedIds.has(proposal.id));
  const selectionContainsExpired = selectedProposals.some(
    (proposal) => new Date(proposal.expiresAt).getTime() <= nowMs,
  );
  const allVisibleSelected =
    proposals.length > 0 && proposals.every((proposal) => selectedIds.has(proposal.id));
  const expiredCount = proposals.filter(
    (proposal) => new Date(proposal.expiresAt).getTime() <= nowMs,
  ).length;
  const activeFilterCount =
    Number(Boolean(initialData.query.proposalType)) +
    Number(Boolean(initialData.query.entityType)) +
    Number(Boolean(initialData.query.model)) +
    Number(initialData.query.expiry !== 'all') +
    Number(initialData.query.evidence !== 'all') +
    Number(initialData.query.pageSize !== 20);

  function toggleSelection(id: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function inspect(item: AiProposalInboxItem) {
    setSelectedId(item.id);
    if (!isWideLayout) setMobileInspectorOpen(true);
  }

  function removeCompleted(completed: number[]) {
    const nextRemovedIds = new Set([...removedIds, ...completed]);
    setRemovedIds(nextRemovedIds);
    setSelectedIds((current) => new Set([...current].filter((id) => !completed.includes(id))));
    if (completed.includes(selectedId ?? -1)) setMobileInspectorOpen(false);

    const lastPage = Math.max(
      1,
      Math.ceil(
        (initialData.pagination.total - nextRemovedIds.size) / initialData.pagination.pageSize,
      ),
    );
    if (initialData.pagination.page > lastPage) router.replace(pageHref(initialData, lastPage));
  }

  async function review(ids: number[], action: 'approve' | 'reject') {
    if (ids.length === 0) return;
    setReviewRequest(null);
    setPending(true);
    const toastId = toast.loading(
      t(action === 'approve' ? 'approving' : 'rejecting', { count: ids.length }),
    );
    const completed: number[] = [];
    const failures: string[] = [];

    for (const id of ids) {
      try {
        const response = await fetch(`/api/ai/proposals/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error || t('reviewError'));
        completed.push(id);
      } catch (error) {
        failures.push(`#${id}: ${error instanceof Error ? error.message : t('reviewError')}`);
      }
    }

    removeCompleted(completed);

    if (failures.length > 0) toast.error(failures.join('\n'), { id: toastId });
    else
      toast.success(
        t(action === 'approve' ? 'approved' : 'rejected', { count: completed.length }),
        { id: toastId },
      );
    setPending(false);
  }

  async function deleteExpired() {
    const ids = proposals
      .filter((proposal) => new Date(proposal.expiresAt).getTime() <= nowMs)
      .map((proposal) => proposal.id);
    if (ids.length === 0) return;
    setDeleteExpiredRequest(false);
    setPending(true);
    const toastId = toast.loading(t('deletingExpired', { count: ids.length }));
    const completed: number[] = [];
    const failures: string[] = [];

    for (const id of ids) {
      try {
        const response = await fetch(`/api/ai/proposals/${id}`, { method: 'DELETE' });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error || t('deleteExpiredError'));
        completed.push(id);
      } catch (error) {
        failures.push(
          `#${id}: ${error instanceof Error ? error.message : t('deleteExpiredError')}`,
        );
      }
    }

    removeCompleted(completed);
    if (failures.length > 0) toast.error(failures.join('\n'), { id: toastId });
    else toast.success(t('deletedExpired', { count: completed.length }), { id: toastId });
    setPending(false);
  }

  const inspector = (
    <AiProposalInspector
      item={effectiveSelected}
      copy={copy}
      locale={locale}
      now={nowMs}
      pending={pending}
      onReview={(item, action) => setReviewRequest({ ids: [item.id], action })}
    />
  );

  const confirmationTitle =
    reviewRequest?.action === 'approve' ? copy.confirmApproveTitle : copy.confirmRejectTitle;
  const confirmationDescription = reviewRequest
    ? reviewRequest.ids.length > 1
      ? interpolateCopy(
          reviewRequest.action === 'approve' ? copy.confirmBulkApprove : copy.confirmBulkReject,
          { count: reviewRequest.ids.length },
        )
      : reviewRequest.action === 'approve'
        ? copy.confirmApprove
        : copy.confirmReject
    : '';

  return {
    view: {
      t,
      remainingTotal,
      expiredCount,
      pending,
      setDeleteExpiredRequest,
      initialData,
      filtersOpen,
      activeFilterCount,
      copy,
      setFiltersOpen,
      locale,
      selectedIds,
      selectionContainsExpired,
      setReviewRequest,
      proposals,
      allVisibleSelected,
      setSelectedIds,
      nowMs,
      effectiveSelected,
      toggleSelection,
      inspect,
      remainingTotalPages,
      router,
      isWideLayout,
      inspector,
      mobileInspectorOpen,
      setMobileInspectorOpen,
      reviewRequest,
      confirmationTitle,
      confirmationDescription,
      review,
      deleteExpiredRequest,
      deleteExpired,
    } as const,
    fallback: null,
  };
}
