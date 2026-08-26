import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');
const appRoot = path.dirname(fileURLToPath(import.meta.url));
const tailwindCssEntry = path.join(appRoot, 'node_modules/tailwindcss/index.css');

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https:",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''} https:`,
      "connect-src 'self' https: wss:",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['bullmq', 'ioredis'],
  experimental: {
    turbopackFileSystemCacheForDev: true,
    turbopackFileSystemCacheForBuild: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  turbopack: {
    resolveAlias: {
      // Keep the Tailwind CSS import app-local so workspace-root builds do not rely on hoisting.
      tailwindcss: tailwindCssEntry,
    },
  },
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(typeof config.resolve.alias === 'object' ? config.resolve.alias : {}),
      tailwindcss: tailwindCssEntry,
    };

    return config;
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
