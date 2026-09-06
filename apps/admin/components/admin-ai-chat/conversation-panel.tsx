'use client';

import { Bot, Check, Send, Sparkles, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { RefObject } from 'react';

import type { AdminAiChatStatus } from '../../lib/admin-ai-chat-stream';
import type { AdminAiSurfaceContext } from '../../lib/admin-ai-context';
import { Button } from '../ui/button';
import { Markdown } from '../ui/markdown';
import { Spinner } from '../ui/spinner';
import { Textarea } from '../ui/textarea';
import { AdminAiPresentationBlocks } from './presentation-blocks';
import {
  AdminAiActivity,
  StructuredToolResultCard,
  type ChatMessage,
  type ProposalNextAction,
} from './message-results';

type ConversationPanelProps = {
  visible: boolean;
  loading: boolean;
  loadError: boolean;
  onRetryLoad: () => void;
  messages: ChatMessage[];
  pending: boolean;
  receivingText: boolean;
  activity: AdminAiChatStatus | null;
  surface: AdminAiSurfaceContext['surface'];
  suggestionKeys: string[];
  input: string;
  reviewingProposalId: number | null;
  proposalReviewError: {
    messageId: string;
    message: string;
    nextAction?: ProposalNextAction;
  } | null;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
  onNavigate: () => void;
  onReviewProposal: (
    messageId: string | undefined,
    proposalId: number,
    action: 'approve' | 'reject',
  ) => void;
  onRateMessage: (messageRecordId: number, feedback: 'helpful' | 'not_helpful') => void;
};

export function ConversationPanel({
  visible,
  loading,
  loadError,
  onRetryLoad,
  messages,
  pending,
  receivingText,
  activity,
  surface,
  suggestionKeys,
  input,
  reviewingProposalId,
  proposalReviewError,
  composerRef,
  messagesEndRef,
  onInputChange,
  onSend,
  onCancel,
  onNavigate,
  onReviewProposal,
  onRateMessage,
}: ConversationPanelProps) {
  const t = useTranslations();

  return (
    <section
      data-slot="admin-ai-conversation"
      className={`${visible ? 'flex' : 'hidden'} isolate col-start-1 row-start-2 min-h-0 min-w-0 overflow-hidden flex-col bg-background/45 lg:col-auto lg:row-auto lg:flex`}
      aria-label={t('aiChat.conversation')}
    >
      <div
        className="relative z-0 min-h-0 flex-1 overscroll-contain overflow-y-auto px-3 py-4 sm:px-5 sm:py-5"
        aria-live="polite"
      >
        {loading ? (
          <div className="grid min-h-full place-items-center" role="status">
            <span className="flex items-center gap-2 rounded-full bg-card px-4 py-2.5 text-xs text-muted-foreground shadow-[var(--shadow-vapor)]">
              <Spinner className="size-4" />
              {t('aiChat.loadingMessages')}
            </span>
          </div>
        ) : loadError ? (
          <div className="space-y-3 py-4 text-sm" role="alert">
            <p>{t('aiChat.conversationLoadError')}</p>
            <Button type="button" variant="outline" onClick={onRetryLoad}>
              {t('aiChat.retryLoad')}
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <div className="mx-auto flex min-h-full max-w-xl items-center justify-center py-8 text-center">
            <div>
              <div className="mx-auto grid size-14 place-items-center rounded-[var(--shape-radius-panel)] bg-primary/10 text-primary">
                <Sparkles className="size-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">
                {t('aiChat.emptyTitle')}
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-xs leading-6 text-muted-foreground sm:text-sm">
                {t('aiChat.currentSurface', {
                  surface: t(`aiChat.surfaceLabels.${surface}`),
                })}
              </p>
              <div className="mt-5 grid gap-2 text-start sm:grid-cols-2">
                {suggestionKeys.map((key) => {
                  const prompt = t(`aiChat.surfaceSuggestions.${key}`);
                  return (
                    <button
                      key={key}
                      type="button"
                      className="rounded-xl border border-border/65 bg-card px-3 py-2.5 text-xs leading-5 text-foreground transition-colors hover:border-primary/35 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-primary/20"
                      onClick={() => onInputChange(prompt)}
                    >
                      {prompt}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-4xl space-y-6">
            {messages.map((message, index) => (
              <article
                key={message.id ?? index}
                className={
                  message.role === 'user'
                    ? 'flex min-w-0 justify-end ps-10'
                    : 'flex min-w-0 items-start gap-2.5 sm:gap-3'
                }
              >
                {message.role === 'assistant' ? (
                  <span className="grid size-8 shrink-0 place-items-center rounded-[var(--shape-radius-control-relaxed)] bg-primary/10 text-primary">
                    <Bot className="size-4" />
                  </span>
                ) : null}
                <div
                  data-slot={
                    message.role === 'assistant'
                      ? 'admin-ai-assistant-message'
                      : 'admin-ai-user-bubble'
                  }
                  className={
                    message.role === 'user'
                      ? 'min-w-0 max-w-[88%] rounded-[var(--shape-radius-panel-compact)] rounded-ee-md bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground shadow-[var(--shadow-vapor)] [overflow-wrap:anywhere]'
                      : 'min-w-0 w-full flex-1 overflow-hidden py-0.5 text-sm leading-6 text-foreground'
                  }
                >
                  {message.role === 'assistant' ? (
                    <Markdown>{message.content}</Markdown>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  )}
                  {message.role === 'assistant' ? (
                    <AdminAiPresentationBlocks
                      plan={message.presentation}
                      evidence={message.evidence ?? []}
                      onNavigate={onNavigate}
                    />
                  ) : null}
                  {message.role === 'assistant'
                    ? message.results?.map((result, resultIndex) => (
                        <StructuredToolResultCard
                          key={`${result.toolName}-${resultIndex}`}
                          result={result}
                          onNavigate={onNavigate}
                          onPrompt={(prompt) => {
                            onInputChange(prompt);
                            window.requestAnimationFrame(() => composerRef.current?.focus());
                          }}
                        />
                      ))
                    : null}
                  {message.role === 'assistant'
                    ? message.proposals?.map((proposal) => (
                        <div
                          key={proposal.id}
                          className="mt-4 flex items-center gap-2 border-t border-border/50 pt-3"
                        >
                          {proposal.status === 'proposed' ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                disabled={reviewingProposalId !== null}
                                onClick={() => onReviewProposal(message.id, proposal.id, 'approve')}
                              >
                                {reviewingProposalId === proposal.id ? (
                                  <Spinner className="size-3.5" />
                                ) : (
                                  <Check className="size-3.5" />
                                )}
                                {t('aiChat.approve')}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={reviewingProposalId !== null}
                                onClick={() => onReviewProposal(message.id, proposal.id, 'reject')}
                              >
                                <X className="size-3.5" />
                                {t('aiChat.reject')}
                              </Button>
                            </>
                          ) : (
                            <p className="text-xs font-medium text-muted-foreground">
                              {t(
                                proposal.status === 'applied'
                                  ? 'aiChat.applied'
                                  : 'aiChat.rejected',
                              )}
                            </p>
                          )}
                        </div>
                      ))
                    : null}
                  {message.role === 'assistant' &&
                  proposalReviewError &&
                  proposalReviewError.messageId === message.id ? (
                    <div className="mt-3 text-xs text-destructive" role="alert">
                      <p>{proposalReviewError.message}</p>
                      {proposalReviewError.nextAction ? (
                        <p className="mt-1 text-muted-foreground">
                          {t(`aiChat.proposalNextActions.${proposalReviewError.nextAction}`)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {message.role === 'assistant' && message.messageRecordId ? (
                    <div className="mt-2 flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="size-8 p-0"
                        aria-label={t('aiChat.helpful')}
                        aria-pressed={message.feedback === 'helpful'}
                        onClick={() => onRateMessage(message.messageRecordId!, 'helpful')}
                      >
                        <ThumbsUp className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="size-8 p-0"
                        aria-label={t('aiChat.notHelpful')}
                        aria-pressed={message.feedback === 'not_helpful'}
                        onClick={() => onRateMessage(message.messageRecordId!, 'not_helpful')}
                      >
                        <ThumbsDown className="size-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
            {pending && !receivingText ? (
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                <span className="grid size-8 place-items-center rounded-[var(--shape-radius-control-relaxed)] bg-primary/10 text-primary">
                  <Bot className="size-4" />
                </span>
                <AdminAiActivity status={activity} />
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="relative z-20 min-w-0 w-full shrink-0 border-t border-border/60 bg-card/80 p-3 backdrop-blur-xl sm:p-4">
        <div className="mx-auto flex min-w-0 w-full max-w-3xl items-end gap-2 overflow-hidden rounded-[var(--shape-radius-card-relaxed)] border border-border/70 bg-background p-2 shadow-[var(--shadow-vapor)] focus-within:border-primary/35 focus-within:ring-2 focus-within:ring-primary/10">
          <Textarea
            ref={composerRef}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder={t(`aiChat.surfacePlaceholders.${surface}`)}
            aria-label={t('aiChat.placeholder')}
            className="min-h-12 min-w-0 w-auto max-h-32 flex-1 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:bg-transparent focus-visible:ring-0"
          />
          {pending ? (
            <Button
              type="button"
              variant="destructive"
              className="relative z-10 size-10 shrink-0 rounded-[var(--shape-radius-field)] p-0"
              onClick={onCancel}
              aria-label={t('aiChat.stopResponse')}
            >
              <X className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              className="relative z-10 size-10 shrink-0 rounded-[var(--shape-radius-field)] p-0"
              disabled={loading || loadError || !input.trim()}
              onClick={onSend}
              aria-label={t('aiChat.send')}
            >
              <Send className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
