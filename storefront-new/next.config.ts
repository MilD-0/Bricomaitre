import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from '@sentry/nextjs';

import { getStorefrontRemoteImagePatterns } from './lib/product-images';
import { getAllowedDevOrigins } from './lib/dev-origins';

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  typedRoutes: true,
  allowedDevOrigins: getAllowedDevOrigins(),
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [60, 75],
    remotePatterns: getStorefrontRemoteImagePatterns(),
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
};

export default withSentryConfig(withNextIntl(nextConfig), { silent: true });
