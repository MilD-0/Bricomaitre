import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

import { getStorefrontRemoteImagePatterns } from './lib/product-images';
import { getAllowedDevOrigins } from './lib/dev-origins';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');
const demoMode = process.env.BRIC_DEMO_MODE?.trim().toLowerCase() === 'true';
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  typedRoutes: true,
  // Nginx owns public response compression. Keeping compression out of the
  // App Router process avoids retaining per-request zlib/RSC state when a
  // mobile client or crawler disconnects mid-response.
  compress: false,
  // This self-hosted deployment has a persistent filesystem cache. Do not
  // duplicate generated page/data entries in Next's process-local LRU: under
  // sustained catalog and ISR traffic retained request cache instances can
  // otherwise multiply that memory well beyond the nominal per-cache limit.
  cacheMaxMemorySize: 0,
  // The storefront owns both logical bottom corners: the advisor follows the
  // reading direction and commerce actions may occupy the opposite edge.
  // Next's floating development tool intercepts those controls in shared
  // previews, so keep development feedback in the terminal and browser
  // console instead of placing another fixed control over the interface.
  devIndicators: false,
  transpilePackages: ['@bric/runtime', '@bric/storefront-core'],
  allowedDevOrigins: getAllowedDevOrigins(),
  experimental: {
    // Product imagery is optimized inside the public web process. Bound
    // libvips work and avoid retaining its operation cache so native memory
    // cannot crowd the request-serving heap under a cold-cache image burst.
    imgOptConcurrency: 1,
    imgOptOperationCache: false,
    imgOptSequentialRead: true,
  },
  images: {
    // Demo catalog images are already normalized to WebP and are served from
    // host-local MinIO. Let the browser fetch them directly; an optimizer
    // inside the container cannot address the host through browser loopback.
    unoptimized: demoMode,
    // Next recommends WebP for most self-hosted deployments. AVIF encoding is
    // materially more CPU intensive and its codec can create threads outside
    // Sharp's concurrency control, which is a poor fit for this shared VPS.
    formats: ['image/webp'],
    qualities: [60, 75],
    // Next otherwise claims half of the available filesystem for optimized
    // images. Each blue/green slot has its own persistent cache, so bound each
    // copy and let Next evict least-recently-used variants.
    maximumDiskCacheSize: 512_000_000,
    // Match the admin upload contract exactly. The previous decimal 10 MB
    // ceiling rejected otherwise-valid uploads between 10,000,000 bytes and
    // the documented 10 MiB per-file limit.
    maximumResponseBody: 10 * 1024 * 1024,
    maximumRedirects: 0,
    remotePatterns: getStorefrontRemoteImagePatterns(),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT_STOREFRONT,
  release: { name: process.env.SENTRY_RELEASE },
  silent: process.env.CI !== 'true',
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  widenClientFileUpload: true,
});
