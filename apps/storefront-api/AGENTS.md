# Storefront API Agent Guide

Root rules apply. This app is the canonical public catalog and order backend.

- Keep rate limiting and idempotency on public order mutations.
- Keep token authorization on public order reads and updates.
- Return deliberate structured 4xx responses for invalid input.
- Keep shared contracts, authorization, and services in
  `../../packages/storefront-core`; update every caller with contract changes.
- Keep `GET /api/health` representative of readiness.

Run the affected tests, then `pnpm --filter @bric/storefront-api test`. Build
only when production bundling or runtime behavior is part of the evidence.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
