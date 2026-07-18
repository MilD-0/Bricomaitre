'use client';

import { Bot, CheckCircle2, Clock3, History, Send, Sparkles, X, XCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Spinner } from './ui/spinner';
import { Textarea } from './ui/textarea';

type AnalyticsResult = {
  query?: string;
  source?: string;
  definition?: string;
  data?: unknown;
  caveats?: string[];
  comparison?: boolean;
  currentPeriod?: { startDate: string; endDate: string; data: unknown };
  previousPeriod?: { startDate: string; endDate: string; data: unknown };
  deltas?: Record<string, { current: number; previous: number; absolute: number; percent: number | null }>;
};
type ChatMessage = { role: 'user' | 'assistant'; content: string; analytics?: AnalyticsResult[] };
type Proposal = { id: number; type: string; status: string; entityType: string; entityId: number; reasoning: string | null; createdAt: string };
type AiJob = { id: string; status: string; progress: { phase?: string; current?: number; total?: number } | null; resultSummary: Record<string, unknown> | null; errorMessage: string | null };

function isScalar(value: unknown): value is string | number | boolean | null {
  return value == null || ['string', 'number', 'boolean'].includes(typeof value);
}

function resultFromUnknown(value: unknown, depth = 0): AnalyticsResult[] {
  if (depth > 5 || value == null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => resultFromUnknown(item, depth + 1));
  if (typeof value !== 'object') return [];
  const item = value as Record<string, unknown>;
  return [
    ...(typeof item.query === 'string' && ('data' in item || item.comparison === true) ? [item as AnalyticsResult] : []),
    ...Object.values(item).flatMap((child) => resultFromUnknown(child, depth + 1)),
  ];
}

function queryLabel(value: string | undefined) {
  return value?.replaceAll('_', ' ') ?? '';
}

