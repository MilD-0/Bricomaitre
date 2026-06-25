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

  return null;
}
