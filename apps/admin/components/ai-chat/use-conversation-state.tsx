'use client';
import { useTranslations } from 'next-intl';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { type AdminAiChatStatus } from '../../lib/admin-ai-chat-stream';
import { suggestionKeysForAdminAi } from '../../lib/admin-ai-context';
import { ADMIN_AI_OPEN_EVENT, notifyAdminAiMutation } from '../../lib/admin-ai-events';
import {
  ADMIN_AI_DEFAULT_MODEL,
  ADMIN_AI_DEFAULT_REASONING_EFFORT,
  ADMIN_AI_MODEL_OPTIONS,
  type AdminAiModelId,
  type AdminAiReasoningEffort,
} from '../../lib/admin-ai-models';
import type { PermissionKey } from '../../lib/permissions';
import {
  hydrateChatMessage,
  type ChatMessage,
  type ProposalNextAction,
} from '../admin-ai-chat/message-results';
import type { AiJob, ConversationSummary } from '../admin-ai-chat/types';
import { useAdminAiSurfaceContext } from '../admin-ai-surface-context';
export function useConversationState({
  permissions = [],
  modelIds,
}: {
  permissions?: PermissionKey[];
  modelIds?: readonly AdminAiModelId[];
}) {
  const modelOptions = ADMIN_AI_MODEL_OPTIONS.filter(
    (option) => !modelIds || modelIds.includes(option.id),
  );
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
  const [conversationLoadError, setConversationLoadError] = useState(false);
  const [listLoadError, setListLoadError] = useState(false);
  const [jobsLoadError, setJobsLoadError] = useState(false);
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
  const conversationListRequestRef = useRef(0);
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
  const leaveStreamingTurn = useCallback(() => {
    responseAbortRef.current?.abort();
    responseAbortRef.current = null;
    setPending(false);
    setReceivingText(false);
    setActivity(null);
  }, []);
  useEffect(() => () => responseAbortRef.current?.abort(), []);
  const selectConversation = useCallback(
    async (conversation: ConversationSummary) => {
      leaveStreamingTurn();
      const requestId = ++conversationRequestRef.current;
      activeConversationRef.current = conversation;
      conversationKeyRef.current = conversation.sessionKey;
      setSelectedConversationId(conversation.id);
      setLoadingConversation(true);
      setConversationLoadError(false);
      setMessages([]);
      try {
        const response = await fetch(`/api/ai/conversations/${conversation.id}`, {
          cache: 'no-store',
        });
        if (requestId !== conversationRequestRef.current) return;
        if (!response.ok) throw new Error('Conversation load failed');
        const data = (await response.json()) as {
          messages: Array<ChatMessage & { toolResults?: unknown }>;
        };
        if (requestId !== conversationRequestRef.current) return;
        setMessages(data.messages.map(hydrateChatMessage));
      } catch {
        if (requestId === conversationRequestRef.current) setConversationLoadError(true);
      } finally {
        if (requestId === conversationRequestRef.current) setLoadingConversation(false);
      }
    },
    [leaveStreamingTurn],
  );
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
        if (activeConversationRef.current?.id !== conversation.id) return;
        // Add durable task outcomes without replacing the current streaming turn.
        setMessages((current) => {
          const known = new Set(current.map((message) => message.messageRecordId).filter(Boolean));
          const knownJobs = new Set(
            current.filter((message) => message.terminal).map((message) => message.jobId),
          );
          return [
            ...current,
            ...hydrated.filter(
              (message) =>
                message.terminal &&
                !known.has(message.messageRecordId) &&
                !knownJobs.has(message.jobId),
            ),
          ];
        });
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
      throw new Error('Terminal task messages are not available yet');
    },
    [],
  );
  const loadConversations = useCallback(
    async (selectLatest = false) => {
      const requestId = ++conversationListRequestRef.current;
      const selectionVersion = conversationRequestRef.current;
      setLoadingConversations(true);
      setListLoadError(false);
      try {
        const query = deferredConversationSearch
          ? `?q=${encodeURIComponent(deferredConversationSearch)}`
          : '';
        const response = await fetch(`/api/ai/conversations${query}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Conversation list load failed');
        const data = (await response.json()) as { conversations: ConversationSummary[] };
        if (requestId !== conversationListRequestRef.current) return;
        setConversations(data.conversations);
        if (
          selectLatest &&
          selectionVersion === conversationRequestRef.current &&
          activeConversationRef.current === null &&
          data.conversations[0]
        ) {
          void selectConversation(data.conversations[0]);
        }
      } catch {
        if (requestId === conversationListRequestRef.current) setListLoadError(true);
      } finally {
        if (requestId === conversationListRequestRef.current) setLoadingConversations(false);
      }
    },
    [deferredConversationSearch, selectConversation],
  );
  const loadAiHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/ai/history', { cache: 'no-store' });
      if (!response.ok) throw new Error('Job history load failed');
      setJobsLoadError(false);
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
        void reconcileTerminalJobs(activeConversation, newTerminalJobIds).catch(() => {
          newTerminalJobIds.forEach((id) => terminalJobIdsRef.current.delete(id));
          setJobsLoadError(true);
        });
      }
    } catch {
      setJobsLoadError(true);
    }
  }, [reconcileTerminalJobs]);
  return {
    setAutoAcceptProposals,
    setModel,
    setReasoningEffort,
    open,
    loadConversations,
    activeConversationRef,
    deferredConversationSearch,
    selectConversation,
    hasActiveJobs,
    loadAiHistory,
    messagesEndRef,
    messages,
    pending,
    leaveStreamingTurn,
    conversationRequestRef,
    conversationKeyRef,
    setSelectedConversationId,
    setLoadingConversation,
    setConversationLoadError,
    setMessages,
    setInput,
    setConversations,
    t,
    reasoningEffort,
    model,
    setReviewingProposalId,
    setProposalReviewError,
    input,
    loadingConversation,
    conversationLoadError,
    setPending,
    setReceivingText,
    setActivity,
    responseAbortRef,
    autoAcceptProposals,
    surfaceContext,
    reviewingProposalId,
    cancellingJobId,
    setCancellingJobId,
    setOpen,
    fullScreen,
    modelOptions,
    setFullScreen,
    mobilePanel,
    setMobilePanel,
    receivingText,
    activity,
    suggestionKeys,
    proposalReviewError,
    composerRef,
    conversations,
    selectedConversationId,
    loadingConversations,
    listLoadError,
    jobsLoadError,
    jobs,
    conversationSearch,
    setConversationSearch,
  } as const;
}
