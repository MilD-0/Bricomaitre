import { describe, expect, it } from 'vitest';

import { getAnalyticsCopy } from './analytics-copy';

function objectKeys(value: object) {
  return Object.keys(value).sort();
}

describe('analytics workspace copy', () => {
  it('keeps the complete presentation contract aligned across locales', () => {
    const english = getAnalyticsCopy('en');

    for (const locale of ['fr', 'ar']) {
      const copy = getAnalyticsCopy(locale);
      expect(objectKeys(copy)).toEqual(objectKeys(english));
      expect(objectKeys(copy.labels)).toEqual(objectKeys(english.labels));
      expect(objectKeys(copy.fulfillmentPhases)).toEqual(objectKeys(english.fulfillmentPhases));
      expect(objectKeys(copy.assumptions)).toEqual(objectKeys(english.assumptions));
    }
  });

  it('selects locale-specific operational and accessibility labels', () => {
    expect(getAnalyticsCopy('fr-FR').labels.nextSevenDayModel).toBe('Modèle des 7 prochains jours');
    expect(getAnalyticsCopy('ar-DZ').labels.analyticsRange).toBe('نطاق التحليلات');
    expect(getAnalyticsCopy('ar-DZ').fulfillmentPhases.delivery).toBe('قيد التوصيل');
    expect(getAnalyticsCopy('fr-FR').assumptions.default).toBe('Par défaut');
  });
});
