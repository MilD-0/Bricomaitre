'use client';
import { Check, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { humanizeProposalToken } from '../../../lib/ai-proposal-presentation';
import { formatRelativeTime } from '../../../lib/date-format';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Input } from '../../ui/input';
import { NativeSelect } from '../../ui/native-select';
import { SidePanel } from '../../ui/side-panel';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceToolbar,
} from '../../ui/workspace';
import { WorkspacePagination } from '../../ui/workspace-pagination';
import { pageHref, previewText, type useAiProposalWorkspace } from './use-proposals';

export function AiProposalWorkspaceView({
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
}: NonNullable<ReturnType<typeof useAiProposalWorkspace>['view']>) {
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
              <option value="newest">{t('sortNewest')}</option>
              <option value="oldest">{t('sortOldest')}</option>
              <option value="confidence">{t('sortConfidence')}</option>
              <option value="expires">{t('sortExpiry')}</option>
              <option value="type">{t('sortType')}</option>
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

          <div
            hidden={!filtersOpen}
            className={cn(
              'mt-3 gap-3 border-t border-border/50 pt-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
              filtersOpen ? 'grid' : 'hidden',
            )}
          >
            <NativeSelect
              name="proposalType"
              defaultValue={initialData.query.proposalType ?? ''}
              aria-label={t('proposalType')}
            >
              <option value="">{t('allProposalTypes')}</option>
              {initialData.facets.proposalTypes.map((value) => (
                <option key={value} value={value}>
                  {humanizeProposalToken(value)}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              name="entityType"
              defaultValue={initialData.query.entityType ?? ''}
              aria-label={t('entityType')}
            >
              <option value="">{t('allEntityTypes')}</option>
              {initialData.facets.entityTypes.map((value) => (
                <option key={value} value={value}>
                  {humanizeProposalToken(value)}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              name="model"
              defaultValue={initialData.query.model ?? ''}
              aria-label={t('model')}
            >
              <option value="">{t('allModels')}</option>
              {initialData.facets.models.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              name="expiry"
              defaultValue={initialData.query.expiry}
              aria-label={t('expiry')}
            >
              <option value="all">{t('allExpiry')}</option>
              <option value="active">{t('activeOnly')}</option>
              <option value="expired">{t('expiredOnly')}</option>
            </NativeSelect>
            <NativeSelect
              name="evidence"
              defaultValue={initialData.query.evidence}
              aria-label={t('evidenceFilter')}
            >
              <option value="all">{t('allEvidence')}</option>
              <option value="present">{t('withEvidence')}</option>
              <option value="missing">{t('withoutEvidence')}</option>
            </NativeSelect>
            <NativeSelect
              name="pageSize"
              defaultValue={String(initialData.query.pageSize)}
              aria-label={t('pageSize')}
            >
              {[10, 20, 50, 100].map((value) => (
                <option key={value} value={value}>
                  {t('perPage', { count: value })}
                </option>
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
                        className="min-w-0 text-start focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/30"
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
