# Storefront Agent Guide

Root rules apply. This app is the Customer Storefront and owns its local BFF;
Storefront API remains the canonical backend.

- Preserve French and Arabic canonical URLs and genuine RTL.
- Server-render SEO-relevant catalog and merchandising content.
- Justify client JavaScript and dependencies on weak networks and budget phones.
- Give responsive images stable dimensions and accurate `sizes`.
- Keep checkout short, forgiving, recoverable, and mobile-legible.
- Consume admin-managed content through stable typed contracts.
- Use the API client/BFF boundary; never import admin-only code or DB schema.
- Keep `GET /api/health` working.

Analytics and telemetry must not block rendering, checkout, or order submission.
Core browsing and ordering must work without AI; AI may not invent prices,
stock, delivery promises, or promotion terms.

Run affected tests, then `pnpm --filter @bric/storefront test` and
`pnpm --filter @bric/storefront test:integration`. Use `test:browser` for
affected journeys, locales, viewports, or accessibility, and
`test:performance` when the weak-phone critical path or its budgets change.
Meaningful UI work needs browser evidence in affected viewports and locales.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
