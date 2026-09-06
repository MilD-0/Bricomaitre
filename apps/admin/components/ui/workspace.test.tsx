import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import { WorkspaceNavigation, WorkspaceNavigationLink } from './workspace';

it('identifies the active workspace destination for assistive navigation', () => {
  render(
    <WorkspaceNavigation aria-label="Workspace views">
      <WorkspaceNavigationLink href="/one">One</WorkspaceNavigationLink>
      <WorkspaceNavigationLink href="/two" active>
        Two
      </WorkspaceNavigationLink>
    </WorkspaceNavigation>,
  );
  const navigation = within(screen.getByRole('navigation', { name: 'Workspace views' }));
  expect(navigation.getByRole('link', { name: 'One' })).not.toHaveAttribute('aria-current');
  expect(navigation.getByRole('link', { name: 'Two' })).toHaveAttribute('aria-current', 'page');
  expect(navigation.getByRole('link', { name: 'Two' })).toHaveAttribute('href', '/two');
});
