'use client';
import { AssistantMarkdown } from '@/components/assistant-markdown';
import { MobileSheet } from '@/components/mobile-sheet';
import {
  ArrowUp,
  Bot,
  Check,
  MessageSquarePlus,
  RotateCcw,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { ProductResult, type useShoppingAssistantPanel } from './use-shopping-assistant';

export function ShoppingAssistantPanelView({
  labels,
  newChat,
  pending,
  onClose,
  submit,
  inputId,
  draft,
  setDraft,
  stopGeneration,
  messages,
  sendMessage,
  locale,
  rateMessage,
  receivingText,
  activity,
  error,
  retryLastMessage,
  endRef,
}: NonNullable<ReturnType<typeof useShoppingAssistantPanel>['view']>) {
  return (
    <MobileSheet
      title={labels.title}
      closeLabel={labels.close}
      className="shopping-assistant-sheet"
      headerAction={
        <div className="shopping-assistant-header-actions">
          <span className="shopping-assistant-live">
            <span aria-hidden="true" />
            {labels.liveCatalog}
          </span>
          <button
            type="button"
            className="shopping-assistant-new-chat"
            onClick={newChat}
            disabled={pending}
            aria-label={labels.newChat}
            title={labels.newChat}
          >
            <MessageSquarePlus aria-hidden="true" size={17} />
          </button>
        </div>
      }
      onClose={onClose}
      footer={
        <form className="shopping-assistant-form" onSubmit={submit}>
          <label className="sr-only" htmlFor={inputId}>
            {labels.inputLabel}
          </label>
          <input
            id={inputId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={labels.placeholder}
            maxLength={1_500}
            disabled={pending}
            autoComplete="off"
          />
          {pending ? (
            <button type="button" aria-label={labels.stop} onClick={stopGeneration}>
              <Square aria-hidden="true" size={15} fill="currentColor" />
            </button>
          ) : (
            <button type="submit" aria-label={labels.send} disabled={!draft.trim()}>
              <ArrowUp aria-hidden="true" size={19} />
            </button>
          )}
        </form>
      }
    >
      <div className="shopping-assistant-conversation" aria-live="polite" aria-busy={pending}>
        <section className="shopping-assistant-intro">
          <span className="shopping-assistant-intro-icon">
            <Sparkles aria-hidden="true" size={22} />
          </span>
          <div>
            <h3>{labels.welcomeTitle}</h3>
            <p>{labels.welcomeDescription}</p>
          </div>
        </section>

        {!messages.length ? (
          <div className="shopping-assistant-prompts">
            {labels.quickPrompts.map((prompt) => (
              <button key={prompt} type="button" onClick={() => void sendMessage(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
        ) : null}

        <div className="shopping-assistant-messages">
          {messages.map((message) => (
            <article key={message.id} className={`shopping-assistant-message is-${message.role}`}>
              {message.role === 'assistant' ? (
                <span className="shopping-assistant-avatar">
                  <Bot aria-hidden="true" size={16} />
                </span>
              ) : null}
              <div className="shopping-assistant-bubble">
                {message.role === 'assistant' ? (
                  <AssistantMarkdown>{message.content}</AssistantMarkdown>
                ) : (
                  <p>{message.content}</p>
                )}
                {message.interrupted ? (
                  <small className="shopping-assistant-interrupted" role="status">
                    {labels.interrupted}
                  </small>
                ) : null}
                {message.cartMutations?.length ? (
                  <small className="shopping-assistant-cart-updated" role="status">
                    <Check aria-hidden="true" size={13} />
                    {labels.cartUpdated}
                  </small>
                ) : null}
                {message.products?.length ? (
                  <div className="shopping-assistant-results">
                    {message.products.map((product, index) => (
                      <ProductResult
                        key={product.id}
                        product={product}
                        locale={locale}
                        labels={labels}
                        position={index + 1}
                      />
                    ))}
                  </div>
                ) : null}
                {message.role === 'assistant' &&
                message.content &&
                !message.interrupted &&
                (!pending || message.id !== messages.at(-1)?.id) ? (
                  <div className="shopping-assistant-feedback">
                    <button
                      type="button"
                      aria-label={labels.helpful}
                      aria-pressed={message.feedback === 'helpful'}
                      onClick={() => rateMessage(message, 'helpful')}
                    >
                      <ThumbsUp aria-hidden="true" size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label={labels.notHelpful}
                      aria-pressed={message.feedback === 'not_helpful'}
                      onClick={() => rateMessage(message, 'not_helpful')}
                    >
                      <ThumbsDown aria-hidden="true" size={13} />
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
          {pending && !receivingText ? (
            <div
              className="shopping-assistant-thinking"
              role="status"
              aria-live="polite"
              data-activity={activity?.type === 'tool' ? activity.name : 'thinking'}
              data-phase={activity?.type === 'tool' ? activity.status : 'started'}
            >
              {activity?.type === 'tool' && activity.status === 'completed' ? (
                <Check aria-hidden="true" size={14} />
              ) : activity?.type === 'tool' && activity.status === 'failed' ? (
                <RotateCcw aria-hidden="true" size={14} />
              ) : (
                <span className="shopping-assistant-thinking-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              )}
              <em>
                {activity?.type === 'tool'
                  ? activity.status === 'failed'
                    ? labels.toolFailed
                    : labels.toolActivity[activity.name]
                  : labels.thinking}
              </em>
            </div>
          ) : null}
          {error ? (
            <div className="shopping-assistant-error" role="alert">
              <p>{error}</p>
              <button type="button" onClick={retryLastMessage}>
                <RotateCcw aria-hidden="true" size={13} />
                {labels.retry}
              </button>
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      </div>
    </MobileSheet>
  );
}
