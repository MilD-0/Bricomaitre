# Admin Agent Guide

Root rules apply.

- Enforce RBAC on every privileged route and mutation.
- Validate untrusted input at trust boundaries with established schema tooling.
- Keep public storefront logic out of admin handlers.
- Preserve English, French, Arabic, and genuine RTL behavior.
- Mutations need pending, success, failure, and recovery states. Reversible UI
  needs its reverse action: open/close, expand/collapse, enable/disable.

Admin owns schema and migrations. Use
`pnpm --filter @bric/admin db:generate`; never hand-write migration SQL. Commit
SQL, journal, and snapshot together, and never edit applied migrations. Verify
with `pnpm --filter @bric/admin db:verify`. Use `db:push` only on a disposable
local database.

Run `pnpm --filter @bric/admin test`, then
`pnpm --filter @bric/admin test:integration`—never concurrently. Run
`pnpm --filter @bric/admin test:browser` when an affected workflow needs
browser evidence.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
