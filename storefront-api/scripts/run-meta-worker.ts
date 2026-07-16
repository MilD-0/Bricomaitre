import * as Sentry from "@sentry/node";

import { getDb } from "@bric/db/client";
import {
  clearExpiredMetaAttribution,
  processMetaOutboxBatch,
  reconcileOrderConfirmedEvents,
  reconcileOrderCompletedEvents,
  updateMetaWorkerHeartbeat,
} from "@bric/storefront-core/meta";
import {
  clearExpiredMarketingAttribution,
  processMarketingOutboxBatch,
  reconcileMarketingOrderEvents,
} from "@bric/storefront-core/marketing";

const POLL_INTERVAL_MS = 1_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const RECONCILIATION_INTERVAL_MS = 60_000;

Sentry.init({
  dsn: process.env.SENTRY_DSN_STOREFRONT_API?.trim() || undefined,
  enabled: Boolean(process.env.SENTRY_DSN_STOREFRONT_API?.trim()),
  environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE?.trim() || undefined,
  initialScope: {
    tags: {
      service: "storefront-meta-worker",
    },
  },
});

let stopping = false;
let lastHeartbeatAt = 0;
let lastReconciliationAt = 0;

async function run() {
  const db = getDb();
  console.log("[storefront-meta-worker] started");

  while (!stopping) {
    const cycleStartedAt = Date.now();
    try {
      let reconciliationResult: Record<string, unknown> | undefined;
      if (cycleStartedAt - lastReconciliationAt >= RECONCILIATION_INTERVAL_MS) {
        const confirmations = await reconcileOrderConfirmedEvents(db);
        const completions = await reconcileOrderCompletedEvents(db);
        const marketing = await reconcileMarketingOrderEvents(db);
        const retention = await clearExpiredMetaAttribution(db);
        const marketingRetention = await clearExpiredMarketingAttribution(db);
        reconciliationResult = { ...confirmations, ...completions, ...marketing, ...retention, ...marketingRetention };
        lastReconciliationAt = cycleStartedAt;
      }
      const drain = await processMetaOutboxBatch(db);
      const marketingDrain = await processMarketingOutboxBatch(db);
      if (
        reconciliationResult
        || cycleStartedAt - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS
      ) {
        await updateMetaWorkerHeartbeat(db, {
          successfulDrain: true,
          reconciliationResult,
        });
        lastHeartbeatAt = cycleStartedAt;
      }
      if (drain.claimed >= 50 || marketingDrain.claimed >= 50) continue;
    } catch (error) {
      console.error("[storefront-meta-worker] cycle failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      Sentry.captureException(error);
    }
    const elapsed = Date.now() - cycleStartedAt;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, POLL_INTERVAL_MS - elapsed)));
  }
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[storefront-meta-worker] stopping on ${signal}`);
  await Sentry.close(2_000);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("uncaughtException", (error) => {
  Sentry.captureException(error);
  void Sentry.flush(2_000);
});
process.on("unhandledRejection", (error) => {
  Sentry.captureException(error);
  void Sentry.flush(2_000);
});

void run().catch(async (error) => {
  console.error("[storefront-meta-worker] fatal startup failure", {
    message: error instanceof Error ? error.message : String(error),
  });
  Sentry.captureException(error);
  await Sentry.close(2_000);
  process.exitCode = 1;
});
