import { QueryClient } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ADMIN_AI_MUTATION_EVENT } from '../lib/admin-ai-events';
import { AppProviders } from './app-providers';

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: navigation.refresh }),
}));

describe('AppProviders', () => {
  beforeEach(() => navigation.refresh.mockReset());
  afterEach(() => cleanup());

  it('refreshes application data after an assistant mutation', () => {
    const invalidateQueries = vi
      .spyOn(QueryClient.prototype, 'invalidateQueries')
      .mockResolvedValue();
    render(
      <AppProviders locale="en" messages={{}}>
        <div>provider-child</div>
      </AppProviders>,
    );

    window.dispatchEvent(new CustomEvent(ADMIN_AI_MUTATION_EVENT));

    expect(navigation.refresh).toHaveBeenCalledOnce();
    expect(invalidateQueries).toHaveBeenCalledWith({ refetchType: 'active' });
    invalidateQueries.mockRestore();
  });
});
