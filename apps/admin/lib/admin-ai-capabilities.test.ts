import { describe, expect, it } from 'vitest';

import { suggestionKeysForAdminAi } from './admin-ai-capabilities';
import { resolveAdminAiSurfaceContext } from './admin-ai-context';

describe('admin AI suggestions', () => {
  it('offers live Analytics prompts only when the connected slice is permitted', () => {
    const context = resolveAdminAiSurfaceContext('/en/stats/website');

    expect(suggestionKeysForAdminAi(context, ['analytics_manage'])).toEqual([
      'summarizeCurrentAnalytics',
      'explainAnalyticsChange',
    ]);
    expect(suggestionKeysForAdminAi(context, [])).toEqual(['helpCurrentSurface']);
  });

  it('does not advertise capabilities that are not connected to the model', () => {
    const context = resolveAdminAiSurfaceContext('/en/orders/ecotrack');

    expect(suggestionKeysForAdminAi(context, ['orders_write'])).toEqual(['helpCurrentSurface']);
  });
});
