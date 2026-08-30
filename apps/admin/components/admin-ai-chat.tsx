'use client';

import { Bot, Maximize2, Minimize2, Sparkles, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import { consumeAdminAiChatResponse, type AdminAiChatStatus } from '../lib/admin-ai-chat-stream';
import { suggestionKeysForAdminAi } from '../lib/admin-ai-context';
import type { PermissionKey } from '../lib/permissions';
import { cn } from '../lib/utils';
import {
  ADMIN_AI_DEFAULT_MODEL,
  ADMIN_AI_DEFAULT_REASONING_EFFORT,
  ADMIN_AI_MODEL_OPTIONS,
  adminAiModelIdSchema,
  adminAiReasoningEffortSchema,
  getAdminAiModelOption,
  getDefaultAdminAiReasoningEffort,
  supportsAdminAiReasoningEffort,
  type AdminAiModelId,
  type AdminAiReasoningEffort,
} from '../lib/admin-ai-models';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Switch } from './ui/switch';
import { useAdminAiSurfaceContext } from './admin-ai-surface-context';
import { ADMIN_AI_OPEN_EVENT, notifyAdminAiMutation } from '../lib/admin-ai-events';
import { ChatSidebar } from './admin-ai-chat/chat-sidebar';
import { ConversationPanel } from './admin-ai-chat/conversation-panel';
import {
  hydrateChatMessage,
  notifyAdminAiToolMutations,
  presentationFromUnknown,
  queryLabel,
  type ChatMessage,
  type Proposal,
  type ProposalNextAction,
} from './admin-ai-chat/message-results';
import type { AiJob, ConversationSummary } from './admin-ai-chat/types';

export const ADMIN_AI_MODEL_STORAGE_KEY = 'bricomaitre:admin-ai:model';
export const ADMIN_AI_REASONING_EFFORT_STORAGE_KEY = 'bricomaitre:admin-ai:reasoning-effort';
export const ADMIN_AI_AUTO_ACCEPT_STORAGE_KEY = 'bricomaitre:admin-ai:auto-accept';

