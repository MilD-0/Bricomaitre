import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { AdministrationShell } from './administration-shell';

describe('AdministrationShell', () => {
  afterEach(cleanup);

  it('uses canonical URL-backed navigation without preview labels', () => {
    const view = render(
      <AdministrationShell locale="fr" section="roles">
        <div>Active workspace</div>
      </AdministrationShell>,
    );

    expect(screen.getByText('Active workspace')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'settings.rolesManager.title' })[0]).toHaveAttribute(
      'href',
      '/fr/administration/roles',
    );
    expect(
      screen.getAllByRole('link', { name: 'settings.accessManager.title' })[0],
    ).toHaveAttribute('href', '/fr/administration');
    expect(screen.queryByText(/variation/i)).not.toBeInTheDocument();
    expect(view.container.firstElementChild).toHaveClass('-mx-1', 'min-w-0', 'lg:-mx-4');
    expect(view.container.querySelectorAll('[data-workspace-frame]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-workspace-header]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-workspace-navigation]')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'nav.administration' })).toHaveClass(
      'sr-only',
      'lg:not-sr-only',
    );
    expect(screen.getByRole('link', { name: 'settings.rolesManager.title' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
