"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import {
  getPageType,
  markSessionStarted,
  trackAnalyticsEvent,
} from "@/lib/analytics";

export default function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const query = window.location.search.slice(1);

    if (markSessionStarted()) {
      void trackAnalyticsEvent({
        eventName: "session_start",
        gaEventName: "session_start",
        pagePath: query ? `${pathname}?${query}` : pathname,
        pageType: getPageType(pathname),
      });
    }
  }, [pathname]);

  useEffect(() => {
    const query = window.location.search.slice(1);
    const pagePath = query ? `${pathname}?${query}` : pathname;

    void trackAnalyticsEvent({
      eventName: "page_view",
      gaEventName: "page_view",
      pagePath,
      pageType: getPageType(pathname),
      gaParams: {
        page_title: document.title,
      },
      metadata: {
        title: document.title,
        isEntry: pathname === window.location.pathname && window.history.length <= 1,
      },
    });
  }, [pathname]);

  return null;
}