function AnalyticsCard({ result }: { result: AnalyticsResult }) {
  const t = useTranslations();
  const locale = useLocale();
  const displayValue = (value: unknown) => {
    if (typeof value === 'number') return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
    if (value == null) return '—';
    if (typeof value === 'boolean') return value ? t('aiChat.yes') : t('aiChat.no');
    return String(value);
  };

  if (result.comparison && result.currentPeriod && result.previousPeriod && result.deltas) {
    const rows = Object.entries(result.deltas).slice(0, 8);
    return (
      <section className="mt-4 overflow-hidden rounded-[1.15rem] border border-border/60 bg-card shadow-[var(--shadow-vapor)]">
        <div className="border-b border-border/60 bg-secondary/35 px-4 py-3">
          <p className="text-xs font-semibold capitalize text-foreground">{queryLabel(result.query)}</p>
          <p className="mt-1 text-[0.68rem] text-muted-foreground">
            {result.currentPeriod.startDate}–{result.currentPeriod.endDate} {t('aiChat.vs')} {result.previousPeriod.startDate}–{result.previousPeriod.endDate}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border/50 sm:grid-cols-4">
          {rows.map(([key, delta]) => (
            <div key={key} className="bg-card px-3 py-3">
              <p className="truncate text-[0.66rem] text-muted-foreground">{queryLabel(key)}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{displayValue(delta.current)}</p>
              <p className={delta.absolute >= 0 ? 'mt-0.5 text-[0.68rem] font-medium text-emerald-600' : 'mt-0.5 text-[0.68rem] font-medium text-destructive'}>
                {delta.percent == null ? '—' : `${delta.percent >= 0 ? '+' : ''}${(delta.percent * 100).toFixed(1)}%`}
              </p>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto px-3 pb-3 pt-2">
          <table className="w-full min-w-[30rem] text-start text-xs">
            <thead><tr className="text-muted-foreground"><th className="border-b px-2 py-2 font-medium">{t('aiChat.metric')}</th><th className="border-b px-2 py-2 font-medium">{t('aiChat.current')}</th><th className="border-b px-2 py-2 font-medium">{t('aiChat.previous')}</th><th className="border-b px-2 py-2 font-medium">{t('aiChat.change')}</th></tr></thead>
            <tbody>{rows.map(([key, delta]) => <tr key={key}><td className="border-b border-border/45 px-2 py-2 font-medium capitalize">{queryLabel(key)}</td><td className="border-b border-border/45 px-2 py-2">{displayValue(delta.current)}</td><td className="border-b border-border/45 px-2 py-2">{displayValue(delta.previous)}</td><td className={delta.absolute >= 0 ? 'border-b border-border/45 px-2 py-2 text-emerald-600' : 'border-b border-border/45 px-2 py-2 text-destructive'}>{displayValue(delta.absolute)} ({delta.percent == null ? '—' : `${(delta.percent * 100).toFixed(1)}%`})</td></tr>)}</tbody>
          </table>
        </div>
        {result.caveats?.length ? <p className="border-t border-border/50 px-4 py-3 text-[0.68rem] leading-5 text-muted-foreground">{result.caveats[0]}</p> : null}
      </section>
    );
  }

  const data = result.data;
  const rows = Array.isArray(data) ? data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object').slice(0, 10) : [];
  const summary = !Array.isArray(data) && data && typeof data === 'object'
    ? Object.entries(data as Record<string, unknown>).filter(([, value]) => isScalar(value)).slice(0, 10)
    : [];
  const columns = rows.length ? Object.keys(rows[0]).filter((key) => rows.some((row) => isScalar(row[key]))).slice(0, 8) : [];
  const labelKey = columns.find((key) => ['title', 'name', 'promoCode', 'sku', 'risk'].includes(key));
  const valueKey = columns.find((key) => ['purchases', 'unitsSold', 'orders', 'views', 'inventoryQuantity', 'discountAmount'].includes(key));

  return (
    <section className="mt-4 overflow-hidden rounded-[1.15rem] border border-border/60 bg-card shadow-[var(--shadow-vapor)]">
      <div className="border-b border-border/60 bg-secondary/35 px-4 py-3">
        <p className="text-xs font-semibold capitalize text-foreground">{queryLabel(result.query)}</p>
        {result.definition ? <p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">{result.definition}</p> : null}
      </div>
      {summary.length ? <div className="grid grid-cols-2 gap-px bg-border/50 sm:grid-cols-4">{summary.map(([key, value]) => <div key={key} className="bg-card px-3 py-3"><p className="truncate text-[0.66rem] capitalize text-muted-foreground">{queryLabel(key)}</p><p className="mt-1 text-sm font-semibold text-foreground">{displayValue(value)}</p></div>)}</div> : null}
      {rows.length && labelKey && valueKey ? <div className="h-48 px-3 pb-2 pt-4"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} /><XAxis dataKey={labelKey} tick={{ fontSize: 10 }} interval="preserveStartEnd" /><YAxis tick={{ fontSize: 10 }} width={42} /><Tooltip formatter={(value) => displayValue(value)} contentStyle={{ borderRadius: '12px', borderColor: 'var(--border)' }} /><Bar dataKey={valueKey} fill="var(--primary)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div> : null}
      {rows.length ? <div className="overflow-x-auto px-3 pb-3"><table className="w-full min-w-[28rem] text-start text-xs"><thead><tr className="text-muted-foreground">{columns.map((column) => <th key={column} className="border-b px-2 py-2 font-medium capitalize">{queryLabel(column)}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column} className="border-b border-border/45 px-2 py-2">{displayValue(row[column])}</td>)}</tr>)}</tbody></table></div> : null}
      {result.caveats?.length ? <p className="border-t border-border/50 px-4 py-3 text-[0.68rem] leading-5 text-muted-foreground">{result.caveats[0]}</p> : null}
    </section>
  );
}

function ActivityPanel({ jobs, proposals, onCancel, onReview }: { jobs: AiJob[]; proposals: Proposal[]; onCancel: () => void; onReview: (id: number, action: 'approve' | 'reject') => void }) {
  const t = useTranslations();
  return (
    <aside className="flex min-h-0 flex-col border-t border-border/60 bg-secondary/20 lg:border-s lg:border-t-0" aria-label={t('aiChat.history')}>
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-4 sm:px-5">
        <div><h3 className="flex items-center gap-2 text-sm font-semibold"><History className="size-4 text-primary" />{t('aiChat.history')}</h3><p className="mt-1 text-[0.68rem] text-muted-foreground">{t('aiChat.historyHint')}</p></div>
        {jobs.length + proposals.length > 0 ? <span className="rounded-full bg-primary/10 px-2 py-1 text-[0.65rem] font-semibold text-primary">{jobs.length + proposals.length}</span> : null}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
        {jobs.map((job) => {
          const progress = job.progress;
          const percent = progress?.total ? Math.min(100, Math.round(((progress.current ?? 0) / progress.total) * 100)) : null;
          const active = ['queued', 'running'].includes(job.status);
          return (
            <article key={job.id} className="rounded-[1.1rem] border border-border/60 bg-card p-3 shadow-[var(--shadow-vapor)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="flex items-center gap-1.5 text-xs font-semibold capitalize">{active ? <Clock3 className="size-3.5 text-primary" /> : <CheckCircle2 className="size-3.5 text-emerald-600" />}{queryLabel(job.status)}</p><p className="mt-1 truncate text-[0.66rem] text-muted-foreground">{progress?.phase ?? job.id}</p></div>
                {active ? <Button size="sm" variant="ghost" className="h-7 shrink-0 px-2 normal-case tracking-normal" onClick={onCancel}><XCircle className="size-3" />{t('aiChat.cancel')}</Button> : null}
              </div>
              {percent != null ? <div className="mt-3"><div className="mb-1 flex justify-between text-[0.62rem] text-muted-foreground"><span>{progress?.current ?? 0}/{progress?.total}</span><span>{percent}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} /></div></div> : null}
              {job.errorMessage ? <p className="mt-2 rounded-lg bg-destructive/10 px-2 py-1.5 text-[0.66rem] text-destructive">{job.errorMessage}</p> : null}
            </article>
          );
        })}
        {proposals.map((proposal) => (
          <article key={proposal.id} className="rounded-[1.1rem] border border-border/60 bg-card p-3 shadow-[var(--shadow-vapor)]">
            <div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold capitalize">#{proposal.id} · {queryLabel(proposal.type)}</span><span className="rounded-full bg-secondary px-2 py-1 text-[0.62rem] font-medium capitalize text-muted-foreground">{queryLabel(proposal.status)}</span></div>
            <p className="mt-2 line-clamp-3 text-[0.68rem] leading-5 text-muted-foreground">{proposal.reasoning || `${proposal.entityType} #${proposal.entityId}`}</p>
            {proposal.status === 'proposed' ? <div className="mt-3 grid grid-cols-2 gap-2"><Button size="sm" className="normal-case tracking-normal" onClick={() => onReview(proposal.id, 'approve')}>{t('aiChat.approve')}</Button><Button size="sm" variant="outline" className="normal-case tracking-normal" onClick={() => onReview(proposal.id, 'reject')}>{t('aiChat.reject')}</Button></div> : null}
          </article>
        ))}
        {proposals.length === 0 && jobs.length === 0 ? <div className="grid min-h-36 place-items-center rounded-[1.1rem] border border-dashed border-border/70 bg-card/55 p-5 text-center"><div><History className="mx-auto size-5 text-muted-foreground/60" /><p className="mt-2 text-xs text-muted-foreground">{t('aiChat.noHistory')}</p></div></div> : null}
      </div>
    </aside>
  );
}

