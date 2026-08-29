'use client';

import {
  shoppingAssistantCartMutationSchema,
  type ShoppingAssistantCartMutation,
  type ShoppingAssistantProduct,
  type ShoppingAssistantToolName,
} from '@bric/storefront-core/shopping-assistant-contracts';
import {
  ArrowUp,
  Bot,
  Check,
  MessageSquarePlus,
  PackageSearch,
  RotateCcw,
  ShoppingCart,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
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
import { addCartItem, readCart, writeCart } from '@/lib/cart';
import { applyShoppingAssistantCartMutations } from '@/lib/shopping-assistant-cart';
import { buildShoppingAssistantPageContext } from '@/lib/shopping-assistant';
import {
  consumeShoppingAssistantResponse,
  type ShoppingAssistantActivity,
} from '@/lib/shopping-assistant-stream';

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
  stop: string;
  stopped: string;
  retry: string;
  thinking: string;
  toolActivity: Record<ShoppingAssistantToolName, string>;
  toolFailed: string;
  error: string;
  interrupted: string;
  rateLimited: string;
  inStock: string;
  outOfStock: string;
  priceOnRequest: string;
  viewProduct: string;
  addToCart?: string;
  addedToCart?: string;
  cartUpdated: string;
  helpful: string;
  notHelpful: string;
  inputLabel: string;
  quickPrompts: string[];
};

