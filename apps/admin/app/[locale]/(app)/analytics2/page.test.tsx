import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { hasDbMock, requireStatsPageAccessMock, getAnalytics2DataMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  requireStatsPageAccessMock: vi.fn(),
  getAnalytics2DataMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: hasDbMock }));
vi.mock('../../../../lib/page-access', () => ({
  requireStatsPageAccess: requireStatsPageAccessMock,
}));
vi.mock('../../../../lib/analytics2', async () => {
  const actual = await vi.importActual<typeof import('../../../../lib/analytics2')>(
    '../../../../lib/analytics2',
  );
  return { ...actual, getAnalytics2Data: getAnalytics2DataMock };
});
vi.mock('../../../../components/analytics2/analytics2-workspace', () => ({
  Analytics2Workspace: ({ initialData }: { initialData: { view: string } }) => (
    <div>Analytics2Workspace · {initialData.view}</div>
  ),
}));

import Analytics2Page from './page';

describe('Analytics2Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasDbMock.mockReturnValue(true);
    requireStatsPageAccessMock.mockResolvedValue(undefined);
    getAnalytics2DataMock.mockResolvedValue({ view: 'fulfillment' });
  });

  it('hydrates the requested independent analytics view after RBAC', async () => {
    const ui = await Analytics2Page({
      params: Promise.resolve({ locale: 'fr' }),
      searchParams: Promise.resolve({
        view: 'fulfillment',
        range: '90d',
        grain: 'week',
      }),
    });
    render(ui);

    expect(requireStatsPageAccessMock).toHaveBeenCalledWith('fr');
    expect(getAnalytics2DataMock).toHaveBeenCalledWith({
      view: 'fulfillment',
      range: '90d',
      grain: 'week',
    });
    expect(screen.getByText('Analytics2Workspace · fulfillment')).toBeInTheDocument();
  });

  it('falls back to the command workspace for malformed URL filters', async () => {
    const ui = await Analytics2Page({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ range: 'custom', startDate: '2026-08-01' }),
    });
    render(ui);

    expect(getAnalytics2DataMock).toHaveBeenCalledWith({
      view: 'command',
      range: '30d',
      grain: 'auto',
    });
  });
});
