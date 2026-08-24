import { describe, expect, it } from 'vitest';

import { getAnalytics2Copy } from './analytics2-copy';

function objectKeys(value: object) {
  return Object.keys(value).sort();
}

describe('analytics workspace copy', () => {
  it('keeps the complete presentation contract aligned across locales', () => {
    const english = getAnalytics2Copy('en');

    for (const locale of ['fr', 'ar']) {
      const copy = getAnalytics2Copy(locale);
      expect(objectKeys(copy)).toEqual(objectKeys(english));
      expect(objectKeys(copy.labels)).toEqual(objectKeys(english.labels));
      expect(objectKeys(copy.fulfillmentPhases)).toEqual(objectKeys(english.fulfillmentPhases));
    }
  });

  it('selects locale-specific operational and accessibility labels', () => {
    expect(getAnalytics2Copy('fr-FR').labels.nextSevenDayModel).toBe(
      'Modèle des 7 prochains jours',
    );
    expect(getAnalytics2Copy('ar-DZ').labels.analyticsRange).toBe('نطاق التحليلات');
    expect(getAnalytics2Copy('ar-DZ').fulfillmentPhases.delivery).toBe('قيد التوصيل');
  });
});
