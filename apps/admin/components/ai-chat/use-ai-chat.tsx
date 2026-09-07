'use client';
import { useConversationActions } from './conversation-actions';
import { useConversationState } from './use-conversation-state';

import { useEffect } from 'react';

import { consumeAdminAiChatResponse } from '../../lib/admin-ai-chat-stream';
import { notifyAdminAiMutation } from '../../lib/admin-ai-events';
import {
  ADMIN_AI_DEFAULT_MODEL,
  adminAiModelIdSchema,
  adminAiReasoningEffortSchema,
  getDefaultAdminAiReasoningEffort,
  supportsAdminAiReasoningEffort,
  type AdminAiModelId,
  type AdminAiReasoningEffort,
} from '../../lib/admin-ai-models';
import type { PermissionKey } from '../../lib/permissions';
import {
  notifyAdminAiToolMutations,
  presentationFromUnknown,
  type Proposal,
  type ProposalNextAction,
} from '../admin-ai-chat/message-results';
import type { AiJob, ConversationSummary } from '../admin-ai-chat/types';

export const ADMIN_AI_MODEL_STORAGE_KEY = 'bricomaitre:admin-ai:model';
export const ADMIN_AI_REASONING_EFFORT_STORAGE_KEY = 'bricomaitre:admin-ai:reasoning-effort';
export const ADMIN_AI_AUTO_ACCEPT_STORAGE_KEY = 'bricomaitre:admin-ai:auto-accept';

export function useAdminAiChat({
  permissions = [],
  modelIds,
}: {
  permissions?: PermissionKey[];
  modelIds?: readonly AdminAiModelId[];
}) {
  const {
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
  } = useConversationState({ permissions, modelIds });

  useEffect(() => {
    const autoAccept = window.localStorage.getItem(ADMIN_AI_AUTO_ACCEPT_STORAGE_KEY) === 'true';
    const storedModel = adminAiModelIdSchema.safeParse(
      window.localStorage.getItem(ADMIN_AI_MODEL_STORAGE_KEY),
    );
    const nextModel =
      storedModel.success && (!modelIds || modelIds.includes(storedModel.data))
        ? storedModel.data
        : ADMIN_AI_DEFAULT_MODEL;
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
  }, [modelIds, setAutoAcceptProposals, setModel, setReasoningEffort]);

  useEffect(() => {
    if (!open) return;
    void loadConversations(
      activeConversationRef.current === null && deferredConversationSearch.length === 0,
    );
  }, [
    deferredConversationSearch,
    open,
    loadConversations,
    selectConversation,
    activeConversationRef,
  ]);

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
  }, [messages, pending, messagesEndRef]);
  const { newChat, renameConversation, deleteConversation, rateAssistantMessage } =
    useConversationActions({
      leaveStreamingTurn,
      conversationRequestRef,
      activeConversationRef,
      conversationKeyRef,
      setSelectedConversationId,
      setLoadingConversation,
      setConversationLoadError,
      setMessages,
      setInput,
      setConversations,
      t,
      messages,
    });

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
    if (!message || pending || loadingConversation || conversationLoadError) return;
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
          if (responseAbortRef.current !== abortController) return;
          setActivity(status);
        },
        onTextDelta(delta) {
          if (responseAbortRef.current !== abortController) return;
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
          if (responseAbortRef.current !== abortController) return;
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
      if (responseAbortRef.current === abortController) {
        void Promise.allSettled([loadConversations(), loadAiHistory()]);
      }
    } catch {
      if (!abortController.signal.aborted && responseAbortRef.current === abortController) {
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
          void Promise.allSettled([loadConversations()]);
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
      if (responseAbortRef.current === abortController) {
        responseAbortRef.current = null;
        setPending(false);
        setReceivingText(false);
        setActivity(null);
      }
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

  return {
    view: {
      setOpen,
      t,
      open,
      fullScreen,
      model,
      updateModel,
      modelOptions,
      reasoningEffort,
      updateReasoningEffort,
      autoAcceptProposals,
      updateAutoAcceptProposals,
      setFullScreen,
      mobilePanel,
      setMobilePanel,
      loadingConversation,
      conversationLoadError,
      activeConversationRef,
      selectConversation,
      messages,
      pending,
      receivingText,
      activity,
      surfaceContext,
      suggestionKeys,
      input,
      reviewingProposalId,
      proposalReviewError,
      composerRef,
      messagesEndRef,
      setInput,
      send,
      cancelResponse,
      reviewProposal,
      rateAssistantMessage,
      conversations,
      selectedConversationId,
      loadingConversations,
      listLoadError,
      jobsLoadError,
      loadConversations,
      loadAiHistory,
      jobs,
      cancellingJobId,
      conversationSearch,
      newChat,
      setConversationSearch,
      renameConversation,
      deleteConversation,
      cancelJob,
    } as const,
    fallback: null,
  };
}
