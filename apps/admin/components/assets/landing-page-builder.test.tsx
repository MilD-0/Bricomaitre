import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { landingPageDocumentSchema } from '@bric/storefront-core/landing-pages';
import { http, HttpResponse } from 'msw';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { server } from '../../test/mocks/server';
import { LandingPageBuilder, type LandingPageDetail } from './landing-page-builder';

const page: LandingPageDetail = {
  id: 7,
  productId: 10,
  productTitle: 'Cordless drill',
  productSlug: 'cordless-drill',
  locale: 'fr',
  slug: 'cordless-drill-7',
  active: false,
  currentRevision: 3,
  updatedAt: '2026-08-18T00:00:00.000Z',
  document: landingPageDocumentSchema.parse({
    seo: { title: 'Cordless drill', description: 'A campaign for the drill.', indexable: true },
    blocks: [
      {
        id: 'hero',
        type: 'product-hero',
        heading: 'Cordless drill',
        primaryCtaLabel: 'Order',
      },
      {
        id: 'benefits',
        type: 'benefit-grid',
        heading: 'Benefits',
        items: [
          { title: 'Compact', description: 'Easy to carry.', icon: 'tool' },
          { title: 'Reliable', description: 'Ready for work.', icon: 'shield' },
        ],
      },
      {
        id: 'final',
        type: 'final-cta',
        heading: 'Order now',
        primaryCtaLabel: 'Order',
      },
    ],
  }),
};

function renderBuilder() {
  return render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <LandingPageBuilder initialPage={page} storefrontBaseUrl="https://bricomaitre.com" />
    </NextIntlClientProvider>,
  );
}

describe('LandingPageBuilder', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('uses sticky document chrome and keeps product identity visible on mobile', () => {
    const view = renderBuilder();
    expect(view.container.querySelectorAll('[data-workspace-frame]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-workspace-header]')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Cordless drill' })).toHaveClass(
      'text-xl',
    );
    expect(screen.getByText('Revision 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('edits structured repeated content without newline or pipe protocols', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole('button', { name: /2 · Benefits/ }));
    const editor = screen.getByRole('main');
    expect(within(editor).getAllByRole('textbox', { name: 'Title' })[0]).toHaveValue('Compact');
    await user.click(within(editor).getByRole('button', { name: 'Add item' }));
    expect(within(editor).getAllByRole('textbox', { name: 'Title' })).toHaveLength(3);
    expect(screen.queryByText(/one per line|\|/i)).not.toBeInTheDocument();
  });

  it('keeps empty text collections as structured text rows', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Add block' }), 'media-feature');
    const editor = screen.getByRole('main');
    await user.click(within(editor).getByRole('button', { name: 'Add item' }));
    expect(within(editor).getByRole('textbox', { name: 'Bullet points 1' })).toHaveValue('');
  });

  it('creates one revision through the save-and-active contract and clears dirty state', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> | null = null;
    server.use(
      http.patch('/api/landing-pages/7', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 7, active: true, currentRevision: 4 });
      }),
    );
    renderBuilder();
    expect(screen.getByRole('link', { name: 'Preview saved page' })).toHaveAttribute(
      'href',
      '/api/landing-pages/7?view=preview',
    );
    await user.click(screen.getByRole('switch', { name: 'Status · Inactive' }));
    expect(screen.queryByRole('link', { name: 'View live page' })).not.toBeInTheDocument();
    const title = screen.getByRole('textbox', { name: 'Browser and social title' });
    await user.clear(title);
    await user.type(title, 'Drill campaign');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(body).toMatchObject({ action: 'save-active', active: true, expectedRevision: 3 }),
    );
    expect(body).toMatchObject({
      document: { seo: { indexable: false } },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled());
    expect(screen.getByText(/Revision 4/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'View live page' })).toHaveAttribute(
      'href',
      'https://bricomaitre.com/fr/landing/cordless-drill-7',
    );
    expect(screen.getByRole('link', { name: 'Preview saved page' })).toHaveAttribute(
      'href',
      '/api/landing-pages/7?view=preview',
    );
  });

  it('preserves unsaved work and offers reload after a stale revision conflict', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch('/api/landing-pages/7', () =>
        HttpResponse.json({ error: 'Changed elsewhere.', code: 'stale_revision' }, { status: 409 }),
      ),
    );
    renderBuilder();
    const title = screen.getByRole('textbox', { name: 'Browser and social title' });
    await user.clear(title);
    await user.type(title, 'My unsaved campaign');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/newer revision exists/i)).toBeVisible();
    expect(title).toHaveValue('My unsaved campaign');
    expect(screen.getByRole('button', { name: 'Reload latest revision' })).toBeVisible();
  });

  it('guards navigation while dirty and keeps required blocks non-deletable', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderBuilder();
    await user.type(screen.getByRole('textbox', { name: 'Browser and social title' }), '!');
    const back = screen.getByRole('link', { name: 'Back to outline' });
    expect(fireEvent.click(back)).toBe(false);
    expect(confirm).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Product hero · More/ }));
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument();
    fireEvent(window, new Event('beforeunload', { cancelable: true }));
  });
});
