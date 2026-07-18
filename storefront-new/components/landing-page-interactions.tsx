'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { ArrowUpRightIcon, type ArrowUpRightIconHandle } from '@/components/ui/arrow-up-right';
import { prepareHaptics, triggerHaptic } from '@/lib/haptics';

export function LandingFaqItem({ question, answer }: { question: string; answer: string }) {
  const armed = useRef(false);

  function prepareFeedback() {
    armed.current = true;
    void prepareHaptics();
  }

  function announceToggle() {
    if (!armed.current) return;
    armed.current = false;
    void triggerHaptic('control');
  }

  return <details onPointerDown={prepareFeedback} onPointerCancel={() => { armed.current = false; }} onKeyDown={(event) => {
    if (event.key === 'Enter' || event.key === ' ') prepareFeedback();
  }} onToggle={announceToggle}>
    <summary><span>{question}</span><ChevronDown className="landing-faq-chevron" aria-hidden="true" /></summary>
    <p>{answer}</p>
  </details>;
}

export function LandingFinalCtaLink({ href, label }: { href: string; label: string }) {
  const iconRef = useRef<ArrowUpRightIconHandle>(null);
  const start = () => iconRef.current?.startAnimation();
  const stop = () => iconRef.current?.stopAnimation();

  return <a
    href={href}
    onPointerDown={() => { void prepareHaptics(); start(); }}
    onPointerEnter={start}
    onPointerLeave={stop}
    onFocus={start}
    onBlur={stop}
    onClick={() => { void triggerHaptic('primary'); }}
  >
    <span>{label}</span>
    <ArrowUpRightIcon ref={iconRef} className="landing-final-cta-icon" size={18} aria-hidden="true" />
  </a>;
}

export function LandingMobileCta({ href, label, price }: { href: string; label: string; price: string }) {
  const [visible, setVisible] = useState(true);
  const iconRef = useRef<ArrowUpRightIconHandle>(null);

  useEffect(() => {
    const target = document.querySelector(href);
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), { threshold: 0.08 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [href]);

  return <aside className="landing-mobile-cta" data-visible={visible ? 'true' : 'false'} aria-label={label}>
    <strong>{price}</strong>
    <a
      href={href}
      aria-label={`${label} — ${price}`}
      onPointerDown={() => { void prepareHaptics(); iconRef.current?.startAnimation(); }}
      onPointerLeave={() => iconRef.current?.stopAnimation()}
      onFocus={() => iconRef.current?.startAnimation()}
      onBlur={() => iconRef.current?.stopAnimation()}
      onClick={() => { void triggerHaptic('primary'); }}
    >
      <span>{label}</span>
      <ArrowUpRightIcon ref={iconRef} size={18} aria-hidden="true" />
    </a>
  </aside>;
}
