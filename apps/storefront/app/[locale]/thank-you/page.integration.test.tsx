import { describe, expect, it } from 'vitest';

import { generateMetadata } from './page';

describe('localized thank-you metadata', () => {
  it('keeps order confirmation private and matches the active locale', async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ locale: 'fr' }) }),
    ).resolves.toMatchObject({
      title: 'Confirmation de commande',
      robots: { index: false, follow: false },
      referrer: 'no-referrer',
    });
    await expect(
      generateMetadata({ params: Promise.resolve({ locale: 'ar' }) }),
    ).resolves.toMatchObject({
      title: 'تأكيد الطلب',
      description: expect.stringContaining('حالة التوصيل'),
      robots: { index: false, follow: false },
      referrer: 'no-referrer',
    });
  });
});
