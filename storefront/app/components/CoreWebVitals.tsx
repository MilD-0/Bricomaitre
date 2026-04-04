"use client";

import { useEffect } from "react";
import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals/attribution";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();

type WebVitalsMetric = {
  name: string;
  id: string;
  value: number;
  delta: number;
  rating?: string;
  navigationType?: string;
};

function ensureGtag() {
  window.dataLayer = window.dataLayer || [];

  if (typeof window.gtag !== "function") {
    window.gtag = (...args: unknown[]) => {
      window.dataLayer.push(args);
    };
  }
}

function sendToGoogleAnalytics(metric: WebVitalsMetric) {
  if (!GA_MEASUREMENT_ID) {
    return;
  }

  ensureGtag();
  const gtag = window.gtag;

  if (!gtag) {
    return;
  }

  const value = metric.name === "CLS" ? Math.round(metric.value * 1000) : Math.round(metric.value);

  gtag("event", metric.name, {
    value,
    metric_id: metric.id,
    metric_value: metric.value,
    metric_delta: metric.delta,
    metric_rating: metric.rating,
    navigation_type: metric.navigationType,
    non_interaction: true,
    send_to: GA_MEASUREMENT_ID,
  });
}

export default function CoreWebVitals() {
  useEffect(() => {
    if (!GA_MEASUREMENT_ID) {
      return;
    }

    onCLS(sendToGoogleAnalytics);
    onFCP(sendToGoogleAnalytics);
    onINP(sendToGoogleAnalytics);
    onLCP(sendToGoogleAnalytics);
    onTTFB(sendToGoogleAnalytics);
  }, []);

  return null;
}
