'use client';

import {
  shoppingAssistantCartMutationSchema,
  shoppingAssistantProductSchema,
  type ShoppingAssistantCartMutation,
  type ShoppingAssistantProduct,
  type ShoppingAssistantToolName,
} from '@bric/storefront-core/shopping-assistant-contracts';
import { Check, PackageSearch, ShoppingCart } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';

import { StorefrontImage } from '@/components/storefront-image';
import type { Locale } from '@/i18n/config';
import { getAnalyticsIdentity, trackNavigationEvent } from '@/lib/analytics';
import {
  recordAssistantEngagement,
  recordAssistantRecommendationClick,
} from '@/lib/assistant-attribution';
import { addCartItem, readCart, writeCart } from '@/lib/cart';
import { triggerHaptic } from '@/lib/haptics';
import { formatProductPrice } from '@/lib/product-presentation';
import { buildShoppingAssistantPageContext } from '@/lib/shopping-assistant';
import { applyShoppingAssistantCartMutations } from '@/lib/shopping-assistant-cart';
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
  addToCart: string;
  addedToCart: string;
  cartUpdated: string;
  helpful: string;
  notHelpful: string;
  inputLabel: string;
  quickPrompts: string[];
};

const chatEntrySchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4_000),
  products: z.array(shoppingAssistantProductSchema).max(8).optional(),
  cartMutations: z.array(shoppingAssistantCartMutationSchema).max(8).optional(),
  feedback: z.enum(['helpful', 'not_helpful']).optional(),
  interrupted: z.boolean().optional(),
});
type ChatEntry = z.infer<typeof chatEntrySchema>;
const chatStoragePrefix = 'bricomaitre-shopping-assistant-chat-v1';

function storedEntries(value: unknown): ChatEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-40).flatMap((entry) => {
    const parsed = chatEntrySchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

function localizedTitle(product: ShoppingAssistantProduct, locale: Locale) {
  return locale === 'ar' && product.titleAr?.trim() ? product.titleAr.trim() : product.title;
}

export function ProductResult({
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
    try {
      const next = addCartItem(readCart(window.localStorage), {
        productId: product.id,
        token: product.token,
        title,
        imageUrl: product.imageUrl,
        unitPrice: Number(product.price),
        quantity: 1,
        availabilityStatus: product.availabilityStatus,
      });
      if (!writeCart(window.localStorage, next)) return;
    } catch {
      return;
    }
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
        {added ? labels.addedToCart : labels.addToCart}
      </button>
    </div>
  );
}

export function useShoppingAssistantPanel({
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
                if (writeCart(window.localStorage, applied.items)) {
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

  return {
    view: {
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
    } as const,
    fallback: null,
  };
}
