import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

import { getStorefrontImageOrigins, getStorefrontRemoteImagePatterns } from './lib/product-images';
import { getAllowedDevOrigins } from './lib/dev-origins';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');
const configuredImageSources = getStorefrontImageOrigins().join(' ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      `img-src 'self' data: blob: https:${configuredImageSources ? ` ${configuredImageSources}` : ''}`,
      "font-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
      "connect-src 'self' https: wss:",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  typedRoutes: true,
  transpilePackages: ['@bric/ai-core', '@bric/runtime', '@bric/storefront-core'],
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
    // Next recommends WebP for most self-hosted deployments. AVIF encoding is
    // materially more CPU intensive and its codec can create threads outside
    // Sharp's concurrency control, which is a poor fit for this shared VPS.
    formats: ['image/webp'],
    qualities: [60, 75],
    // Next otherwise claims half of the available filesystem for optimized
    // images. Each blue/green slot has its own persistent cache, so bound each
    // copy and let Next evict least-recently-used variants.
    maximumDiskCacheSize: 512_000_000,
    maximumResponseBody: 10_000_000,
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

export default withSentryConfig(withNextIntl(nextConfig), { silent: true });