export function AdminAiChat({ permissions = [] }: { permissions?: PermissionKey[] }) {
  const t = useTranslations();
  const surfaceContext = useAdminAiSurfaceContext();
  const suggestionKeys = useMemo(
    () => suggestionKeysForAdminAi(surfaceContext, permissions),
    [permissions, surfaceContext],
  );
  const [open, setOpen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'conversation' | 'chats'>('conversation');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [receivingText, setReceivingText] = useState(false);
  const [activity, setActivity] = useState<AdminAiChatStatus | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [autoAcceptProposals, setAutoAcceptProposals] = useState(false);
  const [model, setModel] = useState<AdminAiModelId>(ADMIN_AI_DEFAULT_MODEL);
  const [reasoningEffort, setReasoningEffort] = useState<AdminAiReasoningEffort>(
    ADMIN_AI_DEFAULT_REASONING_EFFORT,
  );
  const [reviewingProposalId, setReviewingProposalId] = useState<number | null>(null);
  const [proposalReviewError, setProposalReviewError] = useState<{
    messageId: string;
    message: string;
    nextAction?: ProposalNextAction;
  } | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationSearch, setConversationSearch] = useState('');
  const deferredConversationSearch = useDeferredValue(conversationSearch.trim());
  const [jobs, setJobs] = useState<AiJob[]>([]);
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const hasActiveJobs = jobs.some((job) => job.status === 'queued' || job.status === 'running');
  const conversationKeyRef = useRef<string | null>(null);
  const activeConversationRef = useRef<ConversationSummary | null>(null);
  const conversationRequestRef = useRef(0);
  const responseAbortRef = useRef<AbortController | null>(null);
  const terminalJobIdsRef = useRef(new Set<string>());
  const refreshedTerminalJobIdsRef = useRef(new Set<string>());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const openAssistant = () => {
      setMobilePanel('conversation');
      setOpen(true);
    };
    window.addEventListener(ADMIN_AI_OPEN_EVENT, openAssistant);
    return () => window.removeEventListener(ADMIN_AI_OPEN_EVENT, openAssistant);
  }, []);
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => composerRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);
  const selectConversation = useCallback(async (conversation: ConversationSummary) => {
    const requestId = ++conversationRequestRef.current;
    activeConversationRef.current = conversation;
    conversationKeyRef.current = conversation.sessionKey;
    setSelectedConversationId(conversation.id);
    setLoadingConversation(true);
    setMessages([]);
    try {
      const response = await fetch(`/api/ai/conversations/${conversation.id}`, {
        cache: 'no-store',
      });
      if (!response.ok || requestId !== conversationRequestRef.current) return;
      const data = (await response.json()) as {
        messages: Array<ChatMessage & { toolResults?: unknown }>;
      };
      setMessages(data.messages.map(hydrateChatMessage));
      setInput('');
    } finally {
      if (requestId === conversationRequestRef.current) setLoadingConversation(false);
    }
  }, []);
  const reconcileTerminalJobs = useCallback(
    async (conversation: ConversationSummary, terminalJobIds: string[]) => {
      const delays = [0, 250, 500, 1_000, 2_000];
      for (const delay of delays) {
        if (delay > 0) await new Promise((resolve) => window.setTimeout(resolve, delay));
        if (activeConversationRef.current?.id !== conversation.id) return;
        const response = await fetch(`/api/ai/conversations/${conversation.id}`, {
          cache: 'no-store',
        });
        if (!response.ok || activeConversationRef.current?.id !== conversation.id) continue;
        const data = (await response.json()) as {
          messages: Array<ChatMessage & { toolResults?: unknown }>;
        };
        const hydrated = data.messages.map(hydrateChatMessage);
        setMessages(hydrated);
        const terminalMessages = new Map(
          hydrated.flatMap((message) =>
            message.terminal && message.jobId ? [[message.jobId, message] as const] : [],
          ),
        );
        for (const jobId of terminalJobIds) {
          const message = terminalMessages.get(jobId);
          if (
            message?.results?.some((result) => result.toolName === 'ecotrack_posting_terminal') &&
            !refreshedTerminalJobIdsRef.current.has(jobId)
          ) {
            refreshedTerminalJobIdsRef.current.add(jobId);
            notifyAdminAiMutation(['post_orders_to_ecotrack']);
          }
        }
        if (terminalJobIds.every((jobId) => terminalMessages.has(jobId))) return;
      }
    },
    [],
  );
  const loadConversations = useCallback(
    async (selectLatest = false) => {
      setLoadingConversations(true);
      try {
        const query = deferredConversationSearch
          ? `?q=${encodeURIComponent(deferredConversationSearch)}`
          : '';
        const response = await fetch(`/api/ai/conversations${query}`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = (await response.json()) as { conversations: ConversationSummary[] };
        setConversations(data.conversations);
        if (selectLatest && activeConversationRef.current === null && data.conversations[0]) {
          void selectConversation(data.conversations[0]);
        }
      } finally {
        setLoadingConversations(false);
      }
    },
    [deferredConversationSearch, selectConversation],
  );
  const loadAiHistory = useCallback(async () => {
    const response = await fetch('/api/ai/history', { cache: 'no-store' });
    if (!response.ok) return;
    const data = (await response.json()) as { jobs?: AiJob[] };
    const nextJobs = Array.isArray(data.jobs) ? data.jobs : [];
    setJobs(nextJobs);
    const terminalJobs = nextJobs.filter((job) =>
      ['completed', 'cancelled', 'failed'].includes(job.status),
    );
    const activeConversation = activeConversationRef.current;
    const newTerminalJobIds = terminalJobs
      .filter(
        (job) =>
          !terminalJobIdsRef.current.has(job.id) &&
          activeConversation !== null &&
          job.conversationId === activeConversation.id,
      )
      .map((job) => job.id);
    terminalJobIdsRef.current = new Set(terminalJobs.map((job) => job.id));
    if (newTerminalJobIds.length > 0 && activeConversation) {
      void reconcileTerminalJobs(activeConversation, newTerminalJobIds);
    }
  }, [reconcileTerminalJobs]);

  useEffect(() => {
    const autoAccept = window.localStorage.getItem(ADMIN_AI_AUTO_ACCEPT_STORAGE_KEY) === 'true';
    const storedModel = adminAiModelIdSchema.safeParse(
      window.localStorage.getItem(ADMIN_AI_MODEL_STORAGE_KEY),
    );
    const nextModel = storedModel.success ? storedModel.data : ADMIN_AI_DEFAULT_MODEL;
    const storedEffort = adminAiReasoningEffortSchema.safeParse(
      window.localStorage.getItem(ADMIN_AI_REASONING_EFFORT_STORAGE_KEY),
    );
    const nextEffort =
      storedEffort.success && supportsAdminAiReasoningEffort(nextModel, storedEffort.data)
        ? storedEffort.data
        : getDefaultAdminAiReasoningEffort(nextModel);
    queueMicrotask(() => {
      setAutoAcceptProposals(autoAccept);
      setModel(nextModel);
      setReasoningEffort(nextEffort);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    if (activeConversationRef.current) void selectConversation(activeConversationRef.current);
    void loadConversations(
      activeConversationRef.current === null && deferredConversationSearch.length === 0,
    );
  }, [deferredConversationSearch, open, loadConversations, selectConversation]);

  useEffect(() => {
    if (!open && !hasActiveJobs) return;
    const initial = window.setTimeout(() => void loadAiHistory(), 0);
    const interval = window.setInterval(() => void loadAiHistory(), 2_500);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [hasActiveJobs, loadAiHistory, open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messages, pending]);

  function newChat() {
    conversationRequestRef.current += 1;
    activeConversationRef.current = null;
    conversationKeyRef.current = crypto.randomUUID();
    setSelectedConversationId(null);
    setLoadingConversation(false);
    setMessages([]);
    setInput('');
  }

  async function renameConversation(conversation: ConversationSummary, title: string) {
    const normalized = title.trim();
    if (!normalized) return false;
    const response = await fetch(`/api/ai/conversations/${conversation.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: normalized }),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { conversation: ConversationSummary };
    setConversations((current) =>
      current.map((item) => (item.id === conversation.id ? data.conversation : item)),
    );
    if (activeConversationRef.current?.id === conversation.id)
      activeConversationRef.current = data.conversation;
    return true;
  }

  async function deleteConversation(conversation: ConversationSummary) {
    if (!window.confirm(t('aiChat.deleteChatConfirm'))) return;
    const response = await fetch(`/api/ai/conversations/${conversation.id}`, {
      method: 'DELETE',
    });
    if (!response.ok) return;
    setConversations((current) => current.filter((item) => item.id !== conversation.id));
    if (activeConversationRef.current?.id === conversation.id) newChat();
  }

  async function rateAssistantMessage(
    messageRecordId: number,
    feedback: 'helpful' | 'not_helpful',
  ) {
    const previous = messages.find(
      (message) => message.messageRecordId === messageRecordId,
    )?.feedback;
    setMessages((current) =>
      current.map((message) =>
        message.messageRecordId === messageRecordId ? { ...message, feedback } : message,
      ),
    );
    const response = await fetch(`/api/ai/messages/${messageRecordId}/feedback`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ feedback }),
    });
    if (!response.ok) {
      setMessages((current) =>
        current.map((message) =>
          message.messageRecordId === messageRecordId
            ? { ...message, feedback: previous }
            : message,
        ),
      );
    }
  }

  function updateModel(nextModel: AdminAiModelId) {
    const nextEffort = supportsAdminAiReasoningEffort(nextModel, reasoningEffort)
      ? reasoningEffort
      : getDefaultAdminAiReasoningEffort(nextModel);
    setModel(nextModel);
    setReasoningEffort(nextEffort);
    window.localStorage.setItem(ADMIN_AI_MODEL_STORAGE_KEY, nextModel);
    window.localStorage.setItem(ADMIN_AI_REASONING_EFFORT_STORAGE_KEY, nextEffort);
  }

  function updateAutoAcceptProposals(enabled: boolean) {
    setAutoAcceptProposals(enabled);
    window.localStorage.setItem(ADMIN_AI_AUTO_ACCEPT_STORAGE_KEY, String(enabled));
  }

  function updateReasoningEffort(nextEffort: AdminAiReasoningEffort) {
    if (!supportsAdminAiReasoningEffort(model, nextEffort)) return;
    setReasoningEffort(nextEffort);
    window.localStorage.setItem(ADMIN_AI_REASONING_EFFORT_STORAGE_KEY, nextEffort);
  }

  async function submitProposalReview(
    messageId: string,
    proposalId: number,
    action: 'approve' | 'reject',
  ) {
    setReviewingProposalId(proposalId);
    setProposalReviewError(null);
    try {
      const response = await fetch(`/api/ai/proposals/${proposalId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json()) as {
        error?: string;
        code?: string;
        nextAction?: ProposalNextAction;
        proposal?: { status?: Proposal['status']; verified?: boolean };
      };
      if (!response.ok || !data.proposal?.status) {
        setProposalReviewError({
          messageId,
          message: data.error ?? t('aiChat.proposalReviewError'),
          nextAction: data.nextAction,
        });
        return false;
      }
      if (data.proposal.status === 'applied' && data.proposal.verified !== true) {
        throw new Error(t('aiChat.proposalVerificationError'));
      }
      setMessages((items) =>
        items.map((message) =>
          message.id === messageId
            ? {
                ...message,
                proposals: message.proposals?.map((proposal) =>
                  proposal.id === proposalId
                    ? { ...proposal, status: data.proposal!.status! }
                    : proposal,
                ),
              }
            : message,
        ),
      );
      notifyAdminAiMutation(['review_ai_proposals']);
      return true;
    } catch (error) {
      setProposalReviewError({
        messageId,
        message: error instanceof Error ? error.message : t('aiChat.proposalReviewError'),
      });
      return false;
    } finally {
      setReviewingProposalId(null);
    }
  }

  async function send() {
    const message = input.trim();
    if (!message || pending || loadingConversation) return;
    conversationKeyRef.current ??= crypto.randomUUID();
    setMessages((items) => [...items, { role: 'user', content: message }]);
    setInput('');
    setPending(true);
    setReceivingText(false);
    setActivity(null);
    const assistantId = crypto.randomUUID();
    const abortController = new AbortController();
    responseAbortRef.current = abortController;
    let receivedText = false;
    let failedToolResults: unknown;
    let persistedFailure:
      | {
          message: string;
          conversation: ConversationSummary;
          messageId: number | null;
        }
      | undefined;
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message,
          conversationKey: conversationKeyRef.current,
          autoAcceptProposals,
          model,
          reasoningEffort,
          context: surfaceContext.surface === 'unknown' ? undefined : surfaceContext,
        }),
        signal: abortController.signal,
      });
      await consumeAdminAiChatResponse(response, {
        onStatus(status) {
          setActivity(status);
        },
        onTextDelta(delta) {
          receivedText = true;
          setReceivingText(true);
          setMessages((items) => {
            const existing = items.findIndex((item) => item.id === assistantId);
            if (existing < 0)
              return [...items, { id: assistantId, role: 'assistant', content: delta }];
            return items.map((item, index) =>
              index === existing ? { ...item, content: `${item.content}${delta}` } : item,
            );
          });
        },
        onResult(data) {
          const presentation = presentationFromUnknown(data.toolResults);
          notifyAdminAiToolMutations(presentation.results);
          setMessages((items) => {
            const existing = items.findIndex((item) => item.id === assistantId);
            if (existing < 0)
              return [
                ...items,
                {
                  id: assistantId,
                  messageRecordId: data.messageId ?? undefined,
                  role: 'assistant',
                  content: t('aiChat.completed'),
                  ...presentation,
                },
              ];
            return items.map((item, index) =>
              index === existing
                ? { ...item, messageRecordId: data.messageId ?? undefined, ...presentation }
                : item,
            );
          });
          conversationKeyRef.current = data.conversation.sessionKey;
          activeConversationRef.current = data.conversation;
          setSelectedConversationId(data.conversation.id);
        },
        onError(error) {
          failedToolResults = error.toolResults;
          persistedFailure = {
            message: error.message,
            conversation: error.conversation,
            messageId: error.messageId,
          };
          notifyAdminAiToolMutations(presentationFromUnknown(error.toolResults).results);
        },
      });
      await loadConversations();
      await loadAiHistory();
    } catch {
      if (!abortController.signal.aborted) {
        const presentation = presentationFromUnknown(failedToolResults);
        if (persistedFailure) {
          const failure = persistedFailure;
          setMessages((items) =>
            items.some((item) => item.id === assistantId)
              ? items.map((item) =>
                  item.id === assistantId
                    ? {
                        ...item,
                        messageRecordId: failure.messageId ?? undefined,
                        content: failure.message,
                        ...presentation,
                      }
                    : item,
                )
              : [
                  ...items,
                  {
                    id: assistantId,
                    messageRecordId: failure.messageId ?? undefined,
                    role: 'assistant',
                    content: failure.message,
                    ...presentation,
                  },
                ],
          );
          conversationKeyRef.current = failure.conversation.sessionKey;
          activeConversationRef.current = failure.conversation;
          setSelectedConversationId(failure.conversation.id);
          await loadConversations();
        } else if (receivedText) {
          setMessages((items) =>
            items.map((item) =>
              item.id === assistantId
                ? {
                    ...item,
                    content: `${item.content}\n\n${t('aiChat.interrupted')}`,
                    ...presentation,
                  }
                : item,
            ),
          );
        } else {
          setMessages((items) => [
            ...items,
            {
              id: assistantId,
              role: 'assistant',
              content: t('aiChat.error'),
              ...presentation,
            },
          ]);
        }
      }
    } finally {
      if (responseAbortRef.current === abortController) responseAbortRef.current = null;
      setPending(false);
      setReceivingText(false);
      setActivity(null);
    }
  }

  function cancelResponse() {
    responseAbortRef.current?.abort();
  }

  async function reviewProposal(
    messageId: string | undefined,
    proposalId: number,
    action: 'approve' | 'reject',
  ) {
    if (!messageId || reviewingProposalId !== null) return;
    await submitProposalReview(messageId, proposalId, action);
  }

  async function cancelJob(job: AiJob) {
    if (cancellingJobId !== null) return;
    setCancellingJobId(job.id);
    try {
      await fetch('/api/ai/jobs/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          job.type
            ? { type: job.type, jobId: job.id }
            : { kind: job.kind === 'ai-product-categorization' ? 'categorization' : 'content' },
        ),
      });
      await loadAiHistory();
    } finally {
      setCancellingJobId(null);
    }
  }

  return (
    <>
      <Button
        type="button"
        className="group fixed bottom-4 end-4 z-30 size-12 rounded-[var(--shape-radius-card)] p-0 shadow-[var(--shadow-vapor-strong)] sm:bottom-6 sm:end-6 sm:h-12 sm:w-auto sm:px-4"
        onClick={() => setOpen(true)}
        aria-label={t('aiChat.open')}
      >
        <span className="relative grid place-items-center">
          <Bot className="size-5" />
          <Sparkles className="absolute -end-1.5 -top-1.5 size-2.5 text-amber-200" />
        </span>
        <span className="hidden sm:inline">{t('aiChat.open')}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen} fullScreen={fullScreen}>
        <DialogContent
          data-full-screen={fullScreen}
          className={cn(
            'flex h-[min(52rem,calc(100dvh-1rem))] max-h-[calc(100dvh-1rem)] max-w-[76rem] flex-col overflow-hidden rounded-[var(--shape-radius-overlay-relaxed)] border border-border/60 bg-[var(--glass-surface)] p-0 sm:h-[min(52rem,calc(100vh-2rem))] sm:max-h-[calc(100vh-2rem)]',
            fullScreen && '!m-0 !h-dvh !max-h-dvh !max-w-none !rounded-none !border-0',
          )}
        >
          <DialogHeader className="relative shrink-0 border-b border-border/60 bg-card/75 px-4 py-4 pe-28 backdrop-blur-xl sm:px-6 sm:py-5 sm:pe-32">
            <div className="flex items-start gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-[var(--shape-radius-card)] bg-primary text-primary-foreground shadow-[var(--shadow-vapor)]">
                <Bot className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-base sm:text-lg">{t('aiChat.title')}</DialogTitle>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="min-w-[13rem]">
                    <span className="mb-1 block text-[length:var(--type-size-label)] font-medium text-muted-foreground">
                      {t('aiChat.model')}
                    </span>
                    <select
                      value={model}
                      onChange={(event) =>
                        updateModel(adminAiModelIdSchema.parse(event.target.value))
                      }
                      aria-label={t('aiChat.model')}
                      className="h-9 w-full rounded-lg border border-border/70 bg-background px-2.5 text-xs text-foreground shadow-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                    >
                      {ADMIN_AI_MODEL_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label} · {option.cost}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="min-w-[8rem]">
                    <span className="mb-1 block text-[length:var(--type-size-label)] font-medium text-muted-foreground">
                      {t('aiChat.reasoningEffort')}
                    </span>
                    <select
                      value={reasoningEffort}
                      onChange={(event) =>
                        updateReasoningEffort(
                          adminAiReasoningEffortSchema.parse(event.target.value),
                        )
                      }
                      aria-label={t('aiChat.reasoningEffort')}
                      className="h-9 w-full rounded-lg border border-border/70 bg-background px-2.5 text-xs text-foreground shadow-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                    >
                      {getAdminAiModelOption(model).reasoningEfforts.map((effort) => (
                        <option key={effort} value={effort}>
                          {t(`aiChat.reasoningLevels.${effort}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex h-9 cursor-pointer items-center gap-2.5">
                    <Switch
                      checked={autoAcceptProposals}
                      onCheckedChange={updateAutoAcceptProposals}
                      aria-label={t('aiChat.autoAccept')}
                    />
                    <span className="text-xs font-medium text-foreground">
                      {t('aiChat.autoAccept')}
                    </span>
                  </label>
                </div>
              </div>
            </div>
            <div className="absolute end-3 top-3 flex items-center gap-1 sm:end-5 sm:top-5">
              <Button
                type="button"
                variant="ghost"
                className="size-10 rounded-[var(--shape-radius-card-compact)] p-0"
                onClick={() => setFullScreen((value) => !value)}
                aria-label={t(fullScreen ? 'aiChat.exitFullScreen' : 'aiChat.fullScreen')}
                aria-pressed={fullScreen}
              >
                {fullScreen ? (
                  <Minimize2 className="size-[1.125rem]" />
                ) : (
                  <Maximize2 className="size-[1.125rem]" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="size-10 rounded-[var(--shape-radius-card-compact)] p-0"
                onClick={() => setOpen(false)}
                aria-label={t('aiChat.close')}
              >
                <X className="size-5" />
              </Button>
            </div>
          </DialogHeader>

          <div
            data-slot="admin-ai-workspace"
            className="isolate grid min-h-0 min-w-0 w-full flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-1"
          >
            <div
              className="col-start-1 row-start-1 grid grid-cols-2 gap-1 border-b border-border/60 bg-card/70 p-2 lg:hidden"
              aria-label={t('aiChat.mobilePanels')}
            >
              <Button
                type="button"
                size="sm"
                variant={mobilePanel === 'conversation' ? 'outline' : 'ghost'}
                aria-pressed={mobilePanel === 'conversation'}
                onClick={() => setMobilePanel('conversation')}
              >
                {t('aiChat.conversationTab')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mobilePanel === 'chats' ? 'outline' : 'ghost'}
                aria-pressed={mobilePanel === 'chats'}
                onClick={() => setMobilePanel('chats')}
              >
                {t('aiChat.chats')}
              </Button>
            </div>
            <ConversationPanel
              visible={mobilePanel === 'conversation'}
              loading={loadingConversation}
              messages={messages}
              pending={pending}
              receivingText={receivingText}
              activity={activity}
              surface={surfaceContext.surface}
              suggestionKeys={suggestionKeys}
              input={input}
              reviewingProposalId={reviewingProposalId}
              proposalReviewError={proposalReviewError}
              composerRef={composerRef}
              messagesEndRef={messagesEndRef}
              onInputChange={setInput}
              onSend={() => void send()}
              onCancel={cancelResponse}
              onNavigate={() => setOpen(false)}
              onReviewProposal={(messageId, proposalId, action) =>
                void reviewProposal(messageId, proposalId, action)
              }
              onRateMessage={(messageRecordId, feedback) =>
                void rateAssistantMessage(messageRecordId, feedback)
              }
            />

            <ChatSidebar
              mobileVisible={mobilePanel === 'chats'}
              conversations={conversations}
              selectedConversationId={selectedConversationId}
              loading={loadingConversations}
              jobs={jobs}
              cancellingJobId={cancellingJobId}
              search={conversationSearch}
              onNewChat={() => {
                newChat();
                setMobilePanel('conversation');
              }}
              onSearchChange={setConversationSearch}
              onSelectConversation={(conversation) => {
                setMobilePanel('conversation');
                void selectConversation(conversation);
              }}
              onRenameConversation={renameConversation}
              onDeleteConversation={(conversation) => void deleteConversation(conversation)}
              onCancelJob={(job) => void cancelJob(job)}
              labelize={queryLabel}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
