'use client';

import type {
  ShoppingAssistantProduct,
  ShoppingAssistantResponse,
} from '@bric/storefront-core/shopping-assistant-contracts';
import { ArrowUp, Bot, PackageSearch, Sparkles } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { MobileSheet } from '@/components/mobile-sheet';
import { StorefrontImage } from '@/components/storefront-image';
import type { Locale } from '@/i18n/config';
import { trackNavigationEvent } from '@/lib/analytics';
import { triggerHaptic } from '@/lib/haptics';
import { formatProductPrice } from '@/lib/product-presentation';

export type ShoppingAssistantLabels = {
  open: string;
  title: string;
  close: string;
  liveCatalog: string;
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
          <StorefrontImage src={product.imageUrl} alt="" width={96} height={96} sizes="72px" quality={60} />
        ) : <PackageSearch aria-hidden="true" size={26} />}
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
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

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
    void triggerHaptic('primary');
    void trackNavigationEvent({
      eventName: 'ai_assistant_message',
      locale,
      metadata: { surface: 'ai_assistant', target: 'submitted' },
    });

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locale,
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
      const result = await response.json() as ShoppingAssistantResponse;
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.message,
        products: result.products,
        mode: result.mode,
      }]);
    } catch (cause) {
      const code = cause instanceof Error && cause.message === 'rate_limited' ? 'rate_limited' : 'unavailable';
      setError(code === 'rate_limited' ? labels.rateLimited : labels.error);
      void trackNavigationEvent({
        eventName: 'ai_assistant_error',
        locale,
        metadata: { surface: 'ai_assistant', target: code },
      });
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  return (
    <MobileSheet
      title={labels.title}
      closeLabel={labels.close}
      className="shopping-assistant-sheet"
      headerAction={<span className="shopping-assistant-live"><span aria-hidden="true" />{labels.liveCatalog}</span>}
      onClose={onClose}
      footer={(
        <form className="shopping-assistant-form" onSubmit={submit}>
          <label className="sr-only" htmlFor={inputId}>{labels.inputLabel}</label>
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
      )}
    >
      <div className="shopping-assistant-conversation" aria-live="polite" aria-busy={pending}>
        <section className="shopping-assistant-intro">
          <span className="shopping-assistant-intro-icon"><Sparkles aria-hidden="true" size={22} /></span>
          <div><h3>{labels.welcomeTitle}</h3><p>{labels.welcomeDescription}</p></div>
        </section>

        {!messages.length ? (
          <div className="shopping-assistant-prompts">
            {labels.quickPrompts.map((prompt) => (
              <button key={prompt} type="button" onClick={() => void sendMessage(prompt)}>{prompt}</button>
            ))}
          </div>
        ) : null}

        <div className="shopping-assistant-messages">
          {messages.map((message) => (
            <article key={message.id} className={`shopping-assistant-message is-${message.role}`}>
              {message.role === 'assistant' ? <span className="shopping-assistant-avatar"><Bot aria-hidden="true" size={16} /></span> : null}
              <div className="shopping-assistant-bubble">
                {message.mode === 'fallback' ? <small>{labels.fallback}</small> : null}
                <p>{message.content}</p>
                {message.products?.length ? (
                  <div className="shopping-assistant-results">
                    {message.products.map((product, index) => (
                      <ProductResult key={product.id} product={product} locale={locale} labels={labels} position={index + 1} />
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
          {pending ? (
            <div className="shopping-assistant-thinking" role="status">
              <span /><span /><span /><em>{labels.thinking}</em>
            </div>
          ) : null}
          {error ? <p className="shopping-assistant-error" role="alert">{error}</p> : null}
          <div ref={endRef} />
        </div>
      </div>
    </MobileSheet>
  );
}