export function AdminAiChat() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [jobs, setJobs] = useState<AiJob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const loadHistory = useCallback(async () => {
    const response = await fetch('/api/ai/history', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json() as { proposals: Proposal[]; jobs: AiJob[] };
    setProposals(data.proposals);
    setJobs(data.jobs);
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadHistory();
    const timer = window.setInterval(() => void loadHistory(), 3_000);
    return () => window.clearInterval(timer);
  }, [open, loadHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messages, pending]);

  async function review(id: number, action: 'approve' | 'reject') {
    await fetch(`/api/ai/proposals/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
    await loadHistory();
  }

  async function cancelJob() {
    await fetch('/api/ai/jobs/cancel', { method: 'POST' });
    await loadHistory();
  }

  async function send() {
    const message = input.trim();
    if (!message || pending) return;
    setMessages((items) => [...items, { role: 'user', content: message }]);
    setInput('');
    setPending(true);
    try {
      const response = await fetch('/api/ai/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message }) });
      const data = await response.json() as { message?: string; error?: string; toolResults?: unknown };
      const analytics = response.ok ? resultFromUnknown(data.toolResults) : [];
      setMessages((items) => [...items, { role: 'assistant', content: response.ok ? (data.message || t('aiChat.completed')) : (data.error || t('aiChat.error')), analytics }]);
      if (response.ok) await loadHistory();
    } catch {
      setMessages((items) => [...items, { role: 'assistant', content: t('aiChat.error') }]);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        className="group fixed bottom-4 end-4 z-30 size-12 rounded-[1rem] p-0 shadow-[var(--shadow-vapor-strong)] sm:bottom-6 sm:end-6 sm:h-12 sm:w-auto sm:px-4"
        onClick={() => setOpen(true)}
        aria-label={t('aiChat.open')}
      >
        <span className="relative grid place-items-center"><Bot className="size-5" /><Sparkles className="absolute -end-1.5 -top-1.5 size-2.5 text-amber-200" /></span>
        <span className="hidden sm:inline">{t('aiChat.open')}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[min(52rem,calc(100dvh-1rem))] max-h-[calc(100dvh-1rem)] max-w-[76rem] flex-col overflow-hidden rounded-[1.75rem] border border-border/60 bg-[var(--glass-surface)] p-0 sm:h-[min(52rem,calc(100vh-2rem))] sm:max-h-[calc(100vh-2rem)]">
          <DialogHeader className="relative shrink-0 border-b border-border/60 bg-card/75 px-4 py-4 pe-16 backdrop-blur-xl sm:px-6 sm:py-5 sm:pe-20">
            <div className="flex items-start gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-[1rem] bg-primary text-primary-foreground shadow-[var(--shadow-vapor)]"><Bot className="size-5" /></div>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><DialogTitle className="text-base sm:text-lg">{t('aiChat.title')}</DialogTitle><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 text-[0.62rem] font-semibold text-emerald-700 dark:text-emerald-400"><span className="size-1.5 rounded-full bg-emerald-500" />{t('aiChat.reviewMode')}</span></div><DialogDescription className="mt-1 max-w-3xl text-xs leading-5 sm:text-sm">{t('aiChat.description')}</DialogDescription></div>
            </div>
            <Button type="button" variant="ghost" className="absolute end-3 top-3 size-10 rounded-[0.9rem] p-0 sm:end-5 sm:top-5" onClick={() => setOpen(false)} aria-label={t('aiChat.close')}><X className="size-5" /></Button>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-rows-[minmax(25rem,1fr)_minmax(14rem,0.55fr)] lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-1">
            <section className="flex min-h-0 flex-col bg-background/45" aria-label={t('aiChat.conversation')}>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5" aria-live="polite">
                {messages.length === 0 ? (
                  <div className="mx-auto flex min-h-full max-w-xl items-center justify-center py-8 text-center">
                    <div><div className="mx-auto grid size-14 place-items-center rounded-[1.25rem] bg-primary/10 text-primary"><Sparkles className="size-6" /></div><h3 className="mt-4 text-base font-semibold text-foreground">{t('aiChat.emptyTitle')}</h3><p className="mx-auto mt-2 max-w-lg text-xs leading-6 text-muted-foreground sm:text-sm">{t('aiChat.examples')}</p><div className="mt-5 flex flex-wrap justify-center gap-2"><span className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-[0.68rem] text-muted-foreground">{t('aiChat.capabilityCatalog')}</span><span className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-[0.68rem] text-muted-foreground">{t('aiChat.capabilityAnalytics')}</span><span className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-[0.68rem] text-muted-foreground">{t('aiChat.capabilityPricing')}</span></div></div>
                  </div>
                ) : (
                  <div className="mx-auto max-w-3xl space-y-5">
                    {messages.map((message, index) => (
                      <article key={index} className={message.role === 'user' ? 'flex justify-end ps-10' : 'flex items-start gap-2.5 pe-2 sm:gap-3'}>
                        {message.role === 'assistant' ? <span className="grid size-8 shrink-0 place-items-center rounded-[0.8rem] bg-primary/10 text-primary"><Bot className="size-4" /></span> : null}
                        <div className={message.role === 'user' ? 'max-w-[88%] rounded-[1.2rem] rounded-ee-md bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground shadow-[var(--shadow-vapor)]' : 'min-w-0 max-w-[calc(100%-2.75rem)] rounded-[1.2rem] rounded-es-md border border-border/55 bg-card px-4 py-3 text-sm leading-6 text-foreground shadow-[var(--shadow-vapor)]'}>
                          <p className="whitespace-pre-wrap break-words">{message.content}</p>
                          {message.role === 'assistant' ? message.analytics?.map((result, analyticsIndex) => <AnalyticsCard key={`${result.query}-${analyticsIndex}`} result={result} />) : null}
                        </div>
                      </article>
                    ))}
                    {pending ? <div className="flex items-center gap-2.5 text-xs text-muted-foreground"><span className="grid size-8 place-items-center rounded-[0.8rem] bg-primary/10 text-primary"><Bot className="size-4" /></span><span className="flex items-center gap-2 rounded-full bg-card px-3 py-2 shadow-[var(--shadow-vapor)]"><Spinner className="size-3.5" />{t('aiChat.thinking')}</span></div> : null}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-border/60 bg-card/80 p-3 backdrop-blur-xl sm:p-4">
                <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[1.15rem] border border-border/70 bg-background p-2 shadow-[var(--shadow-vapor)] focus-within:border-primary/35 focus-within:ring-2 focus-within:ring-primary/10">
                  <Textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                    placeholder={t('aiChat.placeholder')}
                    aria-label={t('aiChat.placeholder')}
                    className="min-h-12 max-h-32 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:bg-transparent focus-visible:ring-0"
                  />
                  <Button type="button" className="size-10 shrink-0 rounded-[0.85rem] p-0" disabled={pending || !input.trim()} onClick={() => void send()} aria-label={t('aiChat.send')}><Send className="size-4" /></Button>
                </div>
                <p className="mx-auto mt-2 max-w-3xl px-1 text-[0.62rem] text-muted-foreground">{t('aiChat.sendHint')}</p>
              </div>
            </section>

            <ActivityPanel jobs={jobs} proposals={proposals} onCancel={() => void cancelJob()} onReview={(id, action) => void review(id, action)} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
