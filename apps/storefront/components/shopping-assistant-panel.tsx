'use client';

import type {
  ShoppingAssistantProduct,
  ShoppingAssistantResponse,
} from '@bric/storefront-core/shopping-assistant-contracts';
import { ArrowUp, Bot, MessageSquarePlus, PackageSearch, Sparkles } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { AssistantMarkdown } from '@/components/assistant-markdown';
import { MobileSheet } from '@/components/mobile-sheet';
import { StorefrontImage } from '@/components/storefront-image';
import type { Locale } from '@/i18n/config';
import { getAnalyticsIdentity, trackNavigationEvent } from '@/lib/analytics';
import {
  recordAssistantEngagement,
  recordAssistantRecommendationClick,
} from '@/lib/assistant-attribution';
import { triggerHaptic } from '@/lib/haptics';
import { formatProductPrice } from '@/lib/product-presentation';
import { classifyShoppingAssistantIntent } from '@/lib/shopping-assistant';
import { consumeShoppingAssistantResponse } from '@/lib/shopping-assistant-stream';

export type ShoppingAssistantLabels = {
  open: string;
  title: string;
  close: string;
  liveCatalog: string;
  newChat: string;
  welcomeTitle: string;
  welcomeDescription: string;
  placeholder: string;
  send: string;
  thinking: string;
  error: string;
  rateLimited: string;
  fallback: string;
  inStock: string;
  outOfStock: string;
  priceOnRequest: string;
  viewProduct: string;
  inputLabel: string;
  quickPrompts: string[];
};

type ChatEntry = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  products?: ShoppingAssistantProduct[];
  mode?: ShoppingAssistantResponse['mode'];
};

const chatStoragePrefix = 'bricomaitre-shopping-assistant-chat-v1';

function isStoredProduct(value: unknown): value is ShoppingAssistantProduct {
  if (!value || typeof value !== 'object') return false;
  const product = value as Partial<ShoppingAssistantProduct>;
  const nullableString = (candidate: unknown) =>
    candidate === null || typeof candidate === 'string';
  return (
    Number.isInteger(product.id) &&
    Number(product.id) > 0 &&
    typeof product.token === 'string' &&
    typeof product.title === 'string' &&
    nullableString(product.titleAr) &&
    nullableString(product.description) &&
    nullableString(product.descriptionAr) &&
    nullableString(product.price) &&
    nullableString(product.oldPrice) &&
    typeof product.inStock === 'boolean' &&
    typeof product.availabilityStatus === 'string' &&
    nullableString(product.imageUrl) &&
    nullableString(product.brand) &&
    nullableString(product.category)
  );
}

function storedEntries(value: unknown): ChatEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-20).flatMap((entry): ChatEntry[] => {
    if (!entry || typeof entry !== 'object') return [];
    const candidate = entry as Partial<ChatEntry>;
    if (
      typeof candidate.id !== 'string' ||
      (candidate.role !== 'user' && candidate.role !== 'assistant') ||
      typeof candidate.content !== 'string' ||
      candidate.content.length === 0 ||
      candidate.content.length > 4_000 ||
      (candidate.mode !== undefined && candidate.mode !== 'ai' && candidate.mode !== 'fallback') ||
      (candidate.products !== undefined &&
        (!Array.isArray(candidate.products) || !candidate.products.every(isStoredProduct)))
    )
      return [];
    return [candidate as ChatEntry];
  });
}

function localizedTitle(product: ShoppingAssistantProduct, locale: Locale) {
  return locale === 'ar' && product.titleAr?.trim() ? product.titleAr.trim() : product.title;
}

function ProductResult({
  product,
  locale,
  labels,
  position,
}: {
  product: ShoppingAssistantProduct;
  locale: Locale;
  labels: ShoppingAssistantLabels;
  position: number;
}) {
  const title = localizedTitle(product, locale);
  return (
    <a
      className="shopping-assistant-product"
      href={`/${locale}/products/${encodeURIComponent(product.token)}`}
      onClick={() => {
        void triggerHaptic('navigation');
        recordAssistantRecommendationClick(getAnalyticsIdentity(), product.id);
        void trackNavigationEvent({
          eventName: 'ai_assistant_result_click',
          locale,
          productId: product.id,
          productSlug: product.token,
          metadata: { surface: 'ai_assistant', target: 'product_result', position },
        });
      }}
    >
      <span className="shopping-assistant-product-media">
        {product.imageUrl ? (
          <StorefrontImage
            src={product.imageUrl}
            alt=""
            width={96}
            height={96}
            sizes="72px"
            quality={60}
          />
        ) : (
          <PackageSearch aria-hidden="true" size={26} />
        )}
      </span>
      <span className="shopping-assistant-product-copy">
        <span className={product.inStock ? 'is-available' : 'is-unavailable'}>
          {product.inStock ? labels.inStock : labels.outOfStock}
        </span>
        <strong>{title}</strong>
        <b>{product.price ? formatProductPrice(product.price, locale) : labels.priceOnRequest}</b>
      </span>
      <span className="shopping-assistant-product-action">{labels.viewProduct}</span>
    </a>
  );
}

