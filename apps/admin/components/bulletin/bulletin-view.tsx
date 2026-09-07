'use client';
import { LoaderCircle, MessageSquarePlus, Pin, RefreshCcw, SquarePen, X } from 'lucide-react';
import { FileUploadField } from '../file-upload-field';
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
import { Field, FieldContent, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { NativeSelect } from '../ui/native-select';
import { Textarea } from '../ui/textarea';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceToolbar,
} from '../ui/workspace';
import { WorkspacePagination } from '../ui/workspace-pagination';
import { normalizeAttachments, type useBulletinBoard } from './use-bulletin';

export function BulletinBoardView({
  t,
  boardQuery,
  refreshBoard,
  composerOpen,
  editingPost,
  cancelComposer,
  openComposer,
  allTags,
  activeTag,
  setActiveTag,
  setPage,
  sort,
  setSort,
  onSubmit,
  form,
  createMutation,
  updateMutation,
  attachmentsUploadingRef,
  setAttachmentsUploading,
  draftValues,
  busy,
  attachmentsUploading,
  pinnedPosts,
  renderPost,
  pagePosts,
  recentPosts,
  currentPage,
  totalPages,
  deletePost,
  setDeletePost,
  deleteMutation,
}: NonNullable<ReturnType<typeof useBulletinBoard>['view']>) {
  return (
    <WorkspaceFrame className="overflow-hidden" data-admin-workspace="bulletin">
      <WorkspaceHeader>
        <WorkspaceHeading
          title={t('title')}
          meta={t('sections.visibleCount', { count: boardQuery.data.pagination.totalItems })}
          description={
            boardQuery.isFetching ? (
              <span className="inline-flex items-center gap-1">
                <LoaderCircle className="size-3.5 animate-spin" />
                {t('feedback.refreshing')}
              </span>
            ) : null
          }
        />
        <WorkspaceActions>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refreshBoard()}
            disabled={boardQuery.isFetching}
          >
            <RefreshCcw
              data-icon="inline-start"
              className={boardQuery.isFetching ? 'animate-spin' : ''}
            />
            {t('actions.refresh')}
          </Button>
          <Button
            type="button"
            onClick={composerOpen && !editingPost ? cancelComposer : openComposer}
            disabled={!boardQuery.data.permissions.canPost}
          >
            <MessageSquarePlus data-icon="inline-start" />
            {composerOpen && !editingPost ? t('actions.closeComposer') : t('actions.openComposer')}
          </Button>
        </WorkspaceActions>
      </WorkspaceHeader>

      <WorkspaceToolbar className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
          {allTags.map((tag) => {
            const active = tag === activeTag;
            return (
              <Button
                key={tag}
                type="button"
                variant={active ? 'default' : 'outline'}
                size="sm"
                className="rounded-full"
                onClick={() => {
                  setActiveTag(tag);
                  setPage(1);
                }}
              >
                {tag === 'all' ? t('filters.allTags') : tag}
              </Button>
            );
          })}
        </div>

        <NativeSelect
          className="lg:w-56 lg:shrink-0"
          aria-label={t('filters.sortLabel')}
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as typeof sort);
            setPage(1);
          }}
        >
          <option value="updated-desc">{t('filters.sortUpdatedDesc')}</option>
          <option value="updated-asc">{t('filters.sortUpdatedAsc')}</option>
          <option value="created-desc">{t('filters.sortCreatedDesc')}</option>
        </NativeSelect>
      </WorkspaceToolbar>

      {composerOpen || editingPost ? (
        <section className="border-b border-border/60 px-3 py-4 sm:px-4 lg:px-5 lg:py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-foreground">
                {editingPost ? t('composer.editTitle') : t('composer.createTitle')}
              </p>
              <p className="text-sm text-muted-foreground">
                {editingPost ? t('composer.editDescription') : t('composer.createDescription')}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={cancelComposer}>
              <X />
            </Button>
          </div>

          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <Field data-invalid={Boolean(form.formState.errors.title)}>
              <FieldLabel htmlFor="bulletin-title">{t('composer.titleLabel')}</FieldLabel>
              <Input
                id="bulletin-title"
                aria-invalid={Boolean(form.formState.errors.title)}
                placeholder={t('composer.titlePlaceholder')}
                {...form.register('title')}
              />
              {form.formState.errors.title ? (
                <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
              ) : null}
            </Field>

            <Field data-invalid={Boolean(form.formState.errors.body)}>
              <FieldLabel htmlFor="bulletin-body">{t('composer.bodyLabel')}</FieldLabel>
              <Textarea
                id="bulletin-body"
                aria-invalid={Boolean(form.formState.errors.body)}
                placeholder={t('composer.bodyPlaceholder')}
                {...form.register('body')}
              />
              {form.formState.errors.body ? (
                <p className="text-xs text-destructive">{form.formState.errors.body.message}</p>
              ) : null}
            </Field>

            <Field data-invalid={Boolean(form.formState.errors.tagsInput)}>
              <FieldLabel htmlFor="bulletin-tags">{t('composer.tagsLabel')}</FieldLabel>
              <Input
                id="bulletin-tags"
                aria-invalid={Boolean(form.formState.errors.tagsInput)}
                placeholder={t('composer.tagsPlaceholder')}
                {...form.register('tagsInput')}
              />
              {form.formState.errors.tagsInput ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.tagsInput.message}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{t('composer.tagsHint')}</p>
              )}
            </Field>

            <FileUploadField
              uploadUrl="/api/uploads/bulletin"
              disabled={createMutation.isPending || updateMutation.isPending}
              onUploadingChange={(uploading) => {
                attachmentsUploadingRef.current = uploading;
                setAttachmentsUploading(uploading);
              }}
              label={t('composer.attachmentsLabel')}
              hint={t('composer.attachmentsHint')}
              value={normalizeAttachments(draftValues.attachments)}
              onChange={(files) =>
                form.setValue('attachments', files, { shouldDirty: true, shouldValidate: true })
              }
            />
            {form.formState.errors.attachments ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.attachments.message}
              </p>
            ) : null}

            <Field
              orientation="horizontal"
              className="border-y border-border/60 py-3 text-sm text-foreground"
            >
              <Checkbox
                id="bulletin-pinned"
                {...form.register('pinned')}
                disabled={
                  !boardQuery.data.permissions.canModerate && !editingPost?.permissions.canPin
                }
              />
              <FieldContent>
                <FieldLabel htmlFor="bulletin-pinned">{t('composer.pinLabel')}</FieldLabel>
              </FieldContent>
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={busy || attachmentsUploading || !boardQuery.data.permissions.canPost}
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <LoaderCircle data-icon="inline-start" className="animate-spin" />
                ) : (
                  <SquarePen data-icon="inline-start" />
                )}
                {editingPost ? t('actions.update') : t('actions.post')}
              </Button>
              <Button type="button" variant="outline" onClick={cancelComposer}>
                {t('actions.cancel')}
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {boardQuery.isLoading && boardQuery.data.posts.length === 0 ? (
        <div className="border-b border-border/60 px-3 py-8 sm:px-4 lg:px-5">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {t('feedback.loading')}
          </div>
        </div>
      ) : null}

      {boardQuery.isError ? (
        <div className="border-b border-destructive/30 bg-destructive/5 px-3 py-6 sm:px-4 lg:px-5">
          <p className="text-sm font-medium text-foreground">{t('feedback.loadError')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('feedback.retryHint')}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => void refreshBoard()}
          >
            {t('actions.refresh')}
          </Button>
        </div>
      ) : null}

      <div>
        {pinnedPosts.length > 0 ? (
          <section>
            <div className="flex items-center gap-2 border-b border-border/60 bg-muted/15 px-3 py-2.5 sm:px-4 lg:px-5">
              <Pin className="text-amber-600" />
              <p className="text-sm font-semibold uppercase tracking-[var(--type-tracking-p160)] text-muted-foreground">
                {t('sections.pinned')}
              </p>
            </div>
            <div className="divide-y divide-border/60">{pinnedPosts.map(renderPost)}</div>
          </section>
        ) : null}

        <section>
          <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/15 px-3 py-2.5 sm:px-4 lg:px-5">
            <p className="text-sm font-semibold uppercase tracking-[var(--type-tracking-p160)] text-muted-foreground">
              {t('sections.recent')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('sections.visibleCount', { count: boardQuery.data.pagination.totalItems })}
            </p>
          </div>

          {pagePosts.length === 0 && !boardQuery.isFetching && !boardQuery.isError ? (
            <div className="border-b border-border/60 px-3 py-10 sm:px-4 lg:px-5">
              <p className="text-sm font-medium text-foreground">{t('empty.title')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('empty.description')}</p>
            </div>
          ) : null}

          <div className="divide-y divide-border/60">{recentPosts.map(renderPost)}</div>
        </section>

        <WorkspacePagination
          currentPage={currentPage}
          totalPages={totalPages}
          pending={boardQuery.isFetching}
          onPageChange={setPage}
        />
      </div>

      <Dialog
        open={deletePost !== null}
        onOpenChange={(open) => {
          if (!open) setDeletePost(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('delete.title')}</DialogTitle>
            <DialogDescription>
              {t('delete.description', { title: deletePost?.title ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeletePost(null)}>
              {t('actions.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deletePost && deleteMutation.mutate(deletePost.id)}
            >
              {deleteMutation.isPending ? (
                <LoaderCircle data-icon="inline-start" className="animate-spin" />
              ) : null}
              {t('actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspaceFrame>
  );
}
