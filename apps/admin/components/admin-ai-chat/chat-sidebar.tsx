import {
  Check,
  ChevronLeft,
  ChevronRight,
  MessageSquarePlus,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { isAdminAiScalar } from '../../lib/admin-ai-result-view';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Spinner } from '../ui/spinner';
import type { AiJob, ConversationSummary } from './types';

const ADMIN_AI_JOB_LABEL_KEYS: Record<string, string> = {
  ai_categorization: 'ai_categorization',
  ai_content: 'ai_content',
  product_export: 'product_export',
  catalog_feed_refresh: 'catalog_feed_refresh',
  order_export: 'order_export',
  order_ecotrack: 'order_ecotrack',
  stats_import: 'stats_import',
  ad_cost_import: 'ad_cost_import',
  reporting_refresh: 'reporting_refresh',
  ecotrack_catalog_sync: 'ecotrack_catalog_sync',
  ecotrack_shipment_sync: 'ecotrack_shipment_sync',
  'ai-product-categorization': 'ai_categorization',
  'ai-product-content': 'ai_content',
};

function safeAdminAiDownloadPath(value: string | null | undefined) {
  if (!value) return null;
  return value.startsWith('/') || /^https?:\/\//i.test(value) ? value : null;
}

export function ChatSidebar({
  mobileVisible,
  conversations,
  selectedConversationId,
  loading,
  jobs,
  cancellingJobId,
  search,
  onNewChat,
  onSearchChange,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onCancelJob,
  labelize,
}: {
  mobileVisible: boolean;
  conversations: ConversationSummary[];
  selectedConversationId: number | null;
  loading: boolean;
  jobs: AiJob[];
  cancellingJobId: string | null;
  search: string;
  onNewChat: () => void;
  onSearchChange: (value: string) => void;
  onSelectConversation: (conversation: ConversationSummary) => void;
  onRenameConversation: (conversation: ConversationSummary, title: string) => Promise<boolean>;
  onDeleteConversation: (conversation: ConversationSummary) => void;
  onCancelJob: (job: AiJob) => void;
  labelize: (value: string | undefined) => string;
}) {
  const t = useTranslations();
  const [jobIndex, setJobIndex] = useState(0);
  const [editingConversationId, setEditingConversationId] = useState<number | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const boundedJobIndex = Math.min(jobIndex, Math.max(0, jobs.length - 1));
  const selectedJob = jobs[boundedJobIndex];

  return (
    <aside
      data-slot="admin-ai-sidebar"
      className={`${mobileVisible ? 'flex' : 'hidden'} col-start-1 row-start-2 min-h-0 min-w-0 w-full flex-col bg-secondary/20 lg:col-auto lg:row-auto lg:flex lg:border-s`}
      aria-label={t('aiChat.chats')}
    >
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-4 sm:px-5">
        <h3 className="text-sm font-semibold">{t('aiChat.chats')}</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 normal-case tracking-normal"
          onClick={onNewChat}
        >
          <MessageSquarePlus className="size-3.5" />
          {t('aiChat.newChat')}
        </Button>
      </div>
      <div className="relative border-b border-border/60 px-3 py-2 sm:px-4">
        <Search className="pointer-events-none absolute start-6 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground sm:start-7" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-9 ps-8 text-xs"
          aria-label={t('aiChat.searchChats')}
          placeholder={t('aiChat.searchChats')}
        />
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3 sm:p-4">
        {loading ? (
          <div
            className="flex items-center gap-2 rounded-lg bg-card px-3 py-3 text-xs text-muted-foreground"
            role="status"
          >
            <Spinner className="size-3.5" />
            {t('aiChat.loadingChats')}
          </div>
        ) : (
          <>
            {conversations.map((conversation) => {
              const title = conversation.title || t('aiChat.untitledChat');
              if (editingConversationId === conversation.id)
                return (
                  <form
                    key={conversation.id}
                    className="flex items-center gap-1 rounded-lg bg-card p-1"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (await onRenameConversation(conversation, titleDraft))
                        setEditingConversationId(null);
                    }}
                  >
                    <Input
                      autoFocus
                      value={titleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      maxLength={80}
                      className="h-8 min-w-0 flex-1 text-xs"
                      aria-label={t('aiChat.renameChat')}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      className="size-8 p-0"
                      disabled={!titleDraft.trim()}
                      aria-label={t('aiChat.saveChatTitle')}
                    >
                      <Check className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="size-8 p-0"
                      onClick={() => setEditingConversationId(null)}
                      aria-label={t('aiChat.cancelChatRename')}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </form>
                );
              return (
                <div
                  key={conversation.id}
                  className={
                    selectedConversationId === conversation.id
                      ? 'group flex items-center rounded-lg bg-primary text-primary-foreground'
                      : 'group flex items-center rounded-lg bg-card text-foreground hover:bg-secondary'
                  }
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate px-3 py-2 text-start text-xs font-medium"
                    onClick={() => onSelectConversation(conversation)}
                  >
                    {title}
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="size-8 shrink-0 p-0 opacity-70 hover:opacity-100"
                    onClick={() => {
                      setTitleDraft(title);
                      setEditingConversationId(conversation.id);
                    }}
                    aria-label={`${t('aiChat.renameChat')} ${title}`}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="me-1 size-8 shrink-0 p-0 opacity-70 hover:opacity-100"
                    onClick={() => onDeleteConversation(conversation)}
                    aria-label={`${t('aiChat.deleteChat')} ${title}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              );
            })}
            {conversations.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">
                {search ? t('aiChat.noMatchingChats') : t('aiChat.noChats')}
              </p>
            ) : null}
          </>
        )}
      </div>
      {jobs.length > 0 ? (
        <div className="border-t border-border/60 p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-foreground">{t('aiChat.backgroundJobs')}</p>
            {jobs.length > 1 ? (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="size-7 p-0"
                  onClick={() =>
                    setJobIndex((current) => (current - 1 + jobs.length) % jobs.length)
                  }
                  aria-label={t('aiChat.previousJob')}
                >
                  <ChevronLeft className="size-3.5 rtl:rotate-180" />
                </Button>
                <span className="min-w-8 text-center text-[0.68rem] tabular-nums text-muted-foreground">
                  {boundedJobIndex + 1}/{jobs.length}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="size-7 p-0"
                  onClick={() => setJobIndex((current) => (current + 1) % jobs.length)}
                  aria-label={t('aiChat.nextJob')}
                >
                  <ChevronRight className="size-3.5 rtl:rotate-180" />
                </Button>
              </div>
            ) : null}
          </div>
          {selectedJob
            ? (() => {
                const job = selectedJob;
                const active = job.status === 'queued' || job.status === 'running';
                const downloadPath = safeAdminAiDownloadPath(job.downloadPath);
                const summary = job.resultSummary ?? {};
                const summaryEntries = Object.entries(summary)
                  .filter((entry): entry is [string, string | number | boolean | null] =>
                    isAdminAiScalar(entry[1]),
                  )
                  .slice(0, 6);
                const labelKey = ADMIN_AI_JOB_LABEL_KEYS[job.type ?? job.kind];
                return (
                  <div className="relative pb-2">
                    {jobs.length > 2 ? (
                      <div
                        className="absolute inset-x-4 bottom-0 top-4 rounded-xl border border-border/30 bg-card/35"
                        aria-hidden="true"
                      />
                    ) : null}
                    {jobs.length > 1 ? (
                      <div
                        className="absolute inset-x-2 bottom-1 top-2 rounded-xl border border-border/45 bg-card/65"
                        aria-hidden="true"
                      />
                    ) : null}
                    <section
                      key={`${job.queue}:${job.id}`}
                      className="relative rounded-xl border border-border/60 bg-card p-3 shadow-[var(--shadow-vapor)]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">
                            {labelKey ? t(`aiChat.jobLabels.${labelKey}`) : labelize(job.kind)}
                          </p>
                          <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
                            {t(`aiChat.jobStatus.${job.status}`)}
                          </p>
                        </div>
                        {active && job.cancellable !== false ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={cancellingJobId !== null}
                            onClick={() => onCancelJob(job)}
                          >
                            {cancellingJobId === job.id ? <Spinner className="size-3.5" /> : null}
                            {t('aiChat.cancel')}
                          </Button>
                        ) : null}
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-primary transition-[width]"
                          style={{
                            width: `${Math.max(0, Math.min(job.progress.percentage, 100))}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1.5 text-[0.68rem] text-muted-foreground">
                        {job.progress.current}/{job.progress.total || '—'} ·{' '}
                        {job.progress.phase.replaceAll('-', ' ')}
                      </p>
                      {job.kind === 'ai-product-categorization' &&
                      Object.keys(summary).length > 0 ? (
                        <p className="mt-2 text-[0.68rem] leading-5 text-muted-foreground">
                          {t('aiChat.categorizationSummary', {
                            proposed: Number(summary.proposed ?? 0),
                            applied: Number(summary.applied ?? 0),
                            unchanged: Number(summary.unchanged ?? 0),
                            ambiguous: Number(summary.ambiguous ?? 0),
                            failed: Number(summary.failed ?? 0),
                          })}
                        </p>
                      ) : null}
                      {job.kind !== 'ai-product-categorization' && summaryEntries.length > 0 ? (
                        <p className="mt-2 text-[0.68rem] leading-5 text-muted-foreground">
                          {summaryEntries
                            .map(([key, value]) => `${labelize(key)}: ${String(value ?? '—')}`)
                            .join(' · ')}
                        </p>
                      ) : null}
                      {Number(summary.autoApplyFailed ?? 0) > 0 ? (
                        <p className="mt-2 text-[0.68rem] leading-5 text-amber-700 dark:text-amber-300">
                          {t('aiChat.autoApplyFailed', {
                            count: Number(summary.autoApplyFailed),
                          })}
                        </p>
                      ) : null}
                      {job.errorMessage ? (
                        <p className="mt-2 text-[0.68rem] text-destructive">{job.errorMessage}</p>
                      ) : null}
                      {job.status === 'completed' && downloadPath ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-3"
                          onClick={() => window.open(downloadPath, '_blank', 'noopener,noreferrer')}
                        >
                          {t('aiChat.downloadArtifact')}
                        </Button>
                      ) : null}
                    </section>
                  </div>
                );
              })()
            : null}
        </div>
      ) : null}
    </aside>
  );
}
