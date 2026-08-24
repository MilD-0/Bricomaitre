'use client';

import { Check, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import type { AiProposalInboxData, AiProposalInboxItem } from '../../lib/ai-proposal-inbox';
import { humanizeProposalToken, proposalPreview } from '../../lib/ai-proposal-presentation';
import { formatRelativeTime } from '../../lib/date-format';
import { toast } from '../../lib/toast';
import { cn } from '../../lib/utils';
import { AdminAiAskButton } from '../admin-ai-ask-button';
import { useAdminAiSurfaceDetails } from '../admin-ai-surface-context';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { NativeSelect, NativeSelectOption } from '../ui/native-select';
import { SidePanel } from '../ui/side-panel';
import { WorkspacePagination } from '../ui/workspace-pagination';
import { useMediaQuery } from '../ui/use-media-query';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceToolbar,
} from '../ui/workspace';

import { AiProposalInspector } from './ai-proposal-inspector';
import {
  getProposalReviewCopy,
  interpolateCopy,
  type ProposalReviewCopy,
} from './ai-proposal-workspace-copy';

const wideLayoutQuery = '(min-width: 1280px)';

function pageHref(data: AiProposalInboxData, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...data.query, page })) {
    if (value !== null && value !== '' && value !== 'all') params.set(key, String(value));
  }
  return `?${params.toString()}`;
}

function previewText(item: AiProposalInboxItem, copy: ProposalReviewCopy) {
  const preview = proposalPreview(item);
  switch (preview.kind) {
    case 'fields': {
      const fields = preview.fields.join(', ');
      return interpolateCopy(preview.remaining > 0 ? copy.fieldsChangedMore : copy.fieldsChanged, {
        fields,
        count: preview.remaining,
      });
    }
    case 'products':
      return interpolateCopy(copy.productsSelected, { count: preview.count });
    case 'landing':
      return interpolateCopy(copy.landingPage, { locale: preview.locale ?? '—' });
    case 'relation':
      return interpolateCopy(copy.relation, { relation: preview.relation ?? 'Product' });
    case 'payload':
      return preview.count > 0
        ? interpolateCopy(copy.payloadFields, { count: preview.count })
        : copy.noStructuredChanges;
  }
}

