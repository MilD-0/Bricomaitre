'use client';

import { z } from 'zod';

const ASSISTANT_ATTRIBUTION_KEY = 'bric:assistant:influence:v1';
const ASSISTANT_ATTRIBUTION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const assistantAttributionSchema = z
  .object({
    sourceSessionId: z.string().trim().min(1).max(120),
    journeyId: z.string().trim().min(1).max(120),
    openedAt: z.number().int().positive().nullable(),
    engagedAt: z.number().int().positive().nullable(),
    recommendationClickedAt: z.number().int().positive().nullable(),
    clickedProductIds: z.array(z.number().int().positive()).max(20),
    capturedAt: z.number().int().positive(),
  })
  .strict();

type AnalyticsIdentity = {
  journeyId: string | null;
  sessionId: string | null;
};

function readAttribution(now: number, journeyId: string) {
  try {
    const parsed = assistantAttributionSchema.safeParse(
      JSON.parse(window.localStorage.getItem(ASSISTANT_ATTRIBUTION_KEY) ?? 'null'),
    );
    if (
      parsed.success &&
      parsed.data.journeyId === journeyId &&
      now - parsed.data.capturedAt <= ASSISTANT_ATTRIBUTION_MAX_AGE_MS
    ) {
      return parsed.data;
    }
  } catch {
    // Invalid state is replaced below.
  }
  return null;
}

function record(
  identity: AnalyticsIdentity,
  kind: 'open' | 'engaged' | 'recommendation_clicked',
  productId: number | null,
  now: number,
) {
  if (!identity.journeyId || !identity.sessionId) return null;
  const current = readAttribution(now, identity.journeyId);
  const clickedProductIds =
    kind === 'recommendation_clicked' && productId
      ? [...new Set([...(current?.clickedProductIds ?? []), productId])].slice(-20)
      : (current?.clickedProductIds ?? []);
  const next = assistantAttributionSchema.parse({
    sourceSessionId: identity.sessionId,
    journeyId: identity.journeyId,
    openedAt: kind === 'open' ? (current?.openedAt ?? now) : (current?.openedAt ?? null),
    engagedAt: kind === 'engaged' ? (current?.engagedAt ?? now) : (current?.engagedAt ?? null),
    recommendationClickedAt:
      kind === 'recommendation_clicked' ? now : (current?.recommendationClickedAt ?? null),
    clickedProductIds,
    capturedAt: now,
  });
  try {
    window.localStorage.setItem(ASSISTANT_ATTRIBUTION_KEY, JSON.stringify(next));
  } catch {
    // Influence capture is best-effort and never blocks assistant or commerce behavior.
  }
  return next;
}

export function recordAssistantOpen(identity: AnalyticsIdentity, now = Date.now()) {
  return record(identity, 'open', null, now);
}

export function recordAssistantEngagement(identity: AnalyticsIdentity, now = Date.now()) {
  return record(identity, 'engaged', null, now);
}

export function recordAssistantRecommendationClick(
  identity: AnalyticsIdentity,
  productId: number,
  now = Date.now(),
) {
  return record(identity, 'recommendation_clicked', productId, now);
}

export function getAssistantOrderInfluence(identity: AnalyticsIdentity, now = Date.now()) {
  if (!identity.journeyId || !identity.sessionId) return null;
  const current = readAttribution(now, identity.journeyId);
  if (!current) return null;
  return {
    sourceSessionId: current.sourceSessionId,
    journeyId: current.journeyId,
    openedAt: current.openedAt ? new Date(current.openedAt).toISOString() : null,
    engagedAt: current.engagedAt ? new Date(current.engagedAt).toISOString() : null,
    recommendationClickedAt: current.recommendationClickedAt
      ? new Date(current.recommendationClickedAt).toISOString()
      : null,
    clickedProductIds: current.clickedProductIds,
    capturedAt: new Date(current.capturedAt).toISOString(),
  };
}
