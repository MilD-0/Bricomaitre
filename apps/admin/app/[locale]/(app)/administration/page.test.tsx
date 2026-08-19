import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ administrationPage: vi.fn() }));

vi.mock('../../../../components/administration/administration-page', () => ({
  AdministrationPage: ({ locale }: { locale: string }) => {
    mocks.administrationPage(locale);
    return <div>Canonical administration</div>;
  },
}));

import Page from './page';

describe('Administration route', () => {
  afterEach(cleanup);

  it('renders the canonical administration workspace for the active locale', async () => {
    render(await Page({ params: Promise.resolve({ locale: 'fr' }) }));

    expect(screen.getByText('Canonical administration')).toBeInTheDocument();
    expect(mocks.administrationPage).toHaveBeenCalledWith('fr');
  });
});
