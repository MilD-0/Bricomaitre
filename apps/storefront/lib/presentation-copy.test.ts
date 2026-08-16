import { describe, expect, it } from 'vitest';

import arabic from '@/messages/ar.json';
import french from '@/messages/fr.json';

describe('customer-facing translation catalog', () => {
  it('uses customer language and excludes internal rebuild placeholders', () => {
    expect(french.Navigation.checkout).toBe('Passer commande');
    expect(arabic.Navigation.checkout).toBe('الدفع');

    const publishedCopy = JSON.stringify({ french, arabic });
    expect(publishedCopy).not.toMatch(
      /Nouveau storefront|rebuild|foundation|admin-ready|Landing admin/i,
    );
  });
});
