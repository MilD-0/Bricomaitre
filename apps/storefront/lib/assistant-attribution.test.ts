import { beforeEach, describe, expect, it } from 'vitest';

import {
  getAssistantOrderInfluence,
  recordAssistantEngagement,
  recordAssistantOpen,
  recordAssistantRecommendationClick,
} from './assistant-attribution';

describe('assistant order influence', () => {
  const identity = { journeyId: 'journey-1', sessionId: 'session-1' };

  beforeEach(() => window.localStorage.clear());

  it('captures durable behavioral evidence for assistant conversion attribution', () => {
    recordAssistantOpen(identity, 1_720_000_000_000);
    recordAssistantEngagement(identity, 1_720_000_010_000);
    recordAssistantRecommendationClick(identity, 42, 1_720_000_020_000);
    recordAssistantRecommendationClick(identity, 42, 1_720_000_030_000);

    const result = getAssistantOrderInfluence(identity, 1_720_000_040_000);
    expect(result).toMatchObject({
      sourceSessionId: 'session-1',
      openedAt: '2024-07-03T09:46:40.000Z',
      engagedAt: '2024-07-03T09:46:50.000Z',
      recommendationClickedAt: '2024-07-03T09:47:10.000Z',
      clickedProductIds: [42],
    });
    expect(JSON.stringify(result)).not.toMatch(/message|prompt|content/i);
  });

  it('expires influence after 24 hours and does not cross journeys', () => {
    recordAssistantEngagement(identity, 1_720_000_000_000);
    expect(
      getAssistantOrderInfluence(identity, 1_720_000_000_000 + 24 * 60 * 60 * 1000 + 1),
    ).toBeNull();
    expect(
      getAssistantOrderInfluence(
        { journeyId: 'journey-2', sessionId: 'session-2' },
        1_720_000_010_000,
      ),
    ).toBeNull();
  });
});
