"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Link } from "@/i18n/navigation";

function findProducts(value, depth = 0) {
  if (depth > 5 || value == null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => findProducts(item, depth + 1));
  if (typeof value !== "object") return [];
  const item = value;
  const direct = Array.isArray(item.products) ? item.products : item.product ? [item.product] : [];
  return [...direct.filter((product) => product && typeof product === "object" && typeof product.slug === "string"), ...Object.values(item).flatMap((child) => findProducts(child, depth + 1))];
}

function ProductSuggestion({ product }) {
  const t = useTranslations("ShoppingAssistant");
  const locale = useLocale();
  const title = locale === "ar" && product.titleAr ? product.titleAr : product.title;
  return (
    <Link href={`/products/${product.slug}`} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 transition hover:border-teal-300 hover:shadow-sm">
      {product.image ? <Image src={product.image} alt="" width={64} height={64} className="h-16 w-16 rounded-xl object-contain" sizes="64px" /> : <div className="h-16 w-16 rounded-xl bg-slate-100" />}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-sm font-bold text-teal-700">{product.price} {t("currency")}</p>
        <p className={`mt-0.5 text-xs ${product.inStock ? "text-emerald-700" : "text-amber-700"}`}>{product.inStock ? t("inStock") : t("outOfStock")}</p>
      </div>
    </Link>
  );
}

export default function ShoppingAssistant() {
  const locale = useLocale();
  const t = useTranslations("ShoppingAssistant");
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(false);

  async function send() {
    const content = input.trim();
    if (!content || pending) return;
    const nextMessages = [...messages, { role: "user", content }].slice(-8);
    setMessages(nextMessages);
    setInput("");
    setPending(true);
    try {
      const response = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale, messages: nextMessages }) });
      const data = await response.json();
      setMessages((current) => [...current, { role: "assistant", content: response.ok ? (data.message || t("fallback")) : (data.error || t("unavailable")), products: response.ok ? findProducts(data.toolResults) : [] }].slice(-8));
    } catch {
      setMessages((current) => [...current, { role: "assistant", content: t("unavailable"), products: [] }].slice(-8));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[60] max-w-[calc(100vw-2rem)] sm:bottom-6 sm:right-6" dir={locale === "ar" ? "rtl" : "ltr"}>
      {open ? <section className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-2xl shadow-slate-900/20">
        <header className="flex items-start justify-between gap-3 bg-teal-700 px-4 py-3 text-white"><div><h2 className="font-semibold">{t("title")}</h2><p className="text-xs text-teal-50">{t("description")}</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-full px-2 text-lg leading-none hover:bg-white/10" aria-label={t("close")}>×</button></header>
        <div className="max-h-[50vh] min-h-48 space-y-3 overflow-y-auto p-3" aria-live="polite">
          {messages.length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{t("welcome")}</p> : null}
          {messages.map((message, index) => <div key={index} className={message.role === "user" ? "ml-8 rounded-2xl bg-teal-700 p-3 text-sm text-white" : "mr-5 rounded-2xl bg-slate-100 p-3 text-sm text-slate-800"}><p>{message.content}</p>{message.role === "assistant" && message.products?.length ? <div className="mt-3 space-y-2">{message.products.slice(0, 6).map((product) => <ProductSuggestion key={`${index}-${product.id}`} product={product} />)}</div> : null}</div>)}
          {pending ? <p className="text-sm text-slate-500">{t("thinking")}</p> : null}
        </div>
        <form className="flex gap-2 border-t border-slate-100 p-3" onSubmit={(event) => { event.preventDefault(); void send(); }}><input value={input} onChange={(event) => setInput(event.target.value)} maxLength={1500} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600" placeholder={t("placeholder")} aria-label={t("placeholder")} /><button type="submit" disabled={pending || !input.trim()} className="rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{t("send")}</button></form>
      </section> : <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-950/20 transition hover:bg-teal-800">{t("open")}</button>}
    </div>
  );
}
