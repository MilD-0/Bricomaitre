import { getDb } from '@bric/db/client';
import { storefrontSettings } from '@bric/db/schema';
import { checkoutFieldsSchema, DEFAULT_CHECKOUT_FIELDS } from '@bric/storefront-core/settings';
import { eq } from 'drizzle-orm';

// Order acceptance reads the current policy, independently of the public response cache.
export async function readCheckoutFields() {
  const [row] = await getDb()
    .select({ fields: storefrontSettings.checkoutFields })
    .from(storefrontSettings)
    .where(eq(storefrontSettings.id, 1))
    .limit(1);
  return checkoutFieldsSchema.parse(row?.fields ?? DEFAULT_CHECKOUT_FIELDS);
}
