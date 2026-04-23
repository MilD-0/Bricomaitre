"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect } from "react";
import { handlePageView } from "./Init";
import { FB_PIXEL_ID } from "../../lib/fpixel";

const FacebookPixel = () => {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    void handlePageView();
  }, [pathname]);

  if (!FB_PIXEL_ID) {
    return null;
  }

  return (
    <Script
      id="fb-pixel"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            var eventId =
              window.crypto && typeof window.crypto.randomUUID === 'function'
                ? window.crypto.randomUUID()
                : String(Date.now()) + '-' + Math.random().toString(36).slice(2, 12);
            window.__bricInitialPageViewEventId = eventId;
          })();
          (function(f,b,e,v,n,t,s){
            if(f.fbq) return;
            n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq) f._fbq=n;
            n.push=n;
            n.loaded=!0;
            n.version='2.0';
            n.queue=[];
            t=b.createElement(e);
            t.async=!0;
            t.src=v;
            s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s);
          })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
          window.fbq('init', ${JSON.stringify(FB_PIXEL_ID)});
          window.fbq('track', 'PageView', undefined, { eventID: window.__bricInitialPageViewEventId });
          window.__bricInitialPageViewSent = true;
        `,
      }}
    />
  );
};

export default FacebookPixel;
