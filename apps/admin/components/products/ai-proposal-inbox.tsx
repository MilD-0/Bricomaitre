'use client';

import { Bot, Check, ExternalLink, ShieldCheck, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import type { AiProposalInboxData } from '../../lib/ai-proposal-inbox';
import { toast } from '../../lib/toast';
import { Button } from '../ui/button';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function printable(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

function ProposalDiff({ payload }: { payload: unknown }) {
  const record = isRecord(payload) ? payload : null;
  const before = record && isRecord(record.before) ? record.before : null;
  const changes = record && isRecord(record.changes) ? record.changes : null;
  if (!changes) {
    return (
      <pre className="max-h-72 overflow-auto rounded-lg bg-muted/60 p-3 text-xs">
        {printable(payload)}
      </pre>
    );
  }
  return (
    <div className="space-y-2">
      {Object.entries(changes).map(([field, value]) => (
        <div key={field} className="grid gap-2 text-sm md:grid-cols-2">
          <div className="rounded-lg bg-muted/60 p-3">
            <p className="text-xs font-medium text-muted-foreground">{field} · before</p>
            <p className="mt-1 whitespace-pre-wrap break-words">{printable(before?.[field])}</p>
          </div>
          <div className="rounded-lg bg-emerald-500/10 p-3">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              {field} · proposed
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words">{printable(value)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function pageHref(data: AiProposalInboxData, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...data.query, page })) {
    if (value !== null && value !== '' && value !== 'all') params.set(key, String(value));
  }
  return `?${params.toString()}`;
}

export function AiProposalInbox({ initialData }: { initialData: AiProposalInboxData }) {
  const t = useTranslations('aiProposalInbox');
  const [proposals, setProposals] = useState(initialData.items);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, setPending] = useState(false);
  const selectedCount = selected.size;
  const expiredCount = useMemo(
    () => proposals.filter((proposal) => new Date(proposal.expiresAt) <= new Date()).length,
    [proposals],
  );

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function review(ids: number[], action: 'approve' | 'reject') {
    if (ids.length === 0) return;
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
    setProposals((current) => current.filter((proposal) => !completed.includes(proposal.id)));
    setSelected((current) => new Set([...current].filter((id) => !completed.includes(id))));
    if (failures.length > 0) toast.error(failures.join('\n'), { id: toastId });
    else
      toast.success(
        t(action === 'approve' ? 'approved' : 'rejected', { count: completed.length }),
        { id: toastId },
      );
    setPending(false);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Bot className="size-6 text-violet-500" aria-hidden="true" /> {t('title')}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t('description')}</p>
          {expiredCount > 0 ? (
            <p className="mt-2 text-sm text-amber-600">{t('expired', { count: expiredCount })}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending || selectedCount === 0}
            onClick={() => void review([...selected], 'reject')}
          >
            <X className="size-4" aria-hidden="true" />{' '}
            {t('rejectSelected', { count: selectedCount })}
          </Button>
          <Button
            type="button"
            disabled={pending || selectedCount === 0}
            onClick={() => void review([...selected], 'approve')}
          >
            <Check className="size-4" aria-hidden="true" />{' '}
            {t('approveSelected', { count: selectedCount })}
          </Button>
        </div>
      </header>

      <form className="grid gap-3 rounded-2xl border bg-card p-4 shadow-sm lg:grid-cols-6">
        <input type="hidden" name="page" value="1" />
        <input
          name="q"
          type="search"
          defaultValue={initialData.query.q ?? ''}
          placeholder={t('search')}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm lg:col-span-2"
        />
        <select
          name="proposalType"
          defaultValue={initialData.query.proposalType ?? ''}
          aria-label={t('proposalType')}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{t('allProposalTypes')}</option>
          {initialData.facets.proposalTypes.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          name="entityType"
          defaultValue={initialData.query.entityType ?? ''}
          aria-label={t('entityType')}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{t('allEntityTypes')}</option>
          {initialData.facets.entityTypes.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          name="model"
          defaultValue={initialData.query.model ?? ''}
          aria-label={t('model')}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{t('allModels')}</option>
          {initialData.facets.models.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          name="sort"
          defaultValue={initialData.query.sort}
          aria-label={t('sort')}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="newest">{t('sortNewest')}</option>
          <option value="oldest">{t('sortOldest')}</option>
          <option value="confidence">{t('sortConfidence')}</option>
          <option value="expires">{t('sortExpiry')}</option>
          <option value="type">{t('sortType')}</option>
        </select>
        <select
          name="expiry"
          defaultValue={initialData.query.expiry}
          aria-label={t('expiry')}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">{t('allExpiry')}</option>
          <option value="active">{t('activeOnly')}</option>
          <option value="expired">{t('expiredOnly')}</option>
        </select>
        <select
          name="evidence"
          defaultValue={initialData.query.evidence}
          aria-label={t('evidenceFilter')}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">{t('allEvidence')}</option>
          <option value="present">{t('withEvidence')}</option>
          <option value="missing">{t('withoutEvidence')}</option>
        </select>
        <select
          name="pageSize"
          defaultValue={String(initialData.query.pageSize)}
          aria-label={t('pageSize')}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {[10, 20, 50, 100].map((value) => (
            <option key={value} value={value}>
              {t('perPage', { count: value })}
            </option>
          ))}
        </select>
        <div className="flex gap-2 lg:col-span-3 lg:justify-end">
          <Button type="submit">{t('applyFilters')}</Button>
          <Link
            href="?"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground shadow-[var(--shadow-vapor)] hover:bg-accent"
          >
            {t('resetFilters')}
          </Link>
        </div>
      </form>

      <p className="text-sm text-muted-foreground">
        {t('resultCount', { count: initialData.pagination.total })}
      </p>

      {proposals.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <div className="space-y-4">
          {proposals.map((proposal) => {
            const expired = new Date(proposal.expiresAt) <= new Date();
            return (
              <article key={proposal.id} className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <label className="flex min-w-0 items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-4"
                      checked={selected.has(proposal.id)}
                      disabled={pending || expired}
                      onChange={() => toggle(proposal.id)}
                    />
                    <span>
                      <strong className="block break-words">{proposal.proposalType}</strong>
                      <span className="text-xs text-muted-foreground">
                        #{proposal.id} · {proposal.entityType} #{proposal.entityId} ·{' '}
                        {proposal.model}
                      </span>
                    </span>
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    {proposal.confidence !== null ? (
                      <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-violet-700 dark:text-violet-300">
                        {t('confidence', { value: Math.round(proposal.confidence * 100) })}
                      </span>
                    ) : null}
                    {expired ? (
                      <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-700">
                        {t('expiredBadge')}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4">
                  <ProposalDiff payload={proposal.payload} />
                </div>
                {proposal.reasoning ? (
                  <p className="mt-3 text-sm text-muted-foreground">{proposal.reasoning}</p>
                ) : null}

                <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                    <ShieldCheck className="size-4" aria-hidden="true" /> {t('evidence')}
                  </p>
                  {proposal.evidence.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">{t('noEvidence')}</p>
                  ) : (
                    <ul className="mt-2 space-y-2 text-sm">
                      {proposal.evidence.map((evidence, index) => (
                        <li key={`${evidence.label}:${index}`}>
                          {evidence.url ? (
                            <a
                              className="inline-flex items-center gap-1 underline"
                              href={evidence.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {evidence.label}{' '}
                              <ExternalLink className="size-3" aria-hidden="true" />
                            </a>
                          ) : (
                            <strong>{evidence.label}</strong>
                          )}
                          {evidence.excerpt ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {evidence.excerpt}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => void review([proposal.id], 'reject')}
                  >
                    {t('reject')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending || expired}
                    onClick={() => void review([proposal.id], 'approve')}
                  >
                    {t('approve')}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {initialData.pagination.totalPages > 1 ? (
        <nav className="flex items-center justify-between gap-4" aria-label={t('pagination')}>
          {initialData.pagination.page <= 1 ? (
            <Button variant="outline" size="sm" disabled>
              {t('previousPage')}
            </Button>
          ) : (
            <Link
              href={pageHref(initialData, initialData.pagination.page - 1)}
              className="inline-flex h-8 items-center justify-center rounded-xl bg-secondary px-3 text-xs font-semibold uppercase tracking-[0.05em] text-secondary-foreground shadow-[var(--shadow-vapor)] hover:bg-accent"
            >
              {t('previousPage')}
            </Link>
          )}
          <span className="text-sm text-muted-foreground">
            {t('pageOf', {
              page: initialData.pagination.page,
              total: initialData.pagination.totalPages,
            })}
          </span>
          {initialData.pagination.page >= initialData.pagination.totalPages ? (
            <Button variant="outline" size="sm" disabled>
              {t('nextPage')}
            </Button>
          ) : (
            <Link
              href={pageHref(initialData, initialData.pagination.page + 1)}
              className="inline-flex h-8 items-center justify-center rounded-xl bg-secondary px-3 text-xs font-semibold uppercase tracking-[0.05em] text-secondary-foreground shadow-[var(--shadow-vapor)] hover:bg-accent"
            >
              {t('nextPage')}
            </Link>
          )}
        </nav>
      ) : null}
    </div>
  );
}