export function ShoppingAssistantPanel({
  locale,
  labels,
  onClose,
}: {
  locale: Locale;
  labels: ShoppingAssistantLabels;
  onClose: () => void;
}) {
  const inputId = useId();
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [receivingText, setReceivingText] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storageKey = `${chatStoragePrefix}:${locale}`;
    /* eslint-disable react-hooks/set-state-in-effect -- Conversation history must be available before the first submitted message. */
    try {
      setMessages(storedEntries(JSON.parse(localStorage.getItem(storageKey) ?? '[]')));
    } catch {
      setMessages([]);
      localStorage.removeItem(storageKey);
    } finally {
      setStorageReady(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [locale]);

  useEffect(() => {
    if (!storageReady) return;
    const storageKey = `${chatStoragePrefix}:${locale}`;
    try {
      if (messages.length > 0)
        localStorage.setItem(storageKey, JSON.stringify(messages.slice(-20)));
      else localStorage.removeItem(storageKey);
    } catch {
      // Browser storage is optional; the assistant must remain usable without it.
    }
  }, [locale, messages, storageReady]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messages, pending]);

  async function sendMessage(content: string) {
    const normalized = content.trim();
    if (!normalized || pending) return;
    const userEntry: ChatEntry = { id: crypto.randomUUID(), role: 'user', content: normalized };
    const nextMessages = [...messages, userEntry];
    setMessages(nextMessages);
    setDraft('');
    setError(null);
    setPending(true);
    setReceivingText(false);
    void triggerHaptic('primary');
    recordAssistantEngagement(getAnalyticsIdentity());
    void trackNavigationEvent({
      eventName: 'ai_assistant_message',
      locale,
      metadata: {
        surface: 'ai_assistant',
        target: 'submitted',
        intent: classifyShoppingAssistantIntent(normalized),
      },
    });

    try {
      const identity = getAnalyticsIdentity();
      const intent = classifyShoppingAssistantIntent(normalized);
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locale,
          telemetry:
            identity.journeyId && identity.sessionId
              ? {
                  journeyId: identity.journeyId,
                  sessionId: identity.sessionId,
                  pagePath: window.location.pathname,
                  intent,
                }
              : undefined,
          messages: nextMessages.slice(-8).map(({ role, content: message }) => ({
            role,
            content: message.slice(0, 1_500),
          })),
        }),
      });
      if (!response.ok) {
        const code = response.status === 429 ? 'rate_limited' : 'unavailable';
        throw new Error(code);
      }
      const assistantId = crypto.randomUUID();
      await consumeShoppingAssistantResponse(response, {
        onTextDelta(delta) {
          setReceivingText(true);
          setMessages((current) => {
            const existing = current.findIndex((message) => message.id === assistantId);
            if (existing < 0)
              return [...current, { id: assistantId, role: 'assistant', content: delta }];
            return current.map((message, index) =>
              index === existing ? { ...message, content: `${message.content}${delta}` } : message,
            );
          });
        },
        onResult(result) {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? { ...message, products: result.products, mode: result.mode }
                : message,
            ),
          );
        },
      });
    } catch (cause) {
      const code =
        cause instanceof Error && cause.message === 'rate_limited' ? 'rate_limited' : 'unavailable';
      setError(code === 'rate_limited' ? labels.rateLimited : labels.error);
      void trackNavigationEvent({
        eventName: 'ai_assistant_error',
        locale,
        metadata: { surface: 'ai_assistant', target: code },
      });
    } finally {
      setPending(false);
      setReceivingText(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  function newChat() {
    setMessages([]);
    setDraft('');
    setError(null);
  }

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
          <button type="submit" aria-label={labels.send} disabled={pending || !draft.trim()}>
            <ArrowUp aria-hidden="true" size={19} />
          </button>
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
                {message.mode === 'fallback' ? <small>{labels.fallback}</small> : null}
                {message.role === 'assistant' ? (
                  <AssistantMarkdown>{message.content}</AssistantMarkdown>
                ) : (
                  <p>{message.content}</p>
                )}
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
              </div>
            </article>
          ))}
          {pending && !receivingText ? (
            <div className="shopping-assistant-thinking" role="status">
              <span />
              <span />
              <span />
              <em>{labels.thinking}</em>
            </div>
          ) : null}
          {error ? (
            <p className="shopping-assistant-error" role="alert">
              {error}
            </p>
          ) : null}
          <div ref={endRef} />
        </div>
      </div>
    </MobileSheet>
  );
}
