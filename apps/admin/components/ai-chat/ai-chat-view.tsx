'use client';
import { Bot, Maximize2, Minimize2, Sparkles, X } from 'lucide-react';
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
                      {modelOptions.map((option) => (
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
    </>
  );
}