type ChatEntry = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  products?: ShoppingAssistantProduct[];
  cartMutations?: ShoppingAssistantCartMutation[];
  feedback?: 'helpful' | 'not_helpful';
  interrupted?: boolean;
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
    (product.sku === undefined || nullableString(product.sku)) &&
    (product.characteristics === undefined ||
      (Array.isArray(product.characteristics) &&
        product.characteristics.every((value) => typeof value === 'string'))) &&
    (product.characteristicsAr === undefined ||
      (Array.isArray(product.characteristicsAr) &&
        product.characteristicsAr.every((value) => typeof value === 'string'))) &&
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
  return value.slice(-40).flatMap((entry): ChatEntry[] => {
    if (!entry || typeof entry !== 'object') return [];
    const candidate = entry as Partial<ChatEntry>;
    if (
      typeof candidate.id !== 'string' ||
      (candidate.role !== 'user' && candidate.role !== 'assistant') ||
      typeof candidate.content !== 'string' ||
      candidate.content.length === 0 ||
      candidate.content.length > 4_000 ||
      (candidate.feedback !== undefined &&
        candidate.feedback !== 'helpful' &&
        candidate.feedback !== 'not_helpful') ||
      (candidate.interrupted !== undefined && typeof candidate.interrupted !== 'boolean') ||
      (candidate.products !== undefined &&
        (!Array.isArray(candidate.products) || !candidate.products.every(isStoredProduct))) ||
      (candidate.cartMutations !== undefined &&
        (!Array.isArray(candidate.cartMutations) ||
          !candidate.cartMutations.every(
            (mutation) => shoppingAssistantCartMutationSchema.safeParse(mutation).success,
          )))
    )
      return [];
    return [
      {
        ...candidate,
        products: candidate.products?.map((product) => ({
          ...product,
          sku: product.sku ?? null,
          characteristics: product.characteristics ?? [],
          characteristicsAr: product.characteristicsAr ?? [],
        })),
        cartMutations: candidate.cartMutations?.map((mutation) =>
          shoppingAssistantCartMutationSchema.parse(mutation),
        ),
      } as ChatEntry,
    ];
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
  const [added, setAdded] = useState(false);

  function addExactProduct() {
    if (!product.inStock || product.price === null) return;
    const next = addCartItem(readCart(window.localStorage), {
      productId: product.id,
      token: product.token,
      title,
      imageUrl: product.imageUrl,
      unitPrice: Number(product.price),
      quantity: 1,
      availabilityStatus: product.availabilityStatus,
    });
    writeCart(window.localStorage, next);
    window.dispatchEvent(new Event('bric:cart-updated'));
    setAdded(true);
    void triggerHaptic('success');
    void trackNavigationEvent({
      eventName: 'add_to_cart',
      locale,
      productId: product.id,
      productSlug: product.token,
      metadata: { surface: 'ai_assistant', target: 'exact_catalog_result', position },
    });
  }

  return (
    <div className="shopping-assistant-product">
      <a
        className="shopping-assistant-product-link"
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
      <button
        type="button"
        className="shopping-assistant-product-cart"
        disabled={!product.inStock || product.price === null}
        onClick={addExactProduct}
      >
        {added ? (
          <Check aria-hidden="true" size={14} />
        ) : (
          <ShoppingCart aria-hidden="true" size={14} />
        )}
        {added ? (labels.addedToCart ?? 'Added') : (labels.addToCart ?? 'Add to cart')}
      </button>
    </div>
  );
}

export function ShoppingAssistantPanel({
  locale,
  labels,
  pathname,
  onClose,
}: {
  locale: Locale;
  labels: ShoppingAssistantLabels;
  pathname?: string;
  onClose: () => void;
}) {
  const inputId = useId();
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [receivingText, setReceivingText] = useState(false);
  const [activity, setActivity] = useState<ShoppingAssistantActivity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const silentAbortRef = useRef(false);

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
        localStorage.setItem(storageKey, JSON.stringify(messages.slice(-40)));
      else localStorage.removeItem(storageKey);
    } catch {
      // Browser storage is optional; the assistant must remain usable without it.
    }
  }, [locale, messages, storageReady]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messages, pending]);

  useEffect(
    () => () => {
      silentAbortRef.current = true;
      activeRequestRef.current?.abort();
    },
    [],
  );

  async function sendMessage(
    content: string,
    history = messages,
    analyticsTarget: 'submitted' | 'retry' = 'submitted',
  ) {
    const normalized = content.trim();
    if (!normalized || pending) return;
    const userEntry: ChatEntry = { id: crypto.randomUUID(), role: 'user', content: normalized };
    const nextMessages = [...history, userEntry];
    const controller = new AbortController();
    const analyticsIdentity = getAnalyticsIdentity();
    silentAbortRef.current = false;
    activeRequestRef.current = controller;
    setMessages(nextMessages);
    setDraft('');
    setError(null);
    setPending(true);
    setReceivingText(false);
    setActivity(null);
    void triggerHaptic('primary');
    recordAssistantEngagement(analyticsIdentity);
    void trackNavigationEvent({
      eventName: 'ai_assistant_message',
      locale,
      metadata: {
        surface: 'ai_assistant',
        target: analyticsTarget,
      },
    });

    const assistantId = crypto.randomUUID();
    let receivedText = false;
    let resultHandled = false;
    let interruptedProducts: ShoppingAssistantProduct[] | undefined;
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locale,
          context: buildShoppingAssistantPageContext(
            pathname ?? window.location.pathname,
            new URLSearchParams(window.location.search),
            readCart(window.localStorage),
          ),
          messages: nextMessages
            .filter((message) => !message.interrupted)
            .slice(-40)
            .map(({ role, content: message, products }) => ({
              role,
              content: message.slice(0, 1_500),
              productIds: products?.map((product) => product.id),
            })),
          ...(analyticsIdentity.journeyId && analyticsIdentity.sessionId
            ? {
                telemetry: {
                  journeyId: analyticsIdentity.journeyId,
                  sessionId: analyticsIdentity.sessionId,
                  pagePath: pathname ?? window.location.pathname,
                },
              }
            : {}),
        }),
      });
      if (!response.ok) {
        const code = response.status === 429 ? 'rate_limited' : 'unavailable';
        throw new Error(code);
      }
      await consumeShoppingAssistantResponse(response, {
        onActivity(nextActivity) {
          setActivity(nextActivity);
        },
        onTextDelta(delta) {
          receivedText = true;
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
          if (resultHandled) return;
          resultHandled = true;
          let appliedMutations: ShoppingAssistantCartMutation[] = [];
          if (result.cartMutations.length > 0) {
            const applied = applyShoppingAssistantCartMutations(
              readCart(window.localStorage),
              result.cartMutations,
              locale,
            );
            if (applied.changed) {
              try {
                writeCart(window.localStorage, applied.items);
                window.dispatchEvent(new Event('bric:cart-updated'));
                appliedMutations = applied.changes.map(({ mutation }) => mutation);
                void triggerHaptic(
                  applied.changes.every(({ resultingQuantity }) => resultingQuantity === 0)
                    ? 'destructive'
                    : 'success',
                );
                for (const change of applied.changes) {
                  const delta = change.resultingQuantity - change.previousQuantity;
                  const unitPrice = change.unitPrice;
                  void trackNavigationEvent({
                    eventName: delta > 0 ? 'add_to_cart' : 'remove_from_cart',
                    locale,
                    productId: change.productId,
                    productSlug: change.productToken,
                    quantity: Math.abs(delta),
                    ...(Number.isFinite(unitPrice) && unitPrice >= 0
                      ? { value: Math.abs(delta) * unitPrice }
                      : {}),
                    metadata: {
                      surface: 'ai_assistant',
                      target: `cart_${change.mutation.action}`,
                    },
                  });
                }
              } catch {
                appliedMutations = [];
              }
            }
          }
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    products: result.products,
                    cartMutations: appliedMutations,
                  }
                : message,
            ),
          );
        },
        onError(error) {
          interruptedProducts = error.products;
        },
      });
    } catch (cause) {
      if (controller.signal.aborted) {
        if (!silentAbortRef.current) {
          setError(labels.stopped);
        }
        return;
      }
      const code =
        cause instanceof Error && cause.message === 'rate_limited' ? 'rate_limited' : 'unavailable';
      if (receivedText) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  interrupted: true,
                  ...(interruptedProducts?.length ? { products: interruptedProducts } : {}),
                }
              : message,
          ),
        );
      }
      setError(code === 'rate_limited' ? labels.rateLimited : labels.error);
      void trackNavigationEvent({
        eventName: 'ai_assistant_error',
        locale,
        metadata: { surface: 'ai_assistant', target: code },
      });
    } finally {
      if (activeRequestRef.current === controller) activeRequestRef.current = null;
      setPending(false);
      setReceivingText(false);
      setActivity(null);
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

  function stopGeneration() {
    activeRequestRef.current?.abort();
  }

  function retryLastMessage() {
    let userIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'user') {
        userIndex = index;
        break;
      }
    }
    const userMessage = messages[userIndex];
    if (!userMessage) return;
    setError(null);
    void sendMessage(userMessage.content, messages.slice(0, userIndex), 'retry');
  }

  function rateMessage(message: ChatEntry, rating: 'helpful' | 'not_helpful') {
    setMessages((current) =>
      current.map((entry) => (entry.id === message.id ? { ...entry, feedback: rating } : entry)),
    );
    void triggerHaptic('control');
    void trackNavigationEvent({
      eventName: 'ai_assistant_feedback',
      locale,
      metadata: {
        surface: 'ai_assistant',
        target: 'assistant_response',
        messageId: message.id,
        rating,
      },
    });
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