export function AiProposalWorkspace({
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

    setRemovedIds((current) => new Set([...current, ...completed]));
    setSelectedIds((current) => new Set([...current].filter((id) => !completed.includes(id))));
    if (completed.includes(selectedId ?? -1)) setMobileInspectorOpen(false);

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

    setRemovedIds((current) => new Set([...current, ...completed]));
    setSelectedIds((current) => new Set([...current].filter((id) => !completed.includes(id))));
    if (completed.includes(selectedId ?? -1)) setMobileInspectorOpen(false);
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

  return (
    <WorkspaceFrame className="pb-10" data-admin-workspace="ai-proposals">
      <WorkspaceHeader>
        <WorkspaceHeading
          title={t('title')}
          meta={t('resultCount', { count: remainingTotal })}
          description={
            expiredCount > 0 ? (
              <span className="text-amber-600 dark:text-amber-400">
                {t('expired', { count: expiredCount })}
              </span>
            ) : null
          }
        />
        <WorkspaceActions>
          <AdminAiAskButton />
          {expiredCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setDeleteExpiredRequest(true)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {t('deleteExpired')}
            </Button>
          ) : null}
        </WorkspaceActions>
      </WorkspaceHeader>

      <WorkspaceToolbar>
        <form data-mobile-proposal-filters>
          <input type="hidden" name="page" value="1" />
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 md:flex md:items-center">
            <Input
              name="q"
              type="search"
              defaultValue={initialData.query.q ?? ''}
              placeholder={t('search')}
              aria-label={t('search')}
              className="col-span-3 min-w-0 md:flex-1"
            />
            <NativeSelect
              name="sort"
              defaultValue={initialData.query.sort}
              aria-label={t('sort')}
              className="min-w-0 md:w-48"
            >
              <NativeSelectOption value="newest">{t('sortNewest')}</NativeSelectOption>
              <NativeSelectOption value="oldest">{t('sortOldest')}</NativeSelectOption>
              <NativeSelectOption value="confidence">{t('sortConfidence')}</NativeSelectOption>
              <NativeSelectOption value="expires">{t('sortExpiry')}</NativeSelectOption>
              <NativeSelectOption value="type">{t('sortType')}</NativeSelectOption>
            </NativeSelect>
            <div className="contents md:flex md:gap-2">
              <Button type="submit" aria-label={t('applyFilters')}>
                <Search className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t('applyFilters')}</span>
              </Button>
              <Button
                type="button"
                variant={filtersOpen || activeFilterCount > 0 ? 'default' : 'outline'}
                aria-label={copy.filters}
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <SlidersHorizontal className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">{copy.filters}</span>
                {activeFilterCount > 0 ? activeFilterCount : null}
              </Button>
            </div>
          </div>

          {filtersOpen ? (
            <div className="mt-3 grid gap-3 border-t border-border/50 pt-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <NativeSelect
                name="proposalType"
                defaultValue={initialData.query.proposalType ?? ''}
                aria-label={t('proposalType')}
              >
                <NativeSelectOption value="">{t('allProposalTypes')}</NativeSelectOption>
                {initialData.facets.proposalTypes.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {humanizeProposalToken(value)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect
                name="entityType"
                defaultValue={initialData.query.entityType ?? ''}
                aria-label={t('entityType')}
              >
                <NativeSelectOption value="">{t('allEntityTypes')}</NativeSelectOption>
                {initialData.facets.entityTypes.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {humanizeProposalToken(value)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect
                name="model"
                defaultValue={initialData.query.model ?? ''}
                aria-label={t('model')}
              >
                <NativeSelectOption value="">{t('allModels')}</NativeSelectOption>
                {initialData.facets.models.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {value}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect
                name="expiry"
                defaultValue={initialData.query.expiry}
                aria-label={t('expiry')}
              >
                <NativeSelectOption value="all">{t('allExpiry')}</NativeSelectOption>
                <NativeSelectOption value="active">{t('activeOnly')}</NativeSelectOption>
                <NativeSelectOption value="expired">{t('expiredOnly')}</NativeSelectOption>
              </NativeSelect>
              <NativeSelect
                name="evidence"
                defaultValue={initialData.query.evidence}
                aria-label={t('evidenceFilter')}
              >
                <NativeSelectOption value="all">{t('allEvidence')}</NativeSelectOption>
                <NativeSelectOption value="present">{t('withEvidence')}</NativeSelectOption>
                <NativeSelectOption value="missing">{t('withoutEvidence')}</NativeSelectOption>
              </NativeSelect>
              <NativeSelect
                name="pageSize"
                defaultValue={String(initialData.query.pageSize)}
                aria-label={t('pageSize')}
              >
                {[10, 20, 50, 100].map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {t('perPage', { count: value })}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {activeFilterCount > 0 || initialData.query.q ? (
                <Link
                  href={`/${locale}/ai-proposals`}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground sm:col-span-2 lg:col-span-3 xl:col-span-6"
                >
                  {t('resetFilters')}
                </Link>
              ) : null}
            </div>
          ) : null}
        </form>
      </WorkspaceToolbar>

      {selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-muted/35 px-3 py-2">
          <span className="me-auto text-sm font-medium">
            {selectedIds.size} {copy.selected}
          </span>
          {selectionContainsExpired ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {copy.expiredSelection}
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setReviewRequest({ ids: [...selectedIds], action: 'reject' })}
          >
            <X className="size-4" aria-hidden="true" />
            {t('rejectSelected', { count: selectedIds.size })}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || selectionContainsExpired}
            onClick={() => setReviewRequest({ ids: [...selectedIds], action: 'approve' })}
          >
            <Check className="size-4" aria-hidden="true" />
            {t('approveSelected', { count: selectedIds.size })}
          </Button>
        </div>
      ) : null}

      <div
        data-testid="proposal-review-workspace"
        className="grid min-h-0 border-b border-border/70 xl:h-[calc(100dvh-13.5rem)] xl:min-h-[32rem] xl:max-h-[48rem] xl:grid-cols-[minmax(21rem,.78fr)_minmax(31rem,1.22fr)]"
      >
        <div className="min-w-0 border-border/60 xl:overflow-y-auto xl:border-e">
          {proposals.length === 0 ? (
            <div className="grid min-h-72 place-items-center px-6 text-center text-sm text-muted-foreground">
              {t('empty')}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-border/50 px-4 py-2 sm:px-5">
                <Checkbox
                  checked={allVisibleSelected}
                  aria-label={copy.selectAll}
                  disabled={pending}
                  onChange={(event) =>
                    setSelectedIds(
                      event.target.checked
                        ? new Set(proposals.map((proposal) => proposal.id))
                        : new Set(),
                    )
                  }
                />
                <span className="text-xs text-muted-foreground">
                  {t('resultCount', { count: proposals.length })}
                </span>
              </div>
              <div className="divide-y divide-border/50">
                {proposals.map((proposal) => {
                  const expired = new Date(proposal.expiresAt).getTime() <= nowMs;
                  const active = proposal.id === effectiveSelected?.id;
                  return (
                    <section
                      key={proposal.id}
                      className={cn(
                        'grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3 px-4 py-3.5 transition-colors hover:bg-muted/25 sm:px-5',
                        active && 'bg-primary/6',
                      )}
                    >
                      <Checkbox
                        checked={selectedIds.has(proposal.id)}
                        aria-label={`${copy.select} ${humanizeProposalToken(proposal.proposalType)} #${proposal.id}`}
                        disabled={pending}
                        onChange={() => toggleSelection(proposal.id)}
                      />
                      <button
                        type="button"
                        className="min-w-0 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                        aria-current={active ? 'true' : undefined}
                        onClick={() => inspect(proposal)}
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0 truncate font-medium text-foreground">
                            {humanizeProposalToken(proposal.proposalType)}
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-xs">
                            {proposal.confidence !== null ? (
                              <span className="text-violet-600 dark:text-violet-300">
                                {Math.round(proposal.confidence * 100)}%
                              </span>
                            ) : null}
                            {expired ? (
                              <span className="font-medium text-amber-600 dark:text-amber-400">
                                {t('expiredBadge')}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                          {previewText(proposal, copy)}
                        </span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span>
                            {humanizeProposalToken(proposal.entityType)} #{proposal.entityId}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{proposal.model}</span>
                          <span aria-hidden="true">·</span>
                          <time
                            dateTime={proposal.createdAt}
                            title={new Date(proposal.createdAt).toLocaleString(locale)}
                          >
                            {formatRelativeTime(proposal.createdAt, locale)}
                          </time>
                        </span>
                      </button>
                    </section>
                  );
                })}
              </div>
            </>
          )}

          <WorkspacePagination
            currentPage={initialData.pagination.page}
            totalPages={remainingTotalPages}
            onPageChange={(page) => router.push(pageHref(initialData, page))}
          />
        </div>

        <aside className="hidden min-w-0 overflow-y-auto bg-muted/8 xl:block">
          {isWideLayout ? inspector : null}
        </aside>
      </div>

      <SidePanel
        open={!isWideLayout && mobileInspectorOpen && effectiveSelected !== null}
        onOpenChange={setMobileInspectorOpen}
        title={
          effectiveSelected
            ? humanizeProposalToken(effectiveSelected.proposalType)
            : copy.reviewDetails
        }
        description={
          effectiveSelected
            ? `${humanizeProposalToken(effectiveSelected.entityType)} #${effectiveSelected.entityId}`
            : undefined
        }
        closeLabel={copy.close}
        className="sm:max-w-[48rem]"
      >
        {inspector}
      </SidePanel>

      <Dialog
        open={reviewRequest !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setReviewRequest(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmationTitle}</DialogTitle>
            <DialogDescription>{confirmationDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setReviewRequest(null)}
            >
              {copy.cancel}
            </Button>
            <Button
              type="button"
              variant={reviewRequest?.action === 'reject' ? 'destructive' : 'default'}
              disabled={!reviewRequest || pending}
              onClick={() => {
                if (reviewRequest) void review(reviewRequest.ids, reviewRequest.action);
              }}
            >
              {reviewRequest?.action === 'approve' ? t('approve') : t('reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteExpiredRequest}
        onOpenChange={(open) => {
          if (!open && !pending) setDeleteExpiredRequest(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('deleteExpiredTitle')}</DialogTitle>
            <DialogDescription>
              {t('deleteExpiredDescription', { count: expiredCount })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setDeleteExpiredRequest(false)}
            >
              {copy.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => void deleteExpired()}
            >
              {t('deleteExpired')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspaceFrame>
  );
}
