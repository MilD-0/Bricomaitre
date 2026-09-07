'use client';
import { type LandingPageBlock } from '@bric/storefront-core/landing-pages';
import { ArrowLeft, ExternalLink, Eye } from 'lucide-react';
import Link from 'next/link';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/button';
import { CompactMenu, CompactMenuItem } from '../../ui/compact-menu';
import { FieldError } from '../../ui/field';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { Textarea } from '../../ui/textarea';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
} from '../../ui/workspace';
import { StructuredBlockEditor } from '../structured-block-editor';
import {
  blockSummary,
  commonTypes,
  moreTypes,
  type useLandingPageBuilder,
} from './use-landing-builder';

export function LandingPageBuilderView({
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
}: NonNullable<ReturnType<typeof useLandingPageBuilder>['view']>) {
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
                  {(block.type !== 'product-hero' && block.type !== 'final-cta') ||
                  document.blocks.filter((item) => item.type === block.type).length > 1 ? (
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
