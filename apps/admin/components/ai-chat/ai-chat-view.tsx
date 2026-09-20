'use client';
import { Bot, Maximize2, Minimize2, X } from 'lucide-react';
import {
  adminAiModelIdSchema,
  adminAiReasoningEffortSchema,
  getAdminAiModelOption,
} from '../../lib/admin-ai-models';
import { cn } from '../../lib/utils';
import { ChatSidebar } from '../admin-ai-chat/chat-sidebar';
import { ConversationPanel } from '../admin-ai-chat/conversation-panel';
import { queryLabel } from '../admin-ai-chat/message-results';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Switch } from '../ui/switch';
import { useMediaQuery } from '../ui/use-media-query';
import { type useAdminAiChat } from './use-ai-chat';

export function AdminAiChatView({
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
}: NonNullable<ReturnType<typeof useAdminAiChat>['view']>) {
  const automaticFullScreen = useMediaQuery('(max-width: 639px), (max-height: 640px)');
  const effectiveFullScreen = fullScreen || automaticFullScreen;

  return (
    <Dialog open={open} onOpenChange={setOpen} fullScreen={effectiveFullScreen}>
      <DialogContent
        data-full-screen={effectiveFullScreen}
        data-automatic-full-screen={automaticFullScreen}
        className={cn(
          'flex h-[min(52rem,calc(100dvh-1rem))] max-h-[calc(100dvh-1rem)] max-w-[76rem] flex-col overflow-hidden rounded-[var(--shape-radius-overlay-relaxed)] border border-border/60 bg-[var(--glass-surface)] p-0 sm:h-[min(52rem,calc(100vh-2rem))] sm:max-h-[calc(100vh-2rem)]',
          effectiveFullScreen && '!m-0 !h-dvh !max-h-dvh !max-w-none !rounded-none !border-0',
        )}
      >
        <DialogHeader className="relative shrink-0 border-b border-border/60 bg-card/75 px-3 py-3 backdrop-blur-xl sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-3 pe-10 sm:pe-24">
            <div className="hidden size-9 shrink-0 place-items-center rounded-[var(--shape-radius-card-compact)] bg-primary text-primary-foreground shadow-[var(--shadow-vapor)] sm:grid">
              <Bot className="size-5" />
            </div>
            <DialogTitle className="min-w-0 flex-1 truncate text-sm sm:text-base">
              {t('aiChat.title')}
            </DialogTitle>
          </div>
          <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(5.75rem,0.58fr)_auto] items-end gap-2 sm:mt-3 sm:grid-cols-[minmax(12rem,1fr)_minmax(8rem,0.65fr)_auto] sm:gap-3">
            <label className="min-w-0">
              <span className="sr-only text-[length:var(--type-size-label)] font-medium text-muted-foreground sm:not-sr-only sm:mb-1 sm:block">
                {t('aiChat.model')}
              </span>
              <select
                dir="ltr"
                value={model}
                onChange={(event) => updateModel(adminAiModelIdSchema.parse(event.target.value))}
                aria-label={t('aiChat.model')}
                className="h-8 w-full min-w-0 rounded-lg border border-border/70 bg-background px-2 text-[0.6875rem] text-foreground shadow-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 sm:h-9 sm:px-2.5 sm:text-xs"
              >
                {modelOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} · {option.cost}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0">
              <span className="sr-only text-[length:var(--type-size-label)] font-medium text-muted-foreground sm:not-sr-only sm:mb-1 sm:block">
                {t('aiChat.reasoningEffort')}
              </span>
              <select
                value={reasoningEffort}
                onChange={(event) =>
                  updateReasoningEffort(adminAiReasoningEffortSchema.parse(event.target.value))
                }
                aria-label={t('aiChat.reasoningEffort')}
                className="h-8 w-full min-w-0 rounded-lg border border-border/70 bg-background px-2 text-[0.6875rem] text-foreground shadow-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 sm:h-9 sm:px-2.5 sm:text-xs"
              >
                {getAdminAiModelOption(model).reasoningEfforts.map((effort) => (
                  <option key={effort} value={effort}>
                    {t(`aiChat.reasoningLevels.${effort}`)}
                  </option>
                ))}
              </select>
            </label>
            <label
              className="flex h-8 cursor-pointer items-center gap-1 sm:h-9 sm:gap-2.5"
              title={t('aiChat.autoAccept')}
            >
              <Switch
                checked={autoAcceptProposals}
                onCheckedChange={updateAutoAcceptProposals}
                aria-label={t('aiChat.autoAccept')}
              />
              <span className="text-[0.625rem] font-medium text-foreground md:hidden">
                {t('aiChat.autoAcceptShort')}
              </span>
              <span className="hidden text-xs font-medium text-foreground md:block md:max-w-48 md:leading-4">
                {t('aiChat.autoAccept')}
              </span>
            </label>
          </div>
          <div className="absolute end-2 top-2 flex items-center gap-0.5 sm:end-4 sm:top-3 sm:gap-1">
            {!automaticFullScreen ? (
              <Button
                type="button"
                variant="ghost"
                className="size-9 rounded-[var(--shape-radius-card-compact)] p-0 sm:size-10"
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
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="size-9 rounded-[var(--shape-radius-card-compact)] p-0 sm:size-10"
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
            loadError={conversationLoadError}
            onRetryLoad={() => {
              const conversation = activeConversationRef.current;
              if (conversation) void selectConversation(conversation);
            }}
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
            loadError={listLoadError || jobsLoadError}
            onRetryLoad={() => {
              void Promise.allSettled([loadConversations(), loadAiHistory()]);
            }}
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
              setInput('');
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
  );
}
