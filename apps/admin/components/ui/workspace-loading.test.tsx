import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import AssetsLoading from '../../app/[locale]/(app)/assets/loading';
import StatsLoading from '../../app/[locale]/(app)/stats/loading';

describe('workspace loading chrome', () => {
  afterEach(cleanup);

  it.each([
    ['assets', AssetsLoading, true],
    ['stats', StatsLoading, false],
  ] as const)(
    'keeps %s loading aligned with its final workspace',
    (name, Loading, hasNavigation) => {
      const view = render(<Loading />);

      expect(view.container.querySelectorAll('[data-workspace-frame]')).toHaveLength(1);
      expect(view.container.querySelectorAll('[data-workspace-header]')).toHaveLength(1);
      expect(view.container.querySelector(`[data-workspace-loading="${name}"]`)).not.toHaveClass(
        'rounded-[2rem]',
        'shadow-sm',
      );
      expect(view.container.querySelectorAll('[data-workspace-navigation]')).toHaveLength(
        hasNavigation ? 1 : 0,
      );
      expect(view.container.querySelectorAll('[data-workspace-toolbar]')).toHaveLength(
        name === 'stats' ? 1 : 0,
      );
    },
  );
});
