'use client';

import { ChevronDown, ExternalLink, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { AiProposalInboxItem } from '../../lib/ai-proposal-inbox';
import {
  humanizeProposalToken,
  isExpandableProposalValue,
  proposalFields,
  proposalValueDetails,
  proposalValueSummary,
} from '../../lib/ai-proposal-presentation';
import { Button } from '../ui/button';

import type { ProposalReviewCopy } from './ai-proposal-workspace-copy';

function ProposalValue({ value }: { value: unknown }) {
  const summary = proposalValueSummary(value);
  if (!isExpandableProposalValue(value)) {
    return <span className="wrap-break-word text-sm text-foreground">{summary}</span>;
  }

  return (
    <details className="group text-sm">
      <summary className="cursor-pointer list-none text-foreground hover:text-primary">
        {summary}
        <ChevronDown
          className="ms-1 inline size-3.5 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap border-s-2 border-border/70 ps-3 text-xs leading-5 text-muted-foreground">
        {proposalValueDetails(value)}
      </pre>
    </details>
  );
}

export function AiProposalInspector({
  item,
  copy,
  locale,
  now,
  pending,
  onReview,
}: {
  item: AiProposalInboxItem | null;
  copy: ProposalReviewCopy;
  locale: string;
  now: number;
  pending: boolean;
  onReview: (item: AiProposalInboxItem, action: 'approve' | 'reject') => void;
}) {
  const t = useTranslations('aiProposalInbox');

  if (!item) {
    return (
      <div className="grid min-h-80 place-items-center px-6 text-center text-sm text-muted-foreground">
        {copy.selectPrompt}
      </div>
    );
  }

  const fields = proposalFields(item.payload);
  const expired = new Date(item.expiresAt).getTime() <= now;
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="min-w-0">
      <header className="border-b border-border/60 px-5 py-5 sm:px-6">
        <p className="text-xs font-medium uppercase tracking-[0.13em] text-primary">
          {humanizeProposalToken(item.proposalType)}
        </p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
            {humanizeProposalToken(item.entityType)} #{item.entityId}
          </h2>
          <div className="flex items-center gap-2 text-xs">
            {item.confidence !== null ? (
              <span className="font-medium text-violet-600 dark:text-violet-300">
                {t('confidence', { value: Math.round(item.confidence * 100) })}
              </span>
            ) : null}
            {expired ? (
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {t('expiredBadge')}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="divide-y divide-border/60">
        <section className="px-5 py-5 sm:px-6">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="font-semibold text-foreground">
              {fields.some((field) => field.hasBefore) ? copy.changes : copy.proposedFields}
            </h3>
            {fields.length > 0 ? (
              <span className="text-xs tabular-nums text-muted-foreground">{fields.length}</span>
            ) : null}
          </div>

          {fields.length > 0 ? (
            <div className="mt-3 divide-y divide-border/50 border-y border-border/50">
              {fields.map((field) => (
                <div
                  key={field.key}
                  className="grid gap-3 py-4 lg:grid-cols-[minmax(8rem,.6fr)_minmax(0,1fr)_minmax(0,1fr)]"
                >
                  <p className="text-sm font-medium text-foreground">
                    {humanizeProposalToken(field.key)}
                  </p>
                  {field.hasBefore ? (
                    <div>
                      <p className="mb-1 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                        {copy.current}
                      </p>
                      <ProposalValue value={field.before} />
                    </div>
                  ) : null}
                  <div className={field.hasBefore ? undefined : 'lg:col-span-2'}>
                    <p className="mb-1 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                      {copy.proposed}
                    </p>
                    <ProposalValue value={field.after} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <details className="group mt-3 border-y border-border/50 py-4">
              <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
                {copy.noStructuredChanges}
                <ChevronDown
                  className="ms-1 inline size-3.5 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                {proposalValueDetails(item.payload)}
              </pre>
            </details>
          )}
        </section>

        {item.reasoning ? (
          <section className="px-5 py-5 sm:px-6">
            <h3 className="font-semibold text-foreground">{copy.reasoning}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {item.reasoning}
            </p>
          </section>
        ) : null}

        <section className="px-5 py-5 sm:px-6">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <ShieldCheck className="size-4 text-violet-500" aria-hidden="true" />
            {t('evidence')}
          </h3>
          {item.evidence.length === 0 ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('noEvidence')}</p>
          ) : (
            <ul className="mt-3 divide-y divide-border/50 border-y border-border/50">
              {item.evidence.map((evidence, index) => (
                <li key={`${evidence.label}:${index}`} className="py-3 text-sm">
                  {evidence.url ? (
                    <a
                      className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
                      href={evidence.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {evidence.label}
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  ) : (
                    <strong className="font-medium text-foreground">{evidence.label}</strong>
                  )}
                  {evidence.excerpt ? (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {evidence.excerpt}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="px-5 py-5 sm:px-6">
          <h3 className="font-semibold text-foreground">{copy.provenance}</h3>
          <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">{copy.requestedBy}</dt>
              <dd className="mt-1 text-foreground">{item.requestedBy ?? copy.unknownRequester}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{copy.created}</dt>
              <dd className="mt-1 text-foreground">
                {dateFormatter.format(new Date(item.createdAt))}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{copy.expires}</dt>
              <dd className="mt-1 text-foreground">
                {dateFormatter.format(new Date(item.expiresAt))}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{copy.model}</dt>
              <dd className="mt-1 break-all text-foreground">{item.model}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{copy.task}</dt>
              <dd className="mt-1 text-foreground">{humanizeProposalToken(item.task)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{copy.reference}</dt>
              <dd className="mt-1 text-foreground">#{item.id}</dd>
            </div>
          </dl>

          {fields.length > 0 ? (
            <details className="group mt-5 border-t border-border/50 pt-4">
              <summary className="cursor-pointer list-none text-sm text-muted-foreground hover:text-foreground">
                {copy.exactPayload}
                <ChevronDown
                  className="ms-1 inline size-3.5 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                {proposalValueDetails(item.payload)}
              </pre>
            </details>
          ) : null}
        </section>
      </div>

      <footer className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border/60 bg-background/92 px-5 py-3 backdrop-blur sm:px-6">
        {expired ? (
          <span className="me-auto text-xs text-amber-600 dark:text-amber-400">
            {copy.expiredSelection}
          </span>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => onReview(item, 'reject')}
        >
          {t('reject')}
        </Button>
        <Button
          type="button"
          disabled={pending || expired}
          onClick={() => onReview(item, 'approve')}
        >
          {t('approve')}
        </Button>
      </footer>
    </div>
  );
}
