import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityManager } from './entity-manager';
import type { EntityType } from '../lib/entity-types';
import { server } from '../test/mocks/server';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function renderEntityManager(overrides: { entityType?: EntityType; title?: string; description?: string; imageUploadUrl?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <EntityManager
        entityType={overrides.entityType ?? 'brandsCategories'}
        title={overrides.title ?? 'Brands'}
        description={overrides.description ?? 'Manage brands'}
        imageUploadUrl={overrides.imageUploadUrl}
      />
    </QueryClientProvider>,
  );
}

describe('EntityManager', () => {
  afterEach(() => {
    cleanup();
  });

  it('filters rendered entities based on the search value', async () => {
    server.use(
      http.get('/api/entities/brandsCategories', () => HttpResponse.json({
        writable: true,
        items: [
          { id: '1', name: 'Alpha', status: 'active', tags: ['tag1'], updatedAt: '2026-01-01T00:00:00.000Z' },
          { id: '2', name: 'Beta', status: 'draft', tags: ['tag2'], updatedAt: '2026-01-01T00:00:00.000Z' },
        ],
      })),
    );

    renderEntityManager();

    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText('labels.search'), 'bet');

    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('enables/disables create actions from the server writable flag', async () => {
    server.use(
      http.get('/api/entities/brandsCategories', () =>
        HttpResponse.json({
          writable: true,
          items: [{ id: '1', name: 'Alpha', status: 'active', tags: [], updatedAt: '2026-01-01T00:00:00.000Z' }],
        }),
      ),
    );

    const first = renderEntityManager();
    expect(await screen.findByRole('button', { name: 'actions.toggle' })).not.toBeDisabled();

    first.unmount();
    cleanup();

    server.use(
      http.get('/api/entities/brandsCategories', () =>
        HttpResponse.json({
          writable: false,
          items: [{ id: '1', name: 'Alpha', status: 'active', tags: [], updatedAt: '2026-01-01T00:00:00.000Z' }],
        }),
      ),
    );
    renderEntityManager();
    expect(await screen.findByRole('button', { name: 'actions.toggle' })).toBeDisabled();
  });

  it('creates, toggles, and deletes entities with list refresh side effects', async () => {
    const items = [
      { id: '1', name: 'Alpha', status: 'active', tags: ['tag1'], updatedAt: '2026-01-01T00:00:00.000Z' },
    ];

    server.use(
      http.get('/api/entities/brandsCategories', () => HttpResponse.json({ writable: true, items })),
      http.post('/api/entities/brandsCategories', async ({ request }) => {
        const body = (await request.json()) as { name: string; status: 'active' | 'draft' | 'archived'; tags?: string };
        items.push({
          id: `${items.length + 1}`,
          name: body.name,
          status: body.status,
          tags: body.tags ? [body.tags] : [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        });
        return HttpResponse.json({ ok: true });
      }),
      http.patch('/api/entities/brandsCategories/:id', async ({ request, params }) => {
        const body = (await request.json()) as { status: 'active' | 'draft' | 'archived' };
        const found = items.find((item) => item.id === params.id);
        if (found) found.status = body.status;
        return HttpResponse.json({ ok: true });
      }),
      http.delete('/api/entities/brandsCategories/:id', ({ params }) => {
        const index = items.findIndex((item) => item.id === params.id);
        if (index >= 0) items.splice(index, 1);
        return HttpResponse.json({ ok: true });
      }),
    );

    renderEntityManager();

    expect(await screen.findByText('Alpha')).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText('labels.name'), 'Bravo');
    await userEvent.click(screen.getByRole('button', { name: 'actions.create' }));

    await waitFor(() => {
      expect(screen.getByText('Bravo')).toBeInTheDocument();
    });

    await userEvent.click(screen.getAllByText('actions.toggle')[0]);

    await waitFor(() => {
      expect(screen.getAllByText('status.draft').length).toBeGreaterThan(1);
    });

    await userEvent.click(screen.getAllByText('actions.delete')[1]);

    await waitFor(() => {
      expect(screen.queryByText('Bravo')).not.toBeInTheDocument();
    });
  });

  it('displays image when present in entity', async () => {
    server.use(
      http.get('/api/entities/brands', () =>
        HttpResponse.json({
          writable: true,
          items: [{ id: '1', name: 'BrandX', status: 'active', tags: [], updatedAt: '2025-01-01T00:00:00.000Z', image: 'https://example.com/x.jpg' }],
        }),
      ),
    );

    renderEntityManager({ entityType: 'brands', title: 'Brands', description: 'Manage brands', imageUploadUrl: '/api/uploads/brands' });

    const img = await screen.findByAltText('BrandX');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/x.jpg');
  });

  it('includes image upload field when imageUploadUrl is provided', async () => {
    server.use(
      http.get('/api/entities/categories', () =>
        HttpResponse.json({
          writable: true,
          items: [],
        }),
      ),
    );

    renderEntityManager({ entityType: 'categories', title: 'Categories', description: 'Manage categories', imageUploadUrl: '/api/uploads/categories' });

    expect(await screen.findByText('labels.image')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose image' })).toBeInTheDocument();
  });

  it('enables edit mode and updates entity via full PATCH', async () => {
    const initialItems = [
      { id: '1', name: 'OldName', status: 'active', tags: ['old'], updatedAt: '2025-01-01T00:00:00.000Z', image: '' },
    ];

    server.use(
      http.get('/api/entities/brands', () => HttpResponse.json({ writable: true, items: initialItems })),
      http.patch('/api/entities/brands/1', async ({ request }) => {
        const body = (await request.json()) as { name?: string; status?: string; tags?: string; imageUrl?: string };
        // Update the local item for test verification
        initialItems[0] = { ...initialItems[0], name: body.name ?? initialItems[0].name, status: body.status ?? initialItems[0].status, tags: body.tags ? body.tags.split(',').map((s: string) => s.trim()).filter(Boolean) : initialItems[0].tags };
        return HttpResponse.json({ ok: true });
      }),
    );

    renderEntityManager({ entityType: 'brands', title: 'Brands', description: 'Manage brands', imageUploadUrl: '/api/uploads/brands' });

    // Wait for item to be displayed
    await screen.findByText('OldName');

    // Click edit
    await userEvent.click(screen.getByText('actions.edit'));

    // Edit mode should be active: Update and Cancel buttons appear, Create button hidden
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'actions.update' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'actions.cancel' })).toBeInTheDocument();
    // Ensure the Create button is not present while editing
    expect(screen.queryByRole('button', { name: 'actions.create' })).not.toBeInTheDocument();

    // Form should be populated with existing data
    const nameInput = screen.getByPlaceholderText('labels.name') as HTMLInputElement;
    expect(nameInput.value).toBe('OldName');

    // Change the name
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'NewName');

    // Submit update
    await userEvent.click(screen.getByRole('button', { name: 'actions.update' }));

    // Wait for update to be processed and list refreshed
    await waitFor(() => {
      expect(screen.getByText('NewName')).toBeInTheDocument();
    });
  });

  it('cancels edit mode and resets form', async () => {
    server.use(
      http.get('/api/entities/categories', () =>
        HttpResponse.json({
          writable: true,
          items: [{ id: '2', name: 'CategoryX', status: 'draft', tags: [], updatedAt: '2025-01-01T00:00:00.000Z', image: '' }],
        }),
      ),
    );

    renderEntityManager({ entityType: 'categories', title: 'Categories', description: 'Manage categories', imageUploadUrl: '/api/uploads/categories' });

    await screen.findByText('CategoryX');

    // Click edit
    await userEvent.click(screen.getByText('actions.edit'));

    // Verify form populated
    const nameInputBefore = screen.getByPlaceholderText('labels.name') as HTMLInputElement;
    expect(nameInputBefore.value).toBe('CategoryX');

    // Click cancel
    await userEvent.click(screen.getByRole('button', { name: 'actions.cancel' }));

    // After cancel, editing should be cleared and form reset to defaults
    await waitFor(() => {
      const nameInput = screen.getByPlaceholderText('labels.name') as HTMLInputElement;
      expect(nameInput.value).toBe('');
    });
    // Create button should be back
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'actions.create' })).toBeInTheDocument();
    });
    // Edit button should be enabled again
    await waitFor(() => {
      expect(screen.getByText('actions.edit')).not.toBeDisabled();
    });
  });
});
