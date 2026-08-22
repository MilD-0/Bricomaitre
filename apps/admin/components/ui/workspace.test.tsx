import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceNavigation,
  WorkspaceNavigationLink,
  WorkspaceToolbar,
} from './workspace';

describe('workspace chrome', () => {
  it('provides one semantic page heading and the shared structure', () => {
    render(
      <WorkspaceFrame className="custom-frame">
        <WorkspaceHeader className="custom-header">
          <WorkspaceHeading title="Products" meta="24" description="Catalog records" />
          <WorkspaceActions>
            <button type="button">Export</button>
            <button type="button">New product</button>
          </WorkspaceActions>
        </WorkspaceHeader>
        <WorkspaceToolbar>Filters</WorkspaceToolbar>
      </WorkspaceFrame>,
    );

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Products' })).toHaveClass('sr-only', 'lg:not-sr-only');
    expect(screen.getByText('24')).toHaveClass('tabular-nums');
    expect(screen.getByText('Catalog records')).toHaveClass('text-muted-foreground');

    const frame = screen.getByText('Filters').closest('[data-workspace-frame]');
    expect(frame).toHaveClass('-mx-1', 'min-w-0', 'custom-frame');
    expect(frame?.querySelector('[data-workspace-header]')).toHaveClass(
      'lg:min-h-[4.75rem]',
      'custom-header',
    );
    expect(frame?.querySelector('[data-workspace-toolbar]')).toBeInTheDocument();
  });

  it('keeps document titles visible on mobile', () => {
    render(<WorkspaceHeading title="Landing page" showTitleOnMobile />);

    expect(screen.getByRole('heading', { name: 'Landing page' })).toHaveClass('text-xl');
    expect(screen.getByRole('heading', { name: 'Landing page' })).not.toHaveClass('sr-only');
  });

  it('preserves action order and navigation semantics', () => {
    render(
      <>
        <WorkspaceActions>
          <button type="button">Secondary</button>
          <button type="button">Primary</button>
        </WorkspaceActions>
        <WorkspaceNavigation aria-label="Workspace views" className="logical-nav">
          <WorkspaceNavigationLink href="/one">One</WorkspaceNavigationLink>
          <WorkspaceNavigationLink href="/two" active>
            Two
          </WorkspaceNavigationLink>
        </WorkspaceNavigation>
      </>,
    );

    const actions = screen.getByText('Secondary').closest('[data-workspace-actions]');
    expect(within(actions as HTMLElement).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Secondary',
      'Primary',
    ]);

    const navigation = screen.getByRole('navigation', { name: 'Workspace views' });
    expect(navigation).toHaveClass('overflow-x-auto', 'logical-nav');
    expect(within(navigation).getByRole('link', { name: 'Two' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(navigation).getByRole('link', { name: 'Two' })).toHaveClass('bg-primary/10');
    expect(navigation.className).not.toMatch(/\b(left|right|ml-|mr-|pl-|pr-)\b/);
  });
});
