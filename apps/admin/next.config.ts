import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

import { ADMIN_API_CONTENT_SECURITY_POLICY } from './lib/content-security-policy';

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
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: ADMIN_API_CONTENT_SECURITY_POLICY,
          },
        ],
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
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT_ADMIN,
  release: { name: process.env.SENTRY_RELEASE },
  silent: process.env.CI !== 'true',
  sourcemaps: {
    assets: [
      path.join(appRoot, '.next/server'),
      path.join(appRoot, '.next/static/chunks'),
      path.join(appRoot, 'dist/run-background-workers.cjs'),
      path.join(appRoot, 'dist/run-background-workers.cjs.map'),
    ],
    deleteSourcemapsAfterUpload: true,
  },
  widenClientFileUpload: true,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
