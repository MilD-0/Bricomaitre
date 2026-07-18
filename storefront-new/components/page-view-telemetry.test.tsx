import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ pathname: vi.fn(), track: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: mocks.pathname }));
vi.mock('@/lib/analytics', () => ({ trackPageView: mocks.track }));

import { PageViewTelemetry } from './page-view-telemetry';

describe('PageViewTelemetry', () => {
  beforeEach(() => { mocks.pathname.mockReset(); mocks.track.mockReset().mockResolvedValue(null); });
  it('classifies admin-created campaigns as landing pages', async () => {
    mocks.pathname.mockReturnValue('/fr/landing/perceuse-20v');
    render(<PageViewTelemetry locale="fr" />);
    await waitFor(() => expect(mocks.track).toHaveBeenCalledWith({ locale: 'fr', pageType: 'landing' }));
  });
});
