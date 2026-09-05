import { describe, expect, it } from 'vitest';

import { getAiStatsCopy } from './ai-stats-copy';

function objectKeys(value: object) {
  return Object.keys(value).sort();
}

describe('AI stats copy', () => {
  it('keeps entity labels aligned across locales', () => {
    const english = getAiStatsCopy('en');

    for (const locale of ['fr', 'ar']) {
      const copy = getAiStatsCopy(locale);
      expect(objectKeys(copy.entities)).toEqual(objectKeys(english.entities));
      expect(objectKeys(copy.entities.workflows)).toEqual(objectKeys(english.entities.workflows));
      expect(objectKeys(copy.entities.tools)).toEqual(objectKeys(english.entities.tools));
      expect(objectKeys(copy.entities.changes)).toEqual(objectKeys(english.entities.changes));
      expect(objectKeys(copy.entities.statuses)).toEqual(objectKeys(english.entities.statuses));
      expect(objectKeys(copy.entities.intents)).toEqual(objectKeys(english.entities.intents));
    }
  });

  it('uses operational language in French and Arabic', () => {
    expect(getAiStatsCopy('fr-FR').entities.workflows.admin_chat).toBe('Assistant admin');
    expect(getAiStatsCopy('fr-FR').entities.intents.product_discovery).toBe(
      'Découverte de produits',
    );
    expect(getAiStatsCopy('ar-DZ').entities.statuses.provider_timeout).toBe('انتهت مهلة المزود');
  });
});
