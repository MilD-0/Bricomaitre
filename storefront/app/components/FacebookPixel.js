"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useState } from "react";
import { handlePageView } from "./Init";
import { FB_PIXEL_ID } from "../../lib/fpixel";

const FacebookPixel = () => {
  const [loaded, setLoaded] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!loaded || !pathname) return;
    void handlePageView();
  }, [pathname, loaded]);

  if (!FB_PIXEL_ID) {
    return null;
  }

  return (
    <Script
      id="fb-pixel"
      src="/scripts/pixel.js"
      strategy="afterInteractive"
      onLoad={() => setLoaded(true)}
      data-pixel-id={FB_PIXEL_ID}
    />
  );
};

export default FacebookPixel;
